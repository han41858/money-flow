import { execFileSync } from 'node:child_process';
import { assertPull, baseBranch, repository } from './github.mjs';

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
