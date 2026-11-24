import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertPull,
  authorized,
  canRestartPreflight,
  createGitHub,
  fingerprint,
  issueMarker,
  readState,
  safeText,
  selectCurrentCI,
} from './github.mjs';
import { createModels, validateReview } from './models.mjs';
import { resolveEdits } from './workspace.mjs';

const issue = {
  title: 'Example',
  body: 'Example task',
  state: 'open',
  labels: [{ name: 'ai:develop' }],
};
const branch = 'ai/issue-10';
const head = 'a'.repeat(40);
const repo = { full_name: 'han41858/money-flow' };

test('이슈 범위와 중단 라벨을 확인한다', () => {
  assert(authorized(issue));
  assert(!authorized({ ...issue, state: 'closed' }));
  assert(!authorized({ ...issue, labels: [] }));
  assert(
    !authorized({ ...issue, labels: [...issue.labels, { name: 'ai:stop' }] }),
  );
  assert.notEqual(
    fingerprint(issue),
    fingerprint({ ...issue, body: 'new scope' }),
  );
});

test('일반 사용자가 남긴 상태 표식은 무시한다', () => {
  const state = { version: 1, issue: 10, status: 'waiting_ci' };
  const body = (value) =>
    '<!-- money-flow-ai-state:' +
    Buffer.from(JSON.stringify(value)).toString('base64') +
    ' -->';
  assert.deepEqual(
    readState(
      [
        {
          user: { login: 'github-actions[bot]', type: 'Bot' },
          body: body(state),
        },
        {
          user: { login: 'someone', type: 'User' },
          body: body({ ...state, status: 'completed' }),
        },
      ],
      10,
    ),
    state,
  );
  assert(
    !safeText('@someone [external](https://example.org)').includes('https://'),
  );
});

test('다른 저장소, 브랜치, HEAD 또는 이벤트의 CI는 사용하지 않는다', () => {
  const run = {
    event: 'pull_request',
    head_sha: head,
    head_branch: branch,
    head_repository: repo,
  };
  const state = { head, branch, pr: 15 };
  assert.equal(
    selectCurrentCI(
      [
        { ...run, head_sha: 'b'.repeat(40) },
        { ...run, head_branch: 'other' },
        { ...run, event: 'push' },
        { ...run, head_repository: { full_name: 'another/repo' } },
        { ...run, pull_requests: [{ number: 16, base: { ref: 'dev' } }] },
        run,
      ],
      state,
    ),
    run,
  );
  const pull = {
    number: 15,
    body: issueMarker(10),
    base: { ref: 'dev', repo },
    head: { ref: branch, repo, sha: head },
  };
  assert.doesNotThrow(() => assertPull(pull, { ...state, issue: 10 }));
  assert.throws(() =>
    assertPull(
      { ...pull, head: { ...pull.head, sha: 'b'.repeat(40) } },
      { ...state, issue: 10 },
    ),
  );
});

test('정확한 편집을 적용하고 보호 경로와 중복 원문을 거부한다', () => {
  const path = 'src/example.ts';
  const work = {
    files: new Map([[path, '100644']]),
    read: () => 'one two one',
  };
  assert.deepEqual(
    resolveEdits([{ path, before: 'two', after: 'three' }], work),
    [{ path, text: 'one three one' }],
  );
  assert.throws(() =>
    resolveEdits([{ path, before: 'one', after: 'three' }], work),
  );
  for (const protectedPath of [
    '.github/workflows/ci.yml',
    'src/../docs/file.md',
    'src/.env',
    'src/.prettierrc.ts',
    'src/.hidden/component.tsx',
    'src/prettier.config.ts',
    'src/vite.config.ts',
    'src/eslint.config.ts',
    'tests/vitest.config.ts',
    'tests/playwright.CONFIG.ts',
    'package.json',
  ])
    assert.throws(() =>
      resolveEdits(
        [{ path: protectedPath, before: null, after: 'value' }],
        work,
      ),
    );
});

test('리뷰 지적이 남아 있는 승인은 거부한다', () => {
  assert.throws(() =>
    validateReview({
      status: 'pass',
      summary: '검토',
      findings: [
        {
          path: 'src/example.ts',
          line: 8,
          defect: '지적',
          impact: '영향',
          evidence: '증거',
          fix: '수정',
        },
      ],
    }),
  );
});

test('모델 호출 직전 승인이 철회되면 공급자에 요청하지 않는다', async () => {
  const models = createModels({
    keys: { codex: 'mock', claude: 'mock' },
    modelNames: { codex: 'mock', claude: 'mock' },
    beforeRequest: async () => {
      throw new Error('stop-before-request');
    },
    request: () => assert.fail('A stopped job must not contact a provider'),
  });
  await assert.rejects(
    models.run({
      agent: 'codex',
      mode: 'development',
      instructions: 'test',
      context: '{}',
    }),
    /stop-before-request/,
  );
});

test('GitHub 일시 오류는 읽기 요청만 재시도한다', async () => {
  let calls = 0;
  const gh = createGitHub({
    token: 'mock',
    request: async () => {
      calls++;
      if (calls <= 2) throw new TypeError('fetch failed');
      return Response.json({ ok: true });
    },
    sleep: async () => {},
  });
  assert.deepEqual(await gh.repo('/issues/10'), { ok: true });
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(
    gh.repo('/issues/10/comments', {
      method: 'POST',
      data: { body: 'example' },
    }),
    /POST .*전송 실패/,
  );
  assert.equal(calls, 1);
});

test('새 승인으로만 미게시 준비 실패를 한 번 재개한다', () => {
  const state = {
    status: 'failed',
    attempts: 0,
    head,
    base: head,
    issueHash: fingerprint(issue),
    approval: 41,
  };
  const event = { action: 'labeled', issue, sender: { login: 'owner' } };
  const approval = { id: 42, event: 'labeled', actor: { login: 'owner' } };
  assert(canRestartPreflight(state, event, approval));
  assert(!canRestartPreflight(state, event, { ...approval, id: 41 }));
  assert(!canRestartPreflight(state, { ...event, action: 'opened' }, approval));
  assert(
    !canRestartPreflight(
      state,
      { ...event, issue: { ...issue, body: 'changed' } },
      approval,
    ),
  );
  for (const change of [
    { preflightRestarts: 1 },
    { attempts: 1 },
    { published: true },
    { pr: 20 },
    { status: 'waiting_ci' },
  ]) {
    assert(!canRestartPreflight({ ...state, ...change }, event, approval));
  }
});
