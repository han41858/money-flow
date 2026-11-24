import { setTimeout as wait } from 'node:timers/promises';
import { CorrectableEditError } from './workspace.mjs';
import { agents, config } from './config.mjs';

// Only messages composed here from fixed labels may be published to the issue.
class ModelError extends Error {
  constructor(message) {
    super(message);
    this.diagnostic = message;
  }
}

const object = (properties) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const string = { type: 'string' };
const integer = { type: 'integer' };
const nullableText = { anyOf: [string, { type: 'null' }] };

export const developmentSchema = object({
  status: { type: 'string', enum: ['completed', 'in_progress', 'needs_human'] },
  title: string,
  summary: string,
  edits: {
    type: 'array',
    items: object({ path: string, before: nullableText, after: nullableText }),
  },
});

export const reviewSchema = object({
  status: {
    type: 'string',
    enum: ['pass', 'changes_requested', 'needs_human'],
  },
  summary: string,
  findings: {
    type: 'array',
    items: object({
      path: string,
      line: integer,
      defect: string,
      impact: string,
      evidence: string,
      fix: string,
    }),
  },
});

const tools = {
  list_files: {
    description:
      'Find tracked paths by case-insensitive substring. Use offset 0 for the first page.',
    input: object({ query: string, offset: integer }),
  },
  find_in_file: {
    description:
      'Locate a literal UI label or symbol within a tracked text file. Returns matching line numbers for targeted read_file calls.',
    input: object({ path: string, text: string }),
  },
  read_file: {
    description:
      'Read tracked UTF-8 text with line numbers. Use line 1 to start.',
    input: object({ path: string, line: integer }),
  },
  read_diff: {
    description:
      'Read the complete PR diff from the original base to the current HEAD, paged by line.',
    input: object({ line: integer }),
  },
};

function validate(value, schema, label) {
  if (schema.anyOf) {
    if (value === null || typeof value === 'string') return;
  } else if (
    schema.type === 'object' &&
    value &&
    typeof value === 'object' &&
    !Array.isArray(value)
  ) {
    if (
      Object.keys(value).length === schema.required.length &&
      schema.required.every((key) => Object.hasOwn(value, key))
    ) {
      for (const [key, child] of Object.entries(schema.properties))
        validate(value[key], child, `${label}.${key}`);
      return;
    }
  } else if (schema.type === 'array' && Array.isArray(value)) {
    for (const item of value) validate(item, schema.items, label);
    return;
  } else if (schema.type === 'integer' && Number.isSafeInteger(value)) {
    return;
  } else if (
    schema.type === 'string' &&
    typeof value === 'string' &&
    (!schema.enum || schema.enum.includes(value))
  ) {
    return;
  }
  throw new ModelError(`AI 결과의 JSON 형식이 올바르지 않습니다 (${label}).`);
}

