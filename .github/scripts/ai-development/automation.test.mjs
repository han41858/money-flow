import assert from 'node:assert/strict';
import { config, uiSpecUnreadMessage } from './config.mjs';
import { test } from 'node:test';
import {
  assertPull,
  authorized,
  canRestartUnpublished,
  createGitHub,
  fingerprint,
  issueMarker,
  readState,
  safeText,
  selectCurrentCI,
} from './github.mjs';
import { createModels, validateReview } from './models.mjs';
import { createFeedback, ValidationFailure } from './validation.mjs';
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

for (const retrySucceeds of [true, false]) {
  test(`Codex 개발 출력이 잘리면 같은 요청을 한 번만 재시도한다 (${retrySucceeds ? '복구' : '실패'})`, async () => {
    const requests = [];
    let guarded = 0;
    const completed = {
      status: 'completed',
      title: '🐛 화면: 표시 수정',
      summary: '표시를 수정합니다.',
      edits: [{ path: 'src/example.ts', before: 'old', after: 'new' }],
    };
    const models = createModels({
      keys: { codex: 'mock', claude: 'mock' },
      modelNames: { codex: 'mock', claude: 'mock' },
      beforeRequest: async () => {
        guarded++;
      },
      log: () => {},
      request: async (_url, init) => {
        requests.push(JSON.parse(init.body));
        if (requests.length === 2 && retrySucceeds)
          return Response.json({
            status: 'completed',
            output: [
              {
                content: [
                  { type: 'output_text', text: JSON.stringify(completed) },
                ],
              },
            ],
          });
        return Response.json({
          status: 'incomplete',
          incomplete_details: { reason: 'max_output_tokens' },
          output: [{ content: [{ type: 'output_text', text: '{"status":' }] }],
        });
      },
    });
    const run = models.run({
      agent: 'codex',
      mode: 'development',
      instructions: 'test',
      context: '{}',
    });
    if (retrySucceeds) assert.deepEqual(await run, completed);
    else await assert.rejects(run, /출력 토큰 한도/);
    assert.equal(guarded, 2);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].max_output_tokens, 12_000);
    assert.deepEqual(requests[1], {
      ...requests[0],
      max_output_tokens: 18_000,
    });
  });
}

for (const agent of ['codex', 'claude']) {
  for (const readsSpec of [true, false]) {
    test(`${agent} UI 검증에 읽기 한도를 따로 확보하고 본문 확인을 요구한다 (${readsSpec ? '확인' : '누락'})`, async () => {
      const codex = agent === 'codex';
      const verdict = codex
        ? {
            status: 'completed',
            title: '🐛 화면: 표시 수정',
            summary: '표시를 수정합니다.',
            edits: [{ path: 'src/app/View.tsx', before: 'old', after: 'new' }],
          }
        : { status: 'pass', summary: '검토했습니다.', findings: [] };
      const text = JSON.stringify(verdict);
      const done = codex
        ? {
            status: 'completed',
            output: [{ content: [{ type: 'output_text', text }] }],
          }
        : { stop_reason: 'end_turn', content: [{ type: 'text', text }] };
      const args = { path: 'tests/editor.spec.ts', line: 12 };
      const read = codex
        ? {
            status: 'completed',
            output: [
              {
                type: 'function_call',
                name: 'read_file',
                arguments: JSON.stringify(args),
                call_id: 'read',
              },
            ],
          }
        : {
            stop_reason: 'tool_use',
            content: [
              { type: 'tool_use', id: 'read', name: 'read_file', input: args },
            ],
          };
      const requests = [];
      let inspected = false;
      const models = createModels({
        keys: { codex: 'mock', claude: 'mock' },
        modelNames: { codex: 'mock', claude: 'mock' },
        limits: {
          ...config.limits,
          turns: 1,
          reviewTurns: 1,
          toolCallsTotal: 0,
        },
        log: () => {},
        request: async (_url, init) => {
          requests.push(JSON.parse(init.body));
          return Response.json(requests.length === 2 ? read : done);
        },
      });
      const result = await models.run({
        agent,
        mode: codex ? 'development' : 'review',
        instructions: 'test',
        context: '{}',
        inspect(name, input) {
          assert.equal(name, 'read_file');
          assert.deepEqual(input, args);
          inspected = readsSpec;
          return inspected ? '12: test(...)' : '본문을 찾을 수 없습니다.';
        },
        needsUiSpec: () => !inspected,
      });
      assert.equal(requests.length, 3);
      const noTools = codex ? 'none' : { type: 'none' };
      assert.deepEqual(requests[0].tool_choice, noTools);
      assert.deepEqual(
        requests[1].tools.map(({ name }) => name),
        ['read_file'],
      );
      assert.equal(requests[1].tool_choice, undefined);
      assert.deepEqual(requests[2].tool_choice, noTools);
      if (readsSpec) assert.deepEqual(result, verdict);
      else {
        assert.equal(result.status, 'needs_human');
        assert.equal(result.summary, uiSpecUnreadMessage);
        assert.equal(result.blockedOnUiSpec, true);
      }
    });
  }
}

