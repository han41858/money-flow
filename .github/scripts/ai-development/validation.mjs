import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { safeText, Stop } from './github.mjs';

const image = 'money-flow-ai-validation';
const stages = [
  'format:check',
  'typecheck',
  'lint',
  'test',
  'build',
  'test:e2e',
];

export class ValidationFailure extends Stop {
  constructor(status, output = '') {
    const stage = stages[status - 20];
    const description = stage
      ? `격리 검사 실패 · ${stage}`
      : status === 19
        ? '격리 검사 실패 · 후보 파일 복사'
        : `격리 검사 실행 실패 (종료 코드: ${status ?? '없음'})`;
    super(description + '. Actions 로그에서 상세 내용을 확인하세요.');
    this.stage = stage;
    this.diagnostics = output
      .slice(-4500)
      .split('\n')
      .map((line) => safeText(line, 350))
      .join('\n');
  }
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
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright CI=true
RUN npm install --global pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile && pnpm exec playwright install --with-deps chromium
RUN chown -R node:node /app && chmod -R a+rX /opt/playwright
USER node
RUN test -w /app/node_modules
`,
    );
    run('docker', ['build', '--tag', image, context]);
  } finally {
    rmSync(context, { recursive: true, force: true });
  }
}

export function validateCandidate(head, changes) {
  const path = mkdtempSync(join(tmpdir(), 'money-flow-ai-candidate-'));
  const candidate = join(path, 'source');
  const archive = join(path, 'candidate.tar');
  try {
    mkdirSync(candidate);
    run('git', ['archive', '--output', archive, head]);
    run('tar', ['-xf', archive, '-C', candidate]);
    for (const change of changes) {
      const target = join(candidate, change.path);
      if (change.text === null) rmSync(target);
      else {
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, change.text);
      }
    }
    // No tokens, host network, writable mounts, or Docker socket are exposed.
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
          `type=bind,source=${candidate},target=/candidate,readonly`,
          image,
          'sh',
          '-ec',
          `
        cp -R /candidate/. /app/ || exit 19
        status=20
        for stage in ${stages.join(' ')}; do
          printf 'Running isolated check %s\n' "$stage"
          pnpm "$stage" || exit "$status"
          status=$((status + 1))
        done
      `,
        ],
        {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          maxBuffer: 8 * 1024 * 1024,
        },
      );
      process.stdout.write(output);
    } catch (error) {
      if (error.stdout) process.stdout.write(error.stdout);
      if (error.stderr) process.stderr.write(error.stderr);
      throw new ValidationFailure(
        error.status,
        [error.stdout, error.stderr].filter(Boolean).join('\n'),
      );
    } finally {
      console.log(`::${marker}::`);
    }
  } finally {
    rmSync(path, { recursive: true, force: true });
  }
}
