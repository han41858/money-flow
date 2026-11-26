import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eligiblePreview, previewCandidates } from './vercel-preview.mjs';

const repo = { owner: 'owner', repo: 'project' };
const head = {
  sha: 'current',
  ref: 'feature',
  repo: { full_name: 'owner/project' },
};
const pr = { state: 'open', head, labels: [] };
const page = (nodes, next = null) => ({
  nodes,
  pageInfo: { hasNextPage: Boolean(next), endCursor: next },
});

test('프리뷰 라벨을 직접 단 같은 저장소의 현재 PR만 배포할 수 있다', async () => {
  const data = { ...pr, labels: [{ name: 'preview' }] };
  const github = { rest: { pulls: { get: async () => ({ data }) } } };
  assert.equal(await eligiblePreview(github, repo, 3, 'current'), data);
  assert.equal(await eligiblePreview(github, repo, 3, 'obsolete'), null);
  data.head = { ...head, ref: 'dev' };
  assert.equal(await eligiblePreview(github, repo, 3), null);
  data.head = { ...head, repo: { full_name: 'fork/project' } };
  assert.equal(await eligiblePreview(github, repo, 3), null);
});

test('이슈 라벨의 연결 PR과 그 PR의 닫는 이슈를 중복 없이 확인한다', async () => {
  const sameRepo = {
    number: 3,
    repository: { nameWithOwner: 'owner/project' },
  };
  let reads = 0;
  let labeled = true;
  const github = {
    rest: {
      pulls: {
        get: async () => {
          reads++;
          return { data: pr };
        },
      },
    },
    graphql: async (_, { number, cursor }) => ({
      repository:
        number === 10
          ? {
              issue: {
                closedByPullRequestsReferences: cursor
                  ? page([sameRepo])
                  : page(
                      [
                        sameRepo,
                        {
                          number: 4,
                          repository: { nameWithOwner: 'fork/project' },
                        },
                      ],
                      'next',
                    ),
              },
            }
          : {
              pullRequest: {
                closingIssuesReferences: cursor
                  ? page([
                      null,
                      {
                        labels: { nodes: labeled ? [{ name: 'preview' }] : [] },
                      },
                    ])
                  : page([], 'next'),
              },
            },
    }),
  };
  assert.deepEqual(
    await previewCandidates(github, {
      repo,
      payload: { issue: { number: 10 } },
    }),
    [{ number: 3, sha: 'current' }],
  );
  assert.equal(reads, 1);
  labeled = false;
  assert.equal(await eligiblePreview(github, repo, 3, 'current'), null);
});
