import {
  approvalLabel,
  authorized,
  baseBranch,
  fingerprint,
  repository,
  Stop,
} from './github.mjs';
import { mergedIntoDev } from './completion.mjs';

export function dependencyNumbers(issue) {
  const numbers = new Set();
  for (const line of (issue.body ?? '').split('\n')) {
    if (!/^선행 이슈\s*:/.test(line.trim())) continue;
    const number = Number(
      /^선행 이슈\s*:\s*#([1-9]\d*)$/.exec(line.trim())?.[1],
    );
    if (!Number.isSafeInteger(number) || number === issue.number)
      throw new Stop(
        '선행 이슈는 자기 자신을 제외한 `선행 이슈: #번호` 형식으로 적으세요.',
      );
    numbers.add(number);
  }
  return [...numbers];
}

export async function pendingDependencies(gh, issue) {
  const pending = [];
  for (const number of dependencyNumbers(issue)) {
    const dependency = await gh.repo(`/issues/${number}`);
    if (dependency.pull_request) throw new Stop('선행 번호는 이슈여야 합니다.');
    if (
      dependency.state !== 'closed' ||
      dependency.state_reason !== 'completed'
    ) {
      pending.push(number);
      continue;
    }
    const result = await gh.call('/graphql', {
      method: 'POST',
      data: {
        query: `query ($owner: String!, $repo: String!, $number: Int!) {
          repository(owner: $owner, name: $repo) { issue(number: $number) {
            closedByPullRequestsReferences(first: 50) { nodes { merged baseRefName mergeCommit { oid } repository { nameWithOwner } } }
          } }
        }`,
        variables: {
          owner: repository.split('/')[0],
          repo: repository.split('/')[1],
          number,
        },
      },
    });
    const pulls =
      result.data?.repository?.issue?.closedByPullRequestsReferences?.nodes;
    if (!pulls || result.errors?.length)
      throw new Stop('선행 이슈의 병합 PR을 조회할 수 없습니다.');
    let merged = false;
    for (const pull of pulls) {
      if (
        pull.merged &&
        pull.baseRefName === baseBranch &&
        pull.repository.nameWithOwner === repository &&
        (await mergedIntoDev(gh, pull.mergeCommit?.oid))
      ) {
        merged = true;
        break;
      }
    }
    if (!merged) pending.push(number);
  }
  return pending;
}

export function canResumeDependency(state, issue, approval) {
  return (
    state?.status === 'waiting_dependency' &&
    authorized(issue) &&
    state.issueHash === fingerprint(issue) &&
    !state.pr &&
    !state.published &&
    approval?.event === 'labeled' &&
    approval.id === state.approval &&
    Boolean(approval.actor?.login)
  );
}

export async function dispatchReadyDependencies(gh) {
  const issues = await gh.pages(
    `/issues?state=open&labels=${encodeURIComponent(approvalLabel)}`,
  );
  for (const issue of issues) {
    if (issue.pull_request || !authorized(issue)) continue;
    try {
      if (!dependencyNumbers(issue).length) continue;
      const state = await gh.state(issue.number);
      if (state?.status !== 'waiting_dependency') continue;
      const approval = await gh.approval(issue.number);
      if (!canResumeDependency(state, issue, approval)) continue;
      await gh.assertMaintainer(approval.actor.login);
      if ((await pendingDependencies(gh, issue)).length) continue;
      await gh.repo('/actions/workflows/ai-development.yml/dispatches', {
        method: 'POST',
        data: {
          ref: baseBranch,
          inputs: { issue: String(issue.number), phase: 'dependency' },
        },
      });
    } catch (error) {
      console.warn(
        `이슈 #${issue.number}의 선행 작업을 확인하지 못했습니다. (${error.status ?? 'validation'})`,
      );
    }
  }
}
