import { setTimeout as sleep } from 'node:timers/promises';
import { execFileSync } from 'node:child_process';
import {
  assertPull,
  authorized,
  fingerprint,
  baseBranch,
  repository,
  selectCurrentCI,
  Stop,
} from './github.mjs';

export async function mergedIntoDev(gh, commit) {
  if (!/^[a-f0-9]{40}$/.test(commit ?? '')) return false;
  const result = await gh.repo(`/compare/${commit}...${baseBranch}`);
  return result.merge_base_commit?.sha === commit;
}

export async function isTrackedDevMerge(gh, pull, state) {
  if (
    !pull.merged ||
    state.branch !== `ai/issue-${state.issue}` ||
    !/^[a-f0-9]{40}$/.test(pull.head.sha ?? '')
  )
    return false;
  assertPull(pull, { ...state, head: pull.head.sha });
  return mergedIntoDev(gh, pull.merge_commit_sha);
}

export function deleteBranchAtHead(branch, head, token) {
  const ref = `refs/heads/${branch}`;
  const auth = Buffer.from(`x-access-token:${token}`).toString('base64');
  execFileSync(
    'git',
    [
      'push',
      `--force-with-lease=${ref}:${head}`,
      `https://github.com/${repository}.git`,
      `:${ref}`,
    ],
    {
      env: {
        ...process.env,
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
        GIT_CONFIG_VALUE_0: `Authorization: Basic ${auth}`,
        GIT_TERMINAL_PROMPT: '0',
      },
      stdio: 'ignore',
      timeout: 30_000,
    },
  );
}

export async function cleanupBranch(gh, pull, state, remove) {
  const branch = `ai/issue-${state.issue}`;
  if (
    !pull.merged ||
    pull.base.ref !== baseBranch ||
    pull.head.repo?.full_name !== repository ||
    pull.head.ref !== branch ||
    pull.head.sha !== state.head
  )
    return '작업 브랜치 정리를 건너뛰었습니다. 병합한 작업 브랜치와 일치하지 않습니다.';
  try {
    if (!(await gh.repo('')).delete_branch_on_merge)
      return '저장소의 병합 후 브랜치 삭제 설정이 꺼져 있습니다.';
    const head = await gh.ref(branch);
    if (!head) return '작업 브랜치가 이미 정리됐습니다.';
    if (head !== pull.head.sha)
      return '작업 브랜치에 새 커밋이 있어 유지했습니다.';
    for (const query of [
      `base=${encodeURIComponent(branch)}`,
      `head=${encodeURIComponent(`${repository.split('/')[0]}:${branch}`)}`,
    ]) {
      if ((await gh.pages(`/pulls?state=open&${query}`)).length)
        return '열린 PR이 사용하는 작업 브랜치를 유지했습니다.';
    }
    try {
      await remove(branch, head);
    } catch {
      if (await gh.ref(branch))
        return '작업 브랜치를 삭제하지 못했습니다. 브랜치 변경 또는 보호 규칙을 확인하세요.';
    }
    return '병합된 작업 브랜치를 정리했습니다.';
  } catch {
    return '작업 브랜치 정리 조건을 확인하지 못해 삭제를 건너뛰었습니다.';
  }
}

export function ciIssue(run) {
  if (
    run?.event !== 'pull_request' ||
    run.head_repository?.full_name !== repository
  )
    return undefined;
  return /^ai\/issue-([1-9]\d*)$/.exec(run.head_branch ?? '')?.[1];
}

export function readyToComplete(state, run) {
  return Boolean(
    state &&
    Number.isSafeInteger(state.pr) &&
    state.head === state.reviewedHead &&
    ['waiting_ci', 'ci_failed', 'merged'].includes(state.status) &&
    (!run || selectCurrentCI([run], state)),
  );
}

export async function trustedCI(gh, state) {
  const query = new URLSearchParams({
    event: 'pull_request',
    head_sha: state.head,
    branch: state.branch,
    per_page: '20',
  });
  const result = await gh.repo(`/actions/workflows/ci.yml/runs?${query}`);
  const run = selectCurrentCI(result.workflow_runs, state);
  if (!run || run.status !== 'completed') return null;
  const jobs = await gh.repo(
    `/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`,
  );
  const verify = jobs.jobs.find(({ name }) => name === 'verify');
  if (run.conclusion === 'success' && verify?.conclusion === 'success')
    return run;
  await gh.record(
    state,
    'ci_failed',
    `현재 HEAD의 verify 검사에 실패했습니다. [CI 실행](${run.html_url})을 확인하세요.`,
  );
  throw new Stop('현재 HEAD의 필수 CI를 통과하지 못했습니다.');
}

