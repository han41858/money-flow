import { ModelError } from './model-results.mjs';

// Provider text can contain request data. Store only fixed diagnostic labels.
export function providerReason(error) {
  const message = typeof error?.message === 'string' ? error.message : '';
  if (/thinking|redacted_thinking|signature/i.test(message))
    return '추론 블록 또는 서명';
  if (/credit balance|billing|insufficient.quota/i.test(message))
    return '결제 또는 사용량';
  if (
    /context.length|max(?:imum)? context|prompt is too long|too many input tokens/i.test(
      message,
    )
  )
    return '입력 길이 한도';
  if (/tool_use|tool_result|function_call|tool call/i.test(message))
    return '도구 호출 형식';
  if (
    /json.schema|output_config|response_format|structured output/i.test(message)
  )
    return '구조화 응답 형식';
  if (/max_tokens|max_output_tokens/i.test(message)) return '출력 토큰 설정';
  if (
    /model/i.test(message) &&
    /not found|not supported|access|invalid/i.test(message)
  )
    return '모델 설정 또는 접근 권한';
  switch (error?.type ?? error?.code) {
    case 'authentication_error':
    case 'permission_error':
      return '인증 또는 접근 권한';
    case 'rate_limit_error':
    case 'overloaded_error':
    case 'server_error':
    case 'api_error':
      return 'API 한도 또는 공급자 장애';
    case 'invalid_request_error':
      return '잘못된 요청';
    default:
      return '세부 분류 없음';
  }
}

export function providerField(error) {
  if (typeof error?.message !== 'string') return '';
  // Match only recognized request fields and bounded decimal indexes.
  const field = error.message.match(
    /^(messages\.\d{1,3}\.content\.\d{1,3}(?:\.(?:text|thinking|signature|input|tool_use_id|type))?|system|model|max_tokens|output_config)(?=\s*:)/,
  )?.[1];
  return field ? `, 필드 ${field}` : '';
}

function streamError(reason) {
  return Object.assign(new Error(reason), { streamReason: reason });
}

export function claudeAssistantContent(blocks) {
  return blocks.flatMap((block) => {
    switch (block.type) {
      case 'text': {
        const { text, citations } = block;
        return text.trim()
          ? [{ type: 'text', text, ...(citations?.length && { citations }) }]
          : [];
      }
      case 'tool_use': {
        const { id, name, input } = block;
        return [{ type: 'tool_use', id, name, input }];
      }
      // Claude validates the signature of thinking blocks on continuation.
      case 'thinking':
      case 'redacted_thinking':
        return [block];
      default:
        throw new ModelError(
          'Claude 도구 호출에 지원하지 않는 응답 블록이 있습니다.',
        );
    }
  });
}

// Yields the JSON payload of each server-sent event; `touch` runs whenever bytes arrive.
// Reads race the abort signal so a silent stream ends even if the body ignores the signal.
export async function* serverEvents(body, touch, signal) {
  const reader = body.getReader();
  const aborted = new Promise((_, reject) => {
    const fail = () => reject(new Error('aborted'));
    if (signal.aborted) fail();
    else signal.addEventListener('abort', fail, { once: true });
  });
  aborted.catch(() => {});
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) return;
      touch();
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop();
      for (const block of blocks) {
        const data = block
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (!data || data === '[DONE]') continue;
        yield JSON.parse(data);
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

// The terminal event of a Responses stream carries the same object a non-streaming call returns.
export async function readCodexStream(events) {
  for await (const event of events) {
    if (event.type === 'error')
      throw streamError(
        `공급자 오류 이벤트: ${providerReason(event.error ?? event)}`,
      );
    if (
      ['response.completed', 'response.incomplete', 'response.failed'].includes(
        event.type,
      )
    )
      return event.response;
  }
  throw streamError('완료 이벤트 없이 스트림 종료');
}

// Rebuilds the Message a non-streaming call returns from its incremental events.
export async function readClaudeStream(events) {
  let message;
  const partialInputs = new Map();
  for await (const event of events) {
    if (event.type === 'error')
      throw streamError(`공급자 오류 이벤트: ${providerReason(event.error)}`);
    if (event.type === 'message_start') {
      message = { ...event.message, content: [] };
    } else if (!message) {
      continue;
    } else if (event.type === 'content_block_start') {
      message.content[event.index] = { ...event.content_block };
      if (event.content_block.type === 'tool_use')
        partialInputs.set(event.index, '');
    } else if (event.type === 'content_block_delta') {
      const block = message.content[event.index];
      const { delta } = event;
      if (delta.type === 'text_delta') block.text += delta.text;
      else if (delta.type === 'citations_delta')
        block.citations = [...(block.citations ?? []), delta.citation];
      else if (delta.type === 'input_json_delta')
        partialInputs.set(
          event.index,
          partialInputs.get(event.index) + delta.partial_json,
        );
      else if (delta.type === 'thinking_delta')
        block.thinking += delta.thinking;
      else if (delta.type === 'signature_delta')
        block.signature = (block.signature ?? '') + delta.signature;
    } else if (event.type === 'content_block_stop') {
      if (partialInputs.has(event.index)) {
        const json = partialInputs.get(event.index);
        if (json) message.content[event.index].input = JSON.parse(json);
      }
    } else if (event.type === 'message_delta') {
      Object.assign(message, event.delta);
      message.usage = { ...message.usage, ...event.usage };
    } else if (event.type === 'message_stop') {
      return message;
    }
  }
  throw streamError('완료 이벤트 없이 스트림 종료');
}
