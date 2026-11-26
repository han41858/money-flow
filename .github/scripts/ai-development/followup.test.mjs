import { ciIssue, readyToComplete } from './completion.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanupBranch, isTrackedDevMerge } from './completion.mjs';
import {
  canResumeDependency,
  dependencyRetry,
  dependencyNumbers,
  dispatchReadyDependencies,
  pendingDependencies,
} from './dependencies.mjs';
import { canResumeReview, fingerprint, repository } from './github.mjs';

const head = 'a'.repeat(40);
const base = 'b'.repeat(40);
const branch = 'ai/issue-10';
const pull = {
  merged: true,
  base: { ref: 'dev' },
  head: { ref: branch, sha: head, repo: { full_name: repository } },
};

test('병합한 동일 HEAD의 브랜치만 원격 HEAD 조건을 전달해 삭제한다', async () => {
  const state = { issue: 10, head };
  const gh = {
    repo: async () => ({ delete_branch_on_merge: true }),
    ref: async () => head,
    pages: async () => [],
  };
  let deletes = 0;
  assert.match(
    await cleanupBranch(gh, pull, state, (name, expected) => {
      assert.equal(name, branch);
      assert.equal(expected, head);
      deletes++;
    }),
    /정리했습니다/,
  );
  assert.equal(deletes, 1);
  const remove = () =>
    assert.fail('보호 조건을 통과하지 못했으므로 삭제하면 안 됩니다.');
  assert.match(
    await cleanupBranch({ ...gh, ref: async () => base }, pull, state, remove),
    /새 커밋/,
  );
  assert.match(
    await cleanupBranch({ ...gh, ref: async () => null }, pull, state, remove),
    /이미/,
  );
  assert.match(
    await cleanupBranch(
      {
        ...gh,
        pages: async (query) => (query.includes('head=') ? [pull] : []),
      },
      pull,
      state,
      remove,
    ),
    /열린 PR/,
  );
  assert.match(
    await cleanupBranch(
      { ...gh, repo: async () => ({ delete_branch_on_merge: false }) },
      pull,
      state,
      remove,
    ),
    /꺼져/,
  );
  assert.match(
    await cleanupBranch(
      gh,
      { ...pull, head: { ...pull.head, ref: 'dev' } },
      state,
      remove,
    ),
    /일치하지/,
  );
});

test('선행 이슈 재개에서 dev 갱신만 제한적으로 다시 시도한다', () => {
  const waitingState = {};
  const retry = { status: 'waiting_dependency', code: 'dependency_dev_moved' };
  const blocked = { status: 'needs_human', code: 'dependency_blocked' };
  assert.deepEqual(dependencyRetry(waitingState, true), retry);
  assert.deepEqual(dependencyRetry(waitingState, true), retry);
  assert.equal(waitingState.dependencyRetries, 2);
  assert.deepEqual(dependencyRetry(waitingState, true), blocked);
  assert.deepEqual(dependencyRetry({}, false), blocked);
});

const issue = {
  number: 10,
  title: '후속 작업',
  body: '선행 이슈: #3\n선행 이슈: #3',
  state: 'open',
  labels: [{ name: 'ai:develop' }],
};
const approval = { id: 19, event: 'labeled', actor: { login: 'maintainer' } };
const waiting = {
  status: 'waiting_dependency',
  issueHash: fingerprint(issue),
  approval: approval.id,
};

test('선행 이슈는 완료 상태와 같은 저장소 dev 병합 커밋을 모두 확인한다', async () => {
  assert.deepEqual(dependencyNumbers(issue), [3]);
  assert.throws(() => dependencyNumbers({ ...issue, body: '선행 이슈: #10' }));
  const gh = {
    repo: async (path) =>
      path === '/issues/3'
        ? { state: 'closed', state_reason: 'completed' }
        : { merge_base_commit: { sha: head } },
    call: async () => ({
      data: {
        repository: {
          issue: {
            closedByPullRequestsReferences: {
              nodes: [
                {
                  merged: true,
                  baseRefName: 'dev',
                  repository: { nameWithOwner: repository },
                  mergeCommit: { oid: head },
                },
              ],
            },
          },
        },
      },
    }),
  };
  assert.deepEqual(await pendingDependencies(gh, issue), []);
  assert.deepEqual(
    await pendingDependencies(
      {
        ...gh,
        repo: async (path) =>
          path === '/issues/3'
            ? { state: 'closed', state_reason: 'completed' }
            : { merge_base_commit: { sha: base } },
      },
      issue,
    ),
    [3],
  );
  assert.deepEqual(
    await pendingDependencies(
      {
        ...gh,
        repo: async () => ({ state: 'closed', state_reason: 'not_planned' }),
      },
      issue,
    ),
    [3],
  );
});

