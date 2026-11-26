import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const staticStages = ['format:check', 'typecheck', 'lint', 'test', 'build'];
export const browserStage = 'test:e2e';
export const stages = [...staticStages, browserStage];

export function packageScript(stage) {
  return stage === 'build' ? 'build:bundle' : stage;
}

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const phase = process.argv[2];
  const selected = { static: staticStages, browser: [browserStage] }[phase];
  if (!selected)
    throw new Error('Specify the static or browser verification phase.');
  for (const stage of selected) {
    console.log(`::group::${stage}`);
    try {
      execFileSync('pnpm', [packageScript(stage)], { stdio: 'inherit' });
    } finally {
      console.log('::endgroup::');
    }
  }
}
