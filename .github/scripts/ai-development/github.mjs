import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { isDeepStrictEqual } from 'node:util';
import { uiSpecUnreadMessage } from './config.mjs';
import {
  appendProgress,
  importLegacyProgress,
  progressHistory,
  renderProgress,
} from './progress.mjs';

export const repository = 'han41858/money-flow';
export const baseBranch = 'dev';
export const approvalLabel = 'ai:develop';
const stateMarker = '<!-- money-flow-ai-state:';
const bot = 'github-actions[bot]';
const api = 'https://api.github.com';
const legacyValidationMessage =
  '후보 코드의 격리 검사가 실패했습니다. 실행 로그에서 실패 단계를 확인하세요.';

export class Stop extends Error {}

export class UiSpecUnread extends Stop {
  constructor() {
    super(uiSpecUnreadMessage);
  }
}

export function fingerprint(issue) {
  return createHash('sha256')
    .update(JSON.stringify([issue.title, issue.body]))
    .digest('hex');
}

export function authorized(issue) {
  const labels = issue.labels.map(({ name }) => name);
  return (
    issue.state === 'open' &&
    labels.includes(approvalLabel) &&
    !labels.includes('ai:stop')
  );
}

export function safeText(text, limit = 800) {
  return String(text ?? '')
    .slice(0, limit)
    .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
    .replace(/https?:\/\//gi, (prefix) => prefix.replace(':', '：'))
    .replaceAll('@', '＠')
    .replaceAll('#', '＃')
    .replaceAll('<', '‹')
    .replaceAll('>', '›')
    .replaceAll('[', '［')
    .replaceAll(']', '］')
    .replaceAll('`', '｀');
}

function stateRecords(comments, issue) {
  return comments.flatMap(({ id, user, body }) => {
    if (user?.login !== bot || user.type !== 'Bot') return [];
    const line = body?.split('\n').at(-1);
    if (!line?.startsWith(stateMarker) || !line.endsWith(' -->')) return [];
    const encoded = line.slice(stateMarker.length, -4);
    const state = JSON.parse(Buffer.from(encoded, 'base64').toString());
    if (state.version !== 1 || state.issue !== issue) return [];
    if (
      state.status === 'failed' &&
      state.code === 'run_error' &&
      /^Claude API HTTP 400\. \(리뷰 요청 \d+회차, 추론 블록 또는 서명(?:[,)]|$)/.test(
        body.split('\n\n')[1],
      )
    )
      state.code = 'review_api_thinking';
    if (
      state.status === 'needs_human' &&
      state.code === 'run_error' &&
      body.split('\n\n')[1] === legacyValidationMessage
    )
      state.code = 'validation_failed';
    if (
      state.status === 'needs_human' &&
      state.code === 'run_error' &&
      body.split('\n\n')[1] === uiSpecUnreadMessage
    )
      state.code = 'ui_spec_unread';
    if (
      state.code === 'validation_failed' &&
      state.validationStage === undefined &&
      body.split('\n\n')[1] ===
        '격리 검사 실패 · test. Actions 로그에서 상세 내용을 확인하세요.'
    )
      state.legacyTestFailure = true;
    return [{ id, body, state }];
  });
}

function currentProgress(records) {
  for (const record of records.toReversed()) {
    const history = progressHistory(record.body);
    if (history) return { ...record, history };
  }
  return null;
}

export function readState(comments, issue) {
  const records = stateRecords(comments, issue);
  return currentProgress(records)?.state ?? records.at(-1)?.state ?? null;
}

export function assertPull(pull, state) {
  if (
    pull.number !== state.pr ||
    pull.base.repo.full_name !== repository ||
    pull.base.ref !== baseBranch ||
    pull.head.repo?.full_name !== repository ||
    pull.head.ref !== state.branch ||
    pull.head.sha !== state.head ||
    !pull.body?.startsWith(issueMarker(state.issue))
  )
    throw new Stop('PR의 연결 관계나 HEAD가 예상과 다릅니다.');
}

export function selectCurrentCI(runs, state) {
  return runs.find(
    (run) =>
      run.event === 'pull_request' &&
      run.head_sha === state.head &&
      run.head_branch === state.branch &&
      run.head_repository?.full_name === repository &&
      (!run.pull_requests?.length ||
        run.pull_requests.some(
          (pull) => pull.number === state.pr && pull.base.ref === baseBranch,
        )),
  );
}

export function issueMarker(issue) {
  return `<!-- money-flow-ai-issue:${issue} -->`;
}

export function canRestartUnpublished(state, event, approval) {
  return (
    ((state.status === 'failed' &&
      state.attempts === 0 &&
      !state.preflightRestarts) ||
      (state.status === 'needs_human' &&
        state.code === 'validation_failed' &&
        state.attempts >= 1 &&
        (!state.validationRestarts ||
          (state.validationRestarts === 1 && state.legacyTestFailure))) ||
      (state.status === 'needs_human' &&
        state.code === 'ui_spec_unread' &&
        state.attempts >= 1 &&
        !state.uiSpecRestarts)) &&
    state.head === state.base &&
    !state.published &&
    !state.pr &&
    !state.observedHead &&
    event.action === 'labeled' &&
    state.issueHash === fingerprint(event.issue) &&
    approval?.event === 'labeled' &&
    approval.actor?.login === event.sender.login &&
    approval.id !== state.approval
  );
}

export function canResumeReview(state, issue) {
  return Boolean(
    state?.status === 'failed' &&
    state.code === 'review_api_thinking' &&
    state.branch === `ai/issue-${issue}` &&
    state.published &&
    Number.isSafeInteger(state.pr) &&
    state.pr > 0 &&
    [state.head, state.base].every((value) => /^[a-f0-9]{40}$/.test(value)) &&
    state.reviewedHead !== state.head &&
    !state.observedHead,
  );
}

export function createGitHub({
  token,
  publishToken,
  runId,
  runAttempt = 1,
  request = fetch,
  sleep = delay,
}) {
  async function call(path, { method = 'GET', data, publish = false } = {}) {
    const endpoint = path.split('?')[0];
    const maxAttempts = method === 'GET' ? 3 : 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let failure;
      try {
        const response = await request(api + path, {
          method,
          headers: {
            accept: 'application/vnd.github+json',
            'x-github-api-version': '2022-11-28',
            authorization: `Bearer ${publish ? publishToken : token}`,
            'content-type': 'application/json',
          },
          body: data ? JSON.stringify(data) : undefined,
          signal: AbortSignal.timeout(35_000),
        });
        if (response.ok)
          return response.status === 204 ? undefined : await response.json();
        failure = new Error(
          `GitHub ${method} ${endpoint} 실패 (HTTP ${response.status})`,
        );
        failure.status = response.status;
      } catch (error) {
        const code = error.cause?.code ?? error.code ?? error.name;
        const detail = /^[a-z0-9_]+$/i.test(code ?? '') ? code : 'unknown';
        failure = new Error(
          `GitHub ${method} ${endpoint} 전송 실패 (${detail})`,
        );
      }
      if (
        attempt === maxAttempts ||
        (failure.status && ![429, 500, 502, 503, 504].includes(failure.status))
      )
        throw failure;
      console.log(`${failure.message}. 읽기 요청을 다시 시도합니다.`);
      await sleep(1_000 * attempt);
    }
  }
  const repo = (path, options) => call(`/repos/${repository}${path}`, options);
  async function pages(path) {
    const items = [];
    for (let page = 1; page <= 20; page++) {
      const separator = path.includes('?') ? '&' : '?';
      const batch = await repo(`${path}${separator}per_page=100&page=${page}`);
      items.push(...batch);
      if (batch.length < 100) return items;
    }
    throw new Stop('GitHub 목록 조회 한도에 도달했습니다.');
  }
  const comment = (number, body) =>
    repo(`/issues/${number}/comments`, { method: 'POST', data: { body } });
  // Actions serializes workflows for the same issue. Queue calls within a
  // process as well so each write reads the latest saved comment first.
  const writes = new Map();
  async function writeProgress(state, message, visible) {
    const records = stateRecords(
      await pages(`/issues/${state.issue}/comments`),
      state.issue,
    );
    const current = currentProgress(records);
    const existing = current ?? records.at(-1);
    const history = current?.history ?? importLegacyProgress(records);
    const event = appendProgress(
      history,
      { id: runId ?? state.run ?? 0, attempt: runAttempt },
      state,
      message,
      visible,
    );
    if (!event) return;
    if (
      event.duplicate &&
      (!event.latest ||
        isDeepStrictEqual(
          { ...state, updatedAt: existing.state.updatedAt },
          existing.state,
        ))
    )
      return;
    const text = renderProgress(
      history,
      event.latest ? state : existing.state,
      repository,
      stateMarker,
    );
    if (existing?.id) {
      try {
        await repo(`/issues/comments/${existing.id}`, {
          method: 'PATCH',
          data: { body: text },
        });
        return;
      } catch (error) {
        if (error.status !== 404) throw error;
      }
    }
    await comment(state.issue, text);
  }
  return {
    repo,
    call,
    pages,
    comment,
    async state(issue) {
      return readState(await pages(`/issues/${issue}/comments`), issue);
    },
    async record(
      state,
      status,
      message,
      code = status,
      { visible = true } = {},
    ) {
      state.status = status;
      state.code = code;
      state.updatedAt = new Date().toISOString();
      const checkpoint = { ...state };
      const previous = writes.get(state.issue);
      const next = (previous?.catch(() => {}) ?? Promise.resolve()).then(() =>
        writeProgress(checkpoint, message, visible),
      );
      writes.set(state.issue, next);
      try {
        await next;
      } finally {
        if (writes.get(state.issue) === next) writes.delete(state.issue);
      }
      console.log(
        JSON.stringify({
          status,
          code,
          issue: state.issue,
          pr: state.pr,
          head: state.head,
        }),
      );
    },
    async ref(branch) {
      try {
        return (await repo(`/git/ref/heads/${branch}`)).object.sha;
      } catch (error) {
        if (error.status === 404) return null;
        throw error;
      }
    },
    async approval(issue) {
      return (await pages(`/issues/${issue}/events`)).findLast(
        (item) =>
          ['labeled', 'unlabeled'].includes(item.event) &&
          item.label?.name === approvalLabel,
      );
    },
    async assertMaintainer(login) {
      const result = await repo(
        `/collaborators/${encodeURIComponent(login)}/permission`,
      );
      if (!['write', 'maintain', 'admin'].includes(result.permission))
        throw new Stop('이슈 자동화 실행 권한을 확인할 수 없습니다.');
    },
    async assertEnvironment() {
      const path = '/environments/ai-development';
      const environment = await repo(path);
      const policy = await repo(`${path}/deployment-branch-policies`);
      if (
        !environment.deployment_branch_policy?.custom_branch_policies ||
        policy.total_count !== 1 ||
        policy.branch_policies[0]?.name !== baseBranch ||
        policy.branch_policies[0]?.type !== 'branch'
      )
        throw new Stop('ai-development 환경은 dev 브랜치에만 허용해야 합니다.');
    },
    async assertProtection() {
      const rules = await repo('/rules/branches/dev');
      const checks = rules
        .filter(({ type }) => type === 'required_status_checks')
        .map(({ parameters }) => parameters);
      if (
        !checks.some(
          (settings) =>
            settings.strict_required_status_checks_policy &&
            settings.required_status_checks.some(
              (check) =>
                check.context === 'verify' && check.integration_id === 15368,
            ),
        )
      )
        throw new Stop(
          'dev의 verify 필수 검사에 최신 브랜치 요구 설정이 필요합니다.',
        );
    },
  };
}
