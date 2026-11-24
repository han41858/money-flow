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
import { Stop } from './github.mjs';

const image = 'money-flow-ai-validation';
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
RUN chown node:node /app package.json pnpm-lock.yaml pnpm-workspace.yaml && chmod -R a+rX /opt/playwright
USER node
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
      run('docker', [
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
        cp -R /candidate/. /app/
        for stage in format:check typecheck lint test build test:e2e; do
          printf 'Running isolated check %s\n' "$stage"
          pnpm "$stage"
        done
      `,
      ]);
    } finally {
      console.log(`::${marker}::`);
    }
  } catch {
    throw new Stop(
      '후보 코드의 격리 검사가 실패했습니다. 실행 로그에서 실패 단계를 확인하세요.',
    );
  } finally {
    rmSync(path, { recursive: true, force: true });
  }
}