test('UI 본문 확인 실패의 이전 기록은 미게시 작업에서 새 승인으로 한 번만 재개한다', () => {
  const state = {
    version: 1,
    issue: 10,
    status: 'needs_human',
    code: 'run_error',
    attempts: 3,
    head,
    base: head,
    issueHash: fingerprint(issue),
    approval: 41,
  };
  const marker =
    '<!-- money-flow-ai-state:' +
    Buffer.from(JSON.stringify(state)).toString('base64') +
    ' -->';
  const record = {
    user: { login: 'github-actions[bot]', type: 'Bot' },
    body: `**AI 개발 · needs_human**\n\n${uiSpecUnreadMessage}\n\nGenerated by Codex\n\n${marker}`,
  };
  const restored = readState([record], 10);
  const event = { action: 'labeled', issue, sender: { login: 'owner' } };
  const approval = { id: 42, event: 'labeled', actor: { login: 'owner' } };
  assert.equal(restored.code, 'ui_spec_unread');
  assert(canRestartUnpublished(restored, event, approval));
  assert(
    !canRestartUnpublished({ ...restored, uiSpecRestarts: 1 }, event, approval),
  );
  assert(
    !canRestartUnpublished(
      { ...restored, published: true, pr: 11 },
      event,
      approval,
    ),
  );
  assert(!canRestartUnpublished(restored, event, { ...approval, id: 41 }));
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
  assert(canRestartUnpublished(state, event, approval));
  assert(!canRestartUnpublished(state, event, { ...approval, id: 41 }));
  assert(
    !canRestartUnpublished(state, { ...event, action: 'opened' }, approval),
  );
  assert(
    !canRestartUnpublished(
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
    assert(!canRestartUnpublished({ ...state, ...change }, event, approval));
  }
});

test('격리 검사 오류는 실패한 단계와 환경 오류를 구분한다', () => {
  assert.match(new ValidationFailure(24).message, /build/);
  assert.match(new ValidationFailure(25).message, /test:e2e/);
  assert.match(new ValidationFailure(19).message, /후보 파일 복사/);
  const failure = new ValidationFailure(
    23,
    '\nFAIL store.test.ts\nExpected: 96',
  );
  assert.match(failure.diagnostics, /FAIL store.test.ts/);
  assert.match(failure.diagnostics, /Expected: 96/);
  assert.equal(new ValidationFailure(125).stage, undefined);
  assert.match(
    new ValidationFailure(null, '', 'ETIMEDOUT').message,
    /시간 한도 초과/,
  );
  assert.match(
    new ValidationFailure(null, '', 'ENOBUFS').message,
    /출력 한도 초과/,
  );
});

test('이전 격리 검사 실패 기록도 새 승인으로 한 번만 재개한다', () => {
  const state = {
    version: 1,
    issue: 10,
    status: 'needs_human',
    code: 'run_error',
    attempts: 1,
    head,
    base: head,
    issueHash: fingerprint(issue),
    approval: 41,
    preflightRestarts: 1,
  };
  const marker =
    '<!-- money-flow-ai-state:' +
    Buffer.from(JSON.stringify(state)).toString('base64') +
    ' -->';
  const record = {
    user: { login: 'github-actions[bot]', type: 'Bot' },
    body:
      '**AI 개발 · needs_human**\n\n후보 코드의 격리 검사가 실패했습니다. 실행 로그에서 실패 단계를 확인하세요.\n\nGenerated by Codex\n\n' +
      marker,
  };
  const restored = readState([record], 10);
  const event = { action: 'labeled', issue, sender: { login: 'owner' } };
  const approval = { id: 42, event: 'labeled', actor: { login: 'owner' } };
  assert(canRestartUnpublished(restored, event, approval));
  assert(!canRestartUnpublished(state, event, approval));
  assert(
    !canRestartUnpublished(
      { ...restored, validationRestarts: 1 },
      event,
      approval,
    ),
  );
  assert(
    !canRestartUnpublished({ ...restored, published: true }, event, approval),
  );
  const latestState = {
    ...state,
    code: 'validation_failed',
    validationRestarts: 1,
  };
  const latestRecord = {
    ...record,
    body:
      '**AI 개발 · needs_human**\n\n격리 검사 실패 · test. Actions 로그에서 상세 내용을 확인하세요.\n\nGenerated by Codex\n\n<!-- money-flow-ai-state:' +
      Buffer.from(JSON.stringify(latestState)).toString('base64') +
      ' -->',
  };
  const failedTest = readState([latestRecord], 10);
  assert(canRestartUnpublished(failedTest, event, approval));
  // A run that stopped after an in-run repair is still unpublished.
  assert(
    canRestartUnpublished({ ...failedTest, attempts: 2 }, event, approval),
  );
  assert(
    !canRestartUnpublished({ ...failedTest, attempts: 0 }, event, approval),
  );
  assert(
    !canRestartUnpublished(
      { ...failedTest, validationRestarts: 2 },
      event,
      approval,
    ),
  );
});

test('진행 상태는 한 댓글을 수정하고 종료 상태는 새 댓글로 남긴다', async () => {
  const calls = [];
  let gone = false;
  const gh = createGitHub({
    token: 'mock',
    request: async (url, { method, body }) => {
      calls.push([method, url.split('/issues/')[1], JSON.parse(body).body]);
      if (method === 'PATCH' && gone)
        return new Response('{}', { status: 404 });
      return Response.json({ id: calls.length });
    },
  });
  const state = { version: 1, issue: 10 };
  await gh.record(state, 'developing', '준비합니다.');
  await gh.record(state, 'developing', 'Codex 개발 1/3회차입니다.');
  await gh.record(state, 'reviewing', '리뷰 중입니다.');
  await gh.record(state, 'needs_human', '사람 확인이 필요합니다.');
  await gh.record(state, 'developing', '다시 시작합니다.');
  gone = true;
  await gh.record(state, 'developing', '이어갑니다.');
  gone = false;
  await gh.record(state, 'developing', '이어갑니다.');
  await gh.record(state, 'waiting_ci', '오류', 'run_error');
  await gh.record(state, 'waiting_ci', '대기 중입니다.', 'waiting_ci', true);
  assert.deepEqual(
    calls.map(([method, path]) => method + ' ' + path),
    [
      'POST 10/comments',
      'PATCH comments/1',
      'PATCH comments/1',
      'POST 10/comments',
      'POST 10/comments',
      'PATCH comments/5',
      'POST 10/comments',
      'PATCH comments/7',
      'POST 10/comments',
      'POST 10/comments',
    ],
  );
  const edited = calls[2][2];
  assert.equal(edited.split('\n\n')[0], '**AI 개발 · reviewing**');
  assert.equal(edited.split('\n\n')[1], '리뷰 중입니다.');
  assert.match(calls[0][2], /\*\*진행 기록\*\*\n\n- .* 준비합니다\./);
  assert.match(edited, /\*\*진행 기록\*\*\n\n- /);
  assert.doesNotMatch(edited, /<\/?(?:details|summary)\b/);
  assert.match(
    edited,
    /developing · 준비합니다\.\n.*1\/3회차.*\n.*reviewing · /,
  );
  assert.doesNotMatch(calls[3][2], /진행 기록/);
  assert.equal(calls[7][2].match(/^- .* 이어갑니다\.$/gm)?.length, 1);
  for (const [, , body] of calls)
    assert.equal(
      readState(
        [{ user: { login: 'github-actions[bot]', type: 'Bot' }, body }],
        10,
      ).issue,
      10,
    );
});

test('검사 실패를 보완하는 동안에도 리뷰 지적을 유지한다', () => {
  const feedback = createFeedback();
  const context = () => JSON.parse(feedback.context(issue));
  assert.deepEqual(context(), { title: issue.title, body: issue.body });
  const findings = [{ severity: 'P2', title: 'Example finding' }];
  assert(feedback.reviewed(findings));
  feedback.failed(new ValidationFailure(21, 'error TS2322'));
  assert.equal(context().feedback, JSON.stringify(findings));
  assert.equal(context().validation.stage, 'typecheck');
  assert.match(context().validation.diagnostics, /TS2322/);
  feedback.passed();
  assert.equal(context().validation, undefined);
  assert.equal(context().feedback, JSON.stringify(findings));
  assert(!feedback.reviewed(findings));
  assert(feedback.reviewed([]));
});
