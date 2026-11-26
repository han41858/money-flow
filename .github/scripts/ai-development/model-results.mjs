import { config } from './config.mjs';

// Only messages composed here from fixed labels may be published to the issue.
export class ModelError extends Error {
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
    enum: ['pass', 'changes_requested', 'verification_needed', 'needs_human'],
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

export const tools = {
  list_files: {
    description:
      '대소문자를 구분하지 않고 부분 문자열로 Git에서 추적하는 경로를 찾습니다. 첫 페이지의 offset은 0을 사용하세요.',
    input: object({ query: string, offset: integer }),
  },
  find_in_file: {
    description:
      '추적 중인 텍스트 파일에서 UI 레이블이나 기호를 문자열 그대로 찾습니다. read_file로 필요한 부분을 읽을 수 있도록 일치하는 줄 번호를 반환합니다.',
    input: object({ path: string, text: string }),
  },
  read_file: {
    description:
      '추적 중인 UTF-8 텍스트를 줄 번호와 함께 읽습니다. 처음부터 읽으려면 line에 1을 사용하세요.',
    input: object({ path: string, line: integer }),
  },
  read_diff: {
    description:
      '최초 기준 커밋부터 현재 HEAD까지의 전체 PR 변경 내역을 줄 단위로 페이지를 나눠 읽습니다.',
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

// A standalone progress note carries no request for a human decision.
export function isCheckpoint(summary) {
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

export const developmentSummaryLimit = 1200;

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

export function parseJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new ModelError('AI가 유효한 JSON을 반환하지 않았습니다.');
  }
}

export function invokeTool(inspect, name, input) {
  if (!Object.hasOwn(tools, name)) return '알 수 없는 도구입니다.';
  try {
    validate(input, tools[name].input, 'tool');
    return inspect(name, input);
  } catch {
    return '인수가 올바르지 않거나 요청한 자료를 사용할 수 없습니다.';
  }
}
