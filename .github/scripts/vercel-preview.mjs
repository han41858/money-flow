const label = 'preview';

const linkedPulls =
  'query($owner: String!, $repo: String!, $number: Int!, $cursor: String) { repository(owner: $owner, name: $repo) { issue(number: $number) { closedByPullRequestsReferences(first: 50, after: $cursor) { nodes { number repository { nameWithOwner } } pageInfo { hasNextPage endCursor } } } } }';
const closingIssues =
  'query($owner: String!, $repo: String!, $number: Int!, $cursor: String) { repository(owner: $owner, name: $repo) { pullRequest(number: $number) { closingIssuesReferences(first: 50, after: $cursor) { nodes { labels(first: 100) { nodes { name } } } pageInfo { hasNextPage endCursor } } } } }';

async function* pages(github, owner, repo, query, number, connection) {
  let cursor = null;
  do {
    const { repository } = await github.graphql(query, {
      owner,
      repo,
      number,
      cursor,
    });
    const page = connection(repository);
    if (!page) return;
    yield page.nodes.filter(Boolean);
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);
}

export async function eligiblePreview(
  github,
  { owner, repo },
  number,
  expectedSha,
) {
  const { data: pr } = await github.rest.pulls.get({
    owner,
    repo,
    pull_number: number,
  });
  if (
    pr.state !== 'open' ||
    pr.head.repo?.full_name !== `${owner}/${repo}` ||
    ['main', 'dev'].includes(pr.head.ref) ||
    (expectedSha && pr.head.sha !== expectedSha)
  )
    return null;
  if (pr.labels.some(({ name }) => name === label)) return pr;
  for await (const issues of pages(
    github,
    owner,
    repo,
    closingIssues,
    number,
    (repository) => repository.pullRequest?.closingIssuesReferences,
  )) {
    if (
      issues.some((issue) =>
        issue.labels?.nodes.some(({ name }) => name === label),
      )
    )
      return pr;
  }
  return null;
}

export async function previewCandidates(github, context) {
  const { owner, repo } = context.repo;
  const { pull_request: pull, issue } = context.payload;
  const candidates = new Set();
  if (pull) {
    candidates.add(pull.number);
  } else {
    for await (const prs of pages(
      github,
      owner,
      repo,
      linkedPulls,
      issue.number,
      (repository) => repository.issue?.closedByPullRequestsReferences,
    )) {
      for (const pr of prs)
        if (pr.repository.nameWithOwner === `${owner}/${repo}`)
          candidates.add(pr.number);
    }
  }
  const result = [];
  for (const number of candidates) {
    const pr = await eligiblePreview(github, context.repo, number);
    if (pr) result.push({ number, sha: pr.head.sha });
  }
  return result;
}
