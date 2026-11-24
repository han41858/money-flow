export const config = {
  limits: {
    turns: 15,
    reviewTurns: 15,
    outputTokens: 12_000,
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