// Provider text can contain request data. Store only fixed diagnostic labels.
function providerReason(error) {
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

function providerField(error) {
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

function claudeAssistantContent(blocks) {
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

// A standalone progress note carries no request for a human decision.
function isCheckpoint(summary) {
  return (
    typeof summary === 'string' &&
    /^[\s(]*(?:중간\s*)?(?:확인|점검)\s*(?:단계|중(?:입니다)?)[)\s.!…]*$/u.test(
      summary,
    )
  );
}

export function validateReview(value) {
  validate(value, reviewSchema, 'review');
  if (!value.summary.trim()) throw new ModelError('리뷰 요약이 비어 있습니다.');
  if (value.summary.length > 900)
    throw new ModelError(`리뷰 요약 길이 초과 (${value.summary.length}/900).`);
  if (value.findings.length > 6)
    throw new ModelError(`리뷰 지적 개수 초과 (${value.findings.length}/6).`);
  if (value.status === 'pass' && value.findings.length)
    throw new ModelError(
      'pass에 지적 사항이 있습니다. 지적을 보존하고 판정을 확인하세요.',
    );
  if (value.status === 'changes_requested' && !value.findings.length)
    throw new ModelError(
      'changes_requested에는 근거가 있는 지적 사항이 필요합니다.',
    );
  for (const [index, { line, ...fields }] of value.findings.entries()) {
    if (line < 1)
      throw new ModelError(
        `리뷰 지적 ${index + 1}의 line은 1 이상이어야 합니다.`,
      );
    for (const [name, field] of Object.entries(fields)) {
      if (!field.trim())
        throw new ModelError(
          `리뷰 지적 ${index + 1}의 ${name}이 비어 있습니다.`,
        );
      if (field.length > 350)
        throw new ModelError(
          `리뷰 지적 ${index + 1}의 ${name} 길이 초과 (${field.length}/350).`,
        );
    }
  }
  return value;
}

const developmentSummaryLimit = 1200;

function titleProblem(title) {
  if (title.length > 100) return `제목 길이 초과 (${title.length}/100).`;
  if (/[\r\n<>@\u202a-\u202e]/.test(title))
    return '제목에 줄바꿈 또는 허용되지 않는 문자가 있습니다.';
  if (!/^\p{Extended_Pictographic}/u.test(title))
    return '제목 첫 글자에 실제 GitMoji 이모지가 필요합니다.';
  if (!/^\p{Extended_Pictographic}.*? [^\n:]+: .*[가-힣]/u.test(title))
    return '제목을 “🎨 화면: 팝업 수정”처럼 영역과 한국어 요약으로 작성하세요.';
}

export function validateDevelopment(
  value,
  maxEdits = config.limits.edits,
  issueTitle,
) {
  validate(value, developmentSchema, 'development');
  if (!value.summary.trim())
    throw new ModelError('개발 결과의 요약이 비어 있습니다.');
  if (value.summary.length > developmentSummaryLimit)
    throw new ModelError(
      `개발 요약 길이 초과 (${value.summary.length}/${developmentSummaryLimit}).`,
    );
  if (value.edits.length > maxEdits)
    throw new ModelError(
      `개발 편집 개수 초과 (${value.edits.length}/${maxEdits}).`,
    );
  if (value.status === 'completed') {
    const problem = titleProblem(value.title);
    if (problem) {
      if (typeof issueTitle === 'string' && !titleProblem(issueTitle))
        return { ...value, title: issueTitle };
      throw new ModelError(`개발 결과: ${problem}`);
    }
  }
  return value;
}

// Yields the JSON payload of each server-sent event; `touch` runs whenever bytes arrive.
// Reads race the abort signal so a silent stream ends even if the body ignores the signal.
async function* serverEvents(body, touch, signal) {
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
async function readCodexStream(events) {
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
async function readClaudeStream(events) {
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

export function createModels({
  keys,
  modelNames,
  limits = config.limits,
  request = fetch,
  beforeRequest = async () => {},
  sleep = wait,
  log = console.log,
}) {
  function verify() {
    if (!keys.codex || !keys.claude)
      throw new ModelError(
        'OPENAI_API_KEY와 ANTHROPIC_API_KEY Actions Secrets를 모두 설정한 뒤 수동 재개하세요.',
      );
  }

  async function call(agent, body, mode, turn) {
    const isCodex = agent === 'codex';
    const name = agents[agent].name;
    const endpoint = isCodex
      ? 'https://api.openai.com/v1/responses'
      : 'https://api.anthropic.com/v1/messages';
    const headers = {
      'content-type': 'application/json',
      ...(isCodex
        ? { authorization: `Bearer ${keys[agent]}` }
        : { 'x-api-key': keys[agent], 'anthropic-version': '2023-06-01' }),
    };
    // The provider may already have processed a request with an unknown transport outcome.
    const stage = `${mode === 'review' ? '리뷰' : '개발'} 요청 ${turn}회차`;
    for (let attempt = 0; attempt < 2; attempt++) {
      await beforeRequest();
      const idle = new AbortController();
      let timer;
      const touch = () => {
        clearTimeout(timer);
        timer = setTimeout(() => idle.abort(), limits.idleTimeout);
      };
      let response;
      let rejectionReason;
      const timeout = AbortSignal.timeout(limits.requestTimeout);
      try {
        touch();
        const signal = AbortSignal.any([idle.signal, timeout]);
        response = await request(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({ ...body, stream: true }),
          signal,
        });
        if (response.ok) {
          if (
            !response.headers.get('content-type')?.includes('text/event-stream')
          )
            return await response.json();
          const events = serverEvents(response.body, touch, signal);
          return await (isCodex
            ? readCodexStream(events)
            : readClaudeStream(events));
        }
        const payload = await response.json().catch(() => null);
        rejectionReason =
          providerReason(payload?.error) + providerField(payload?.error);
      } catch (error) {
        const reason = timeout.aborted
          ? '요청 시간 초과'
          : idle.signal.aborted
            ? '응답 대기 시간 초과'
            : (error?.streamReason ??
              (response
                ? '응답 본문 수신 또는 해석 실패'
                : 'HTTP 응답 수신 실패'));
        throw new ModelError(
          `${name} API 응답을 확인할 수 없습니다. (${stage}, ${reason})`,
        );
      } finally {
        clearTimeout(timer);
      }
      const id = response.headers.get(isCodex ? 'x-request-id' : 'request-id');
      const requestId =
        id && /^[A-Za-z0-9_-]{1,100}$/.test(id) ? `, request_id=${id}` : '';
      const status = response.status;
      const retryAfter = response.headers.get('retry-after');
      if (!attempt && (status === 429 || status === 503 || status === 529)) {
        const seconds = retryAfter === null ? 2 : Number(retryAfter);
        if (Number.isFinite(seconds) && seconds >= 0 && seconds <= 10) {
          await sleep(seconds * 1000);
          continue;
        }
      }
      throw Object.assign(
        new Error(
          `${name} API HTTP ${status}. (${stage}, ${rejectionReason}${requestId})`,
        ),
        {
          diagnostic: `${name} API HTTP ${status} (${stage}, ${rejectionReason}${requestId})`,
          requestRejected: [400, 401, 403, 404, 422, 429].includes(status),
        },
      );
    }
  }

  return {
    verify,
    async run({
      agent,
      mode,
      instructions,
      context,
      inspect,
      issueTitle,
      prepareChanges,
      needsUiSpec,
    }) {
      const schema = mode === 'development' ? developmentSchema : reviewSchema;
      const verifyResult =
        mode === 'development'
          ? (value) => validateDevelopment(value, limits.edits, issueTitle)
          : validateReview;
      const input = [{ role: 'user', content: context }];
      const isCodex = agent === 'codex';
      const model = modelNames[agent];
      const turnLimit =
        mode === 'review' ? (limits.reviewTurns ?? limits.turns) : limits.turns;
      const reviewFormat =
        'Keep the Korean summary under 400 characters. Use at most 6 findings, with each string under 250 characters and a positive line number. pass requires zero findings; changes_requested requires at least one. For needs_human, identify the concrete blocker.';
      const developmentFormat = `Return a nonempty Korean summary of at most ${developmentSummaryLimit} UTF-16 code units and at most ${limits.edits} exact edits. Use a single-line GitMoji Korean title of at most 100 UTF-16 code units. For unfinished development use in_progress; no partial edits will be published. Use the read tools for intermediate checks. Reserve needs_human for a blocker that requires a decision or information from the user. If the full change cannot fit safely, return needs_human with a concrete reason and no edits.`;
      const taskInstructions =
        instructions +
        '\n' +
        (mode === 'review' ? reviewFormat : developmentFormat);
      let correction;
      let promptedForSpec = false;
      let reviewCanPass = true;
      const missingBlocker =
        '자동화가 사람 확인을 요청했지만 구체적인 중단 사유를 제공하지 않았습니다.';
      const unexplainedStop = {
        status: 'needs_human',
        ...(mode === 'review' ? { findings: [] } : { title: '', edits: [] }),
        summary: missingBlocker,
      };
      let toolCalls = 0;
      for (let turn = 1; turn <= turnLimit; turn++) {
        const started = performance.now();
        const finalTurn =
          turn === turnLimit || (Boolean(correction) && correction !== 'edits');
        // Reserve the last review request for repairing an invalid verdict.
        const remainingReads = Math.min(
          limits.toolCallsPerTurn,
          limits.toolCallsTotal - toolCalls,
        );
        const requireResult =
          remainingReads === 0 || finalTurn || turn === turnLimit - 1;
        const turnInstructions = requireResult
          ? `${taskInstructions}
Return the final structured result now. If evidence is insufficient, return needs_human with the specific blocker.`
          : `${taskInstructions}
API requests remaining, including this one: ${turnLimit - turn + 1}. Read tools allowed this turn: ${remainingReads}. Return the final structured result once you have enough evidence.`;
        function readTool(index, name, args) {
          if (requireResult)
            throw new ModelError(
              '최종 결과 요청 중 탐색 호출이 반환되었습니다.',
            );
          if (index >= remainingReads)
            return 'Not executed: read budget for this turn reached. Use the returned evidence or prioritize this read next turn if budget remains.';
          toolCalls++;
          return invokeTool(inspect, name, isCodex ? parseJSON(args) : args);
        }
        const data = await call(
          agent,
          isCodex
            ? {
                model,
                instructions: turnInstructions,
                input,
                store: false,
                include: ['reasoning.encrypted_content'],
                max_output_tokens: limits.outputTokens,
                reasoning: { effort: limits.codexEffort },
                text: {
                  format: {
                    type: 'json_schema',
                    name: mode,
                    schema,
                    strict: true,
                  },
                },
                ...(requireResult ? { tool_choice: 'none' } : {}),
                tools: Object.entries(tools).map(
                  ([name, { description, input }]) => ({
                    type: 'function',
                    name,
                    description,
                    parameters: input,
                    strict: true,
                  }),
                ),
              }
            : {
                model,
                system: taskInstructions,
                messages: input,
                max_tokens: limits.outputTokens,
                output_config: { format: { type: 'json_schema', schema } },
                ...(requireResult ? { tool_choice: { type: 'none' } } : {}),
                tools: Object.entries(tools).map(
                  ([name, { description, input }]) => ({
                    name,
                    description,
                    input_schema: input,
                    strict: true,
                  }),
                ),
              },
          mode,
          turn,
        ).catch((error) => {
          log(
            JSON.stringify({
              agent,
              mode,
              model,
              turn,
              ok: false,
              diagnostic: error.diagnostic,
              elapsedMs: Math.round(performance.now() - started),
            }),
          );
          if (correction === 'blocker') return null;
          throw error;
        });
        if (
          correction === 'blocker' &&
          (!data ||
            (isCodex
              ? data.status !== 'completed' ||
                data.output?.some(({ type }) => type === 'function_call')
              : data.stop_reason !== 'end_turn') ||
            data.incomplete_details?.reason === 'max_output_tokens')
        )
          return unexplainedStop;
        const usage = Object.fromEntries(
          Object.entries(data.usage ?? {}).filter(
            ([, count]) => typeof count === 'number',
          ),
        );
        log(
          JSON.stringify({
            agent,
            mode,
            model,
            turn,
            usage,
            elapsedMs: Math.round(performance.now() - started),
          }),
        );
        if (
          data.incomplete_details?.reason === 'max_output_tokens' ||
          data.stop_reason === 'max_tokens'
        )
          throw Object.assign(
            new ModelError(
              `${agents[agent].name} 응답이 출력 토큰 한도에 도달했습니다.`,
            ),
            { outputLimitReached: true },
          );
        let text;
        const output = (isCodex ? data.output : data.content) ?? [];
        if (isCodex) {
          if (data.status !== 'completed')
            throw new ModelError('Codex 응답이 완료되지 않았습니다.');
          const calls = output.filter(({ type }) => type === 'function_call');
          if (calls.length) {
            if (correction && correction !== 'edits')
              throw new ModelError('결과 교정 중 도구 호출이 반환되었습니다.');
            input.push(
              ...output,
              ...calls.map(({ name, arguments: args, call_id }, index) => ({
                type: 'function_call_output',
                call_id,
                output: readTool(index, name, args),
              })),
            );
            continue;
          }
          text = output
            .flatMap(({ content }) => content ?? [])
            .filter(({ type }) => type === 'output_text')
            .map(({ text }) => text)
            .join('');
        } else {
          if (data.stop_reason === 'tool_use') {
            if (correction && correction !== 'edits')
              throw new ModelError('결과 교정 중 도구 호출이 반환되었습니다.');
            const calls = output.filter(({ type }) => type === 'tool_use');
            if (!calls.length)
              throw new ModelError(
                'Claude 도구 호출 응답에 실행할 도구가 없습니다.',
              );
            const results = calls.map(({ name, input: args, id }, index) => ({
              type: 'tool_result',
              tool_use_id: id,
              content: readTool(index, name, args) || 'No matching lines.',
            }));
            input.push(
              { role: 'assistant', content: claudeAssistantContent(output) },
              { role: 'user', content: results },
            );
            continue;
          }
          if (data.stop_reason !== 'end_turn')
            throw new ModelError('Claude 응답이 완료되지 않았습니다.');
          text = output
            .filter((block) => block.type === 'text')
            .map((block) => block.text)
            .join('');
        }
        let result;
        try {
          result = parseJSON(text);
          if (correction === 'blocker' && result?.status !== 'needs_human')
            return unexplainedStop;
          if (mode === 'development' && result?.status === 'in_progress') {
            validateDevelopment(result, limits.edits, issueTitle);
            if (finalTurn || correction)
              return {
                status: 'needs_human',
                title: '',
                summary: '개발 호출 한도 내에 최종 변경을 확인하지 못했습니다.',
                edits: [],
              };
            input.push(
              ...(isCodex
                ? output
                : [
                    {
                      role: 'assistant',
                      content: claudeAssistantContent(output),
                    },
                  ]),
              {
                role: 'user',
                content:
                  'Continue in this conversation. Only a complete, validated final set of edits can be published.',
              },
            );
            continue;
          }
          if (
            result?.status === 'needs_human' &&
            (typeof result.summary !== 'string' ||
              isCheckpoint(result.summary) ||
              !/[\p{L}\p{N}]/u.test(result.summary))
          ) {
            if (finalTurn) return unexplainedStop;
            correction = 'blocker';
            throw new ModelError(missingBlocker);
          }
          if (mode === 'review' && result?.status === 'pass' && !reviewCanPass)
            throw new ModelError(
              '교정 과정에서 기존 수정 요청이나 지적을 승인으로 변경할 수 없습니다.',
            );
          const verified = verifyResult(result);
          if (
            ['completed', 'pass'].includes(verified.status) &&
            needsUiSpec?.(verified.edits?.map(({ path }) => path))
          ) {
            const message =
              '관련 UI 테스트 본문을 확인하지 않아 개발 완료 또는 리뷰 승인을 기록할 수 없습니다.';
            if (promptedForSpec || requireResult || correction) {
              return {
                status: 'needs_human',
                summary: message,
                ...(mode === 'review'
                  ? { findings: [] }
                  : { title: '', edits: [] }),
              };
            }
            promptedForSpec = true;
            input.push(
              ...(isCodex
                ? output
                : [
                    {
                      role: 'assistant',
                      content: claudeAssistantContent(output),
                    },
                  ]),
              {
                role: 'user',
                content:
                  'Read the relevant tests/*.spec.ts using read_file. Compare its locators and assertions with the changed behavior, including role, accessible name and interaction. Then return the complete plan or review verdict. Request changes for stale or missing coverage.',
              },
            );
            continue;
          }
          if (
            mode === 'development' &&
            verified.status === 'completed' &&
            prepareChanges
          )
            return {
              ...verified,
              changes: await prepareChanges(verified.edits),
            };
          return verified;
        } catch (error) {
          if (
            correction === 'blocker' &&
            finalTurn &&
            error instanceof ModelError
          )
            return unexplainedStop;
          if (
            (mode !== 'review' &&
              correction !== 'blocker' &&
              result?.status !== 'completed') ||
            finalTurn ||
            correction === 'edits' ||
            !(
              error instanceof ModelError ||
              error instanceof CorrectableEditError
            )
          )
            throw error;
          if (
            mode === 'review' &&
            (result?.status === 'changes_requested' ||
              result?.status === 'needs_human' ||
              (Array.isArray(result?.findings) && result.findings.length))
          )
            reviewCanPass = false;
          correction ??= error instanceof CorrectableEditError ? 'edits' : mode;
          const responseItems = isCodex
            ? output
            : [{ role: 'assistant', content: claudeAssistantContent(output) }];
          input.push(...responseItems, {
            role: 'user',
            content:
              correction === 'blocker'
                ? 'Keep the needs_human decision. Explain in Korean the specific blocker and what information the user must provide. Use the evidence already collected.'
                : correction === 'edits'
                  ? `The proposed edits could not be applied: ${error.message}. Read the affected source if necessary and return the complete corrected plan against the same HEAD. Earlier edits in the plan apply in order. Preserve all requested changes; if blocked, explain why. ${developmentFormat}`
                  : correction === 'development'
                    ? `Correct the development JSON using the same evidence and preserve the full requested behavior. Do not discard necessary edits to fit. Validation: ${error.message}. ${developmentFormat}`
                    : `Return the corrected review JSON using the same evidence and verdict. Preserve substantive findings. If pass conflicts with findings, report changes_requested with evidence or needs_human if unresolved. Never invent findings. Validation: ${error.message}. ${reviewFormat}`,
          });
        }
      }
      throw new ModelError(
        'AI의 저장소 탐색 최대 횟수에 도달했습니다. Issue 범위를 좁힌 뒤 수동 재개하세요.',
      );
    },
  };
}

function parseJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new ModelError('AI가 유효한 JSON을 반환하지 않았습니다.');
  }
}

function invokeTool(inspect, name, input) {
  if (!Object.hasOwn(tools, name)) return 'Unknown tool.';
  try {
    validate(input, tools[name].input, 'tool');
    return inspect(name, input);
  } catch {
    return 'Invalid arguments or requested material is unavailable.';
  }
}
