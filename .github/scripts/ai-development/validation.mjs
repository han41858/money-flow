import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { safeText, Stop } from './github.mjs';
import {
  browserResults,
  browserTargetsArgs,
  isBrowserSpec,
  sameBrowserFailures,
  targetResults,
} from './reproduction.mjs';

const image = 'money-flow-ai-validation';
const stages = [
  'format:check',
  'typecheck',
  'lint',
  'test',
  'build',
  'test:e2e',
];

export function reviewValidation(head, runUrl, browser, reproduced, changed) {
  const files = new Set([...changed, ...reproduced.map(({ file }) => file)]);
  const results = targetResults(browser, reproduced);
  const related = browser.filter((test) => files.has(test.file));
  return {
    head,
    runUrl,
    isolatedChecksPassed: stages,
    chromium: {
      reported: browser.length,
      passed: browser.filter(
        ({ status, outcome, expected }) =>
          status === 'expected' &&
          outcome === 'passed' &&
          expected === 'passed',
      ).length,
      tests: [...new Set([...results, ...related])]
        .slice(0, 30)
        .map(({ file, title, status, outcome, expected }) => ({
          file: file.slice(0, 240),
          title: title.slice(0, 240),
          status,
          outcome,
          expected,
        })),
    },
  };
}

export class ValidationFailure extends Stop {
  constructor(status, output = '', code, browser = []) {
    const stage = stages[status - 20];
    const description = stage
      ? `격리 검사 실패 · ${stage}`
      : status === 19
        ? '격리 검사 실패 · 후보 파일 복사'
        : code === 'ETIMEDOUT'
          ? '격리 검사 실행 실패 · 시간 한도 초과'
          : code === 'ENOBUFS'
            ? '격리 검사 실행 실패 · 출력 한도 초과'
            : `격리 검사 실행 실패 (종료 코드: ${status ?? '없음'})`;
    super(description + '. Actions 로그에서 상세 내용을 확인하세요.');
    this.stage = stage;
    this.browser = browser;
    this.diagnostics = output
      .slice(-4500)
      .split('\n')
      .map((line) => safeText(line, 350))
      .join('\n');
  }
}

// Tracks what the next development round must address. Review findings stay
// until the next review, even while a failed check is being repaired.
export function createFeedback() {
  let review;
  let validation;
  return {
    context: (issue, uiBaseline) =>
      JSON.stringify({
        title: issue.title,
        body: issue.body,
        feedback: review,
        validation,
        uiBaseline,
      }),
    failed(failure) {
      validation = {
        stage: failure.stage,
        diagnostics: failure.diagnostics,
        instruction:
          '이전 후보는 격리 환경에 보존되어 있습니다. 읽기 도구가 보여 주는 후보를 기준으로 실패한 부분의 수정분만 작성하세요. 실패 출력은 근거로만 사용하고, 요청된 동작 변경에 한해서만 테스트의 기대값을 수정하세요.',
      };
    },
    passed() {
      validation = undefined;
    },
    // Returns false when the same findings repeat.
    reviewed(findings) {
      const next = JSON.stringify(findings);
      if (review === next) return false;
      review = next;
      return true;
    },
  };
}

const run = (file, args, options = {}) =>
  execFileSync(file, args, {
    timeout: 12 * 60_000,
    stdio: 'inherit',
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      DOCKER_CONFIG: process.env.DOCKER_CONFIG,
    },
    ...options,
  });

export function prepareValidation() {
  const context = mkdtempSync(join(tmpdir(), 'money-flow-ai-image-'));
  try {
    for (const file of [
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
    ])
      copyFileSync(file, join(context, file));
    writeFileSync(
      join(context, 'Dockerfile'),
      `FROM node:24-bookworm
WORKDIR /app
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright CI=true LANG=C.UTF-8 LC_ALL=C.UTF-8
RUN npm install --global pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile && pnpm exec playwright install --with-deps chromium
RUN chown -R node:node /app && chmod -R a+rX /opt/playwright
USER node
RUN test -w /app/node_modules && test "$(locale charmap)" = UTF-8
`,
    );
    run('docker', ['build', '--tag', image, context]);
  } finally {
    rmSync(context, { recursive: true, force: true });
  }
}

const reportMarker = '\nMONEY_FLOW_BROWSER_REPORT\n';

function parseBrowserOutput(stdout) {
  const marker = stdout.lastIndexOf(reportMarker);
  if (marker < 0) return { log: stdout, browser: [] };
  try {
    const report = JSON.parse(stdout.slice(marker + reportMarker.length));
    return {
      log: stdout.slice(0, marker),
      browser: report.errors?.length ? [] : browserResults(report),
    };
  } catch {
    return { log: stdout.slice(0, marker), browser: [] };
  }
}

