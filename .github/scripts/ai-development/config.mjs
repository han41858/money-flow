export const config = {
  limits: {
    turns: 15,
    reviewTurns: 15,
    outputTokens: 12_000,
    codexRetryOutputTokens: 18_000,
    codexRetryRequestTimeout: 240_000,
    edits: 25,
    toolCallsPerTurn: 4,
    toolCallsTotal: 24,
    idleTimeout: 120_000,
    requestTimeout: 180_000,
    codexEffort: 'medium',
  },
};

export const agents = {
  codex: { name: 'Codex', email: 'noreply@openai.com' },
  claude: { name: 'Claude', email: 'noreply@anthropic.com' },
};

export const uiSpecUnreadMessage =
  '관련 UI 테스트 본문을 확인하지 않아 개발 완료 또는 리뷰 승인을 기록할 수 없습니다.';