export function createCompletion({
  gh,
  state,
  issueNumber,
  token,
  guard,
  assertApproval,
}) {
  const issuePath = `/issues/${issueNumber}`;
  const sha = /^[a-f0-9]{40}$/;

  async function closeIssue(pull) {
    assertPull(pull, state);
    if (!pull.merged || !sha.test(pull.merge_commit_sha ?? ''))
      throw new Stop('dev 머지 커밋을 확인할 수 없습니다.');
    if (!(await mergedIntoDev(gh, pull.merge_commit_sha)))
      throw new Stop('확인된 머지 커밋이 dev에 없습니다.');
    await gh.record(
      state,
      'merged',
      `PR #${state.pr}의 dev 머지를 확인했습니다.`,
    );
    let issue = await gh.repo(issuePath);
    if (issue.state === 'open') {
      if (!authorized(issue) || fingerprint(issue) !== state.issueHash)
        throw new Stop(
          '머지 후 이슈의 승인 또는 범위가 바뀌어 닫을 수 없습니다.',
        );
      await assertApproval();
      try {
        await gh.repo(issuePath, {
          method: 'PATCH',
          data: { state: 'closed', state_reason: 'completed' },
        });
      } catch (error) {
        issue = await gh.repo(issuePath);
        if (issue.state !== 'closed' || issue.state_reason !== 'completed')
          throw error;
      }
      issue = await gh.repo(issuePath);
    }
    if (issue.state !== 'closed' || issue.state_reason !== 'completed')
      throw new Stop('이슈가 완료 사유로 닫혔는지 확인할 수 없습니다.');
    const cleanup = await cleanupBranch(gh, pull, state, (branch, head) =>
      deleteBranchAtHead(branch, head, token),
    );
    await gh.record(
      state,
      'completed',
      `PR #${state.pr}를 dev에 squash merge했고 이슈 완료를 확인했습니다. ${cleanup}`,
    );
  }

  async function complete(ciRun) {
    if (state?.status === 'completed') return;
    if (!readyToComplete(state, ciRun)) {
      if (ciRun) return;
      throw new Stop('현재 HEAD에 자동 머지에 사용할 리뷰 승인이 없습니다.');
    }
    const path = `/pulls/${state.pr}`;
    let pull = await gh.repo(path);
    assertPull(pull, state);
    if (pull.merged) return closeIssue(pull);
    await gh.assertProtection();
    await guard();
    if (!(await trustedCI(gh, state))) return;
    await guard();
    pull = await gh.repo(path);
    assertPull(pull, state);
    if (pull.draft) {
      const result = await gh.call('/graphql', {
        method: 'POST',
        data: {
          query:
            'mutation ($id: ID!) { markPullRequestReadyForReview(input: {pullRequestId: $id}) { pullRequest { isDraft } } }',
          variables: { id: pull.node_id },
        },
      });
      if (
        result.data?.markPullRequestReadyForReview?.pullRequest?.isDraft !==
        false
      )
        throw new Stop('PR 준비 완료 상태를 확인하지 못했습니다.');
    }
    await guard();
    await gh.assertProtection();
    try {
      await gh.repo(`${path}/merge`, {
        method: 'PUT',
        data: {
          sha: state.reviewedHead,
          merge_method: 'squash',
          commit_title: pull.title,
          commit_message: `Closes #${issueNumber}\n\n${pull.body.split('\n\n')[2] ?? ''}\n\nCo-authored-by: Codex <noreply@openai.com>`,
        },
      });
    } catch (error) {
      pull = await gh.repo(path);
      if (!pull.merged) throw error;
    }
    await closeIssue(await gh.repo(path));
  }

  async function syncManualMerge() {
    if (!state?.pr || state.status === 'completed') return;
    const pull = await gh.repo(`/pulls/${state.pr}`);
    if (!(await isTrackedDevMerge(gh, pull, state))) return;
    for (let attempt = 0; attempt < 5; attempt++) {
      const issue = await gh.repo(issuePath);
      if (issue.state === 'closed' && issue.state_reason === 'completed') {
        const completed = { ...state, head: pull.head.sha };
        await gh.record(
          completed,
          'completed',
          `PR #${state.pr}의 dev 병합과 이슈 완료를 확인했습니다.`,
        );
        return;
      }
      if (issue.state !== 'open') return;
      if (attempt < 4) await sleep(2_000);
    }
  }

  return { complete, syncManualMerge };
}