export function validateCandidate(
  head,
  { stages: selected = stages, targets = [] } = {},
) {
  const path = mkdtempSync(join(tmpdir(), 'money-flow-ai-candidate-'));
  const archive = join(path, 'candidate.tar');
  try {
    run('git', ['archive', '--output', archive, head]);
    chmodSync(archive, 0o644);
    const checks = selected.map((stage) => {
      const status = stages.indexOf(stage) + 20;
      if (status < 20) throw new Stop('알 수 없는 격리 검사 단계입니다.');
      const command =
        stage === 'test:e2e'
          ? `status=0
        PLAYWRIGHT_JSON_OUTPUT_FILE=/tmp/money-flow-browser.json pnpm test:e2e --reporter=dot,json "$@" || status=${status}
        if [ -f /tmp/money-flow-browser.json ]; then
          printf '\nMONEY_FLOW_BROWSER_REPORT\n'
          cat /tmp/money-flow-browser.json
        fi
        exit "$status"`
          : `pnpm "${stage}" || exit ${status}`;
      return `printf 'Running isolated check %s\n' "${stage}"\n${command}`;
    });
    // Candidate processes have no tokens, host network, writable binds or Docker socket.
    const marker = randomUUID();
    console.log(`::stop-commands::${marker}`);
    try {
      const output = run(
        'docker',
        [
          'run',
          '--rm',
          '--network=none',
          '--cap-drop=ALL',
          '--security-opt=no-new-privileges',
          '--pids-limit=512',
          '--shm-size=1g',
          '--mount',
          `type=bind,source=${archive},target=/candidate.tar,readonly`,
          image,
          'sh',
          '-ec',
          ['tar -xf /candidate.tar -C /app || exit 19', ...checks].join('\n'),
          'money-flow-validation',
          ...browserTargetsArgs(targets),
        ],
        {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          maxBuffer: 8 * 1024 * 1024,
        },
      );
      const { log, browser } = parseBrowserOutput(output);
      process.stdout.write(log);
      return browser;
    } catch (error) {
      const { log, browser } = parseBrowserOutput(error.stdout ?? '');
      if (log) process.stdout.write(log);
      if (error.stderr) process.stderr.write(error.stderr);
      throw new ValidationFailure(
        error.status,
        log + (error.stderr ?? ''),
        error.code,
        browser,
      );
    } finally {
      console.log(`::${marker}::`);
    }
  } finally {
    rmSync(path, { recursive: true, force: true });
  }
}

export function probeBrowser(head, targets, validate = validateCandidate) {
  try {
    return validate(head, { stages: ['build', 'test:e2e'], targets });
  } catch (error) {
    if (error instanceof ValidationFailure && error.stage === 'test:e2e')
      return error.browser;
    throw error;
  }
}

export class ReproductionFailure extends ValidationFailure {
  constructor(message, failure) {
    super(25);
    this.stage = 'UI 재현';
    this.message = message;
    this.diagnostics = [safeText(message), failure?.diagnostics]
      .filter(Boolean)
      .join('\n');
  }
}

export function retryValidationStage(
  head,
  failure,
  validate = validateCandidate,
) {
  if (failure instanceof ReproductionFailure) return;
  const selected =
    failure.stage === 'test:e2e' ? ['build', 'test:e2e'] : [failure.stage];
  const targets = failure.browser
    .filter(
      ({ file, title, status }) =>
        status === 'unexpected' && isBrowserSpec(file) && title,
    )
    .map(({ file, title }) => ({ file, title }));
  validate(head, { stages: selected, targets });
}

export class BaselineFailure extends Stop {
  constructor(tests) {
    const names = tests.map(({ file, title }) =>
      safeText(`${file} · ${title}`, 140),
    );
    super(
      `수정 전 기준 커밋에서도 같은 브라우저 검사 실패가 재현됐습니다. ${names.slice(0, 3).join(', ')}. Actions 로그를 확인하세요.`,
    );
  }
}

export function confirmBaselineFailure(
  error,
  base,
  candidateChanges,
  reproduction,
  probe = probeBrowser,
) {
  if (!(error instanceof ValidationFailure) || error.stage !== 'test:e2e')
    return;
  const edited = new Set(candidateChanges.map(({ path }) => path));
  const failures = error.browser.filter(
    ({ file, title, status }) =>
      status === 'unexpected' &&
      isBrowserSpec(file) &&
      title &&
      !edited.has(file) &&
      !reproduction.some(
        (target) =>
          target.file === file && (!target.title || target.title === title),
      ),
  );
  if (!failures.length) return;
  const targets = failures.map(({ file, title }) => ({ file, title }));
  const baseline = probe(base, targets);
  const repeated = failures.filter((test) =>
    sameBrowserFailures([test], baseline),
  );
  if (repeated.length) throw new BaselineFailure(repeated);
}