test('후속 재개는 원래 승인과 범위가 유지된 대기 이슈에만 dispatch한다', async () => {
  assert(canResumeDependency(waiting, issue, approval));
  assert(
    !canResumeDependency(
      { ...waiting, status: 'needs_human' },
      issue,
      approval,
    ),
  );
  assert(!canResumeDependency(waiting, { ...issue, body: '' }, approval));
  assert(!canResumeDependency(waiting, issue, { ...approval, id: 20 }));
  const calls = [];
  await dispatchReadyDependencies({
    pages: async () => [
      issue,
      {
        ...issue,
        number: 11,
        labels: [{ name: 'ai:develop' }, { name: 'ai:stop' }],
      },
    ],
    state: async () => waiting,
    approval: async () => approval,
    assertMaintainer: async (login) => assert.equal(login, 'maintainer'),
    repo: async (path, request) => {
      if (path.startsWith('/actions/')) calls.push(request.data);
      if (path === '/issues/3')
        return { state: 'closed', state_reason: 'completed' };
      return { merge_base_commit: { sha: head } };
    },
    call: async () => ({
      data: {
        repository: {
          issue: {
            closedByPullRequestsReferences: {
              nodes: [
                {
                  merged: true,
                  baseRefName: 'dev',
                  repository: { nameWithOwner: repository },
                  mergeCommit: { oid: head },
                },
              ],
            },
          },
        },
      },
    }),
  });
  assert.deepEqual(calls, [
    { ref: 'dev', inputs: { issue: '10', phase: 'dependency' } },
  ]);
});

test('중단된 기존 PR의 새 HEAD는 전체 SHA를 지정해야만 리뷰 대상으로 인정한다', () => {
  const state = {
    status: 'needs_human',
    published: true,
    branch,
    pr: 20,
    head,
    base,
  };
  assert(canResumeReview(state, 10, base));
  assert(canResumeReview({ ...state, status: 'reviewing' }, 10, base));
  assert(
    !canResumeReview(
      { ...state, status: 'developing', published: false },
      10,
      base,
    ),
  );
  assert(!canResumeReview(state, 10));
  assert(!canResumeReview(state, 10, 'abc'));
  assert(!canResumeReview({ ...state, reviewedHead: base }, 10, base));
  assert(!canResumeReview({ ...state, status: 'completed' }, 10, base));
});

test('수동 병합은 추적 중인 PR과 dev 병합 커밋을 대조한다', async () => {
  const state = { issue: 10, pr: 20, branch, head: base };
  const merged = {
    ...pull,
    number: 20,
    body: '<!-- money-flow-ai-issue:10 -->',
    base: { ref: 'dev', repo: { full_name: repository } },
    merge_commit_sha: head,
  };
  const gh = { repo: async () => ({ merge_base_commit: { sha: head } }) };
  assert(await isTrackedDevMerge(gh, merged, state));
  assert(!(await isTrackedDevMerge(gh, { ...merged, merged: false }, state)));
  assert(
    !(await isTrackedDevMerge(
      { repo: async () => ({ merge_base_commit: { sha: base } }) },
      merged,
      state,
    )),
  );
  await assert.rejects(isTrackedDevMerge(gh, { ...merged, number: 21 }, state));
});

test('CI 완료는 동일 PR에서 리뷰 승인된 HEAD만 재개한다', () => {
  const repository = 'han41858/money-flow';
  const run = {
    event: 'pull_request',
    head_branch: 'ai/issue-12',
    head_sha: 'a'.repeat(40),
    head_repository: { full_name: repository },
    pull_requests: [{ number: 26, base: { ref: 'dev' } }],
  };
  const state = {
    status: 'waiting_ci',
    head: run.head_sha,
    reviewedHead: run.head_sha,
    branch: run.head_branch,
    pr: 26,
  };
  assert.equal(ciIssue(run), '12');
  assert.equal(readyToComplete(state, run), true);
  assert.equal(readyToComplete(state), true);
  assert.equal(readyToComplete({ ...state, status: 'reviewing' }, run), false);
  assert.equal(readyToComplete({ ...state, reviewedHead: null }, run), false);
  assert.equal(readyToComplete({ ...state, status: 'ci_failed' }, run), true);
  assert.equal(
    readyToComplete(state, { ...run, head_sha: 'b'.repeat(40) }),
    false,
  );
  assert.equal(readyToComplete({ ...state, pr: 999 }, run), false);
  assert.equal(
    ciIssue({ ...run, head_repository: { full_name: 'fork/money-flow' } }),
    undefined,
  );
  assert.equal(
    ciIssue({ ...run, head_branch: 'ai/issue-12-extra' }),
    undefined,
  );
  assert.equal(ciIssue({ ...run, event: 'push' }), undefined);
});
