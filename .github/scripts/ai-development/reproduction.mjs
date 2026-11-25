import { stripVTControlCharacters } from 'node:util';
import { Stop } from './github.mjs';

export const isBrowserSpec = (path) => /^tests\/[\w.-]+\.spec\.ts$/.test(path);
export const uiSpecRelevant = (path) =>
  /^src\/(?:app|features)\/.*\.tsx$|^src\/.*\.css$|^src\/features\/(?:editor\/(?:arrange|amountSpacing|graph)|edges\/geometry|groups\/geometry)\.ts$/.test(
    path,
  );

const heading = /^## UI 재현 테스트\s*$/m;
const targetLine = /^- (tests\/[\w.-]+\.spec\.ts) \| (.+)$/;

export function uiReproductionTargets(body) {
  const match = heading.exec(body ?? '');
  if (!match) return [];
  const section = body
    .slice(match.index + match[0].length)
    .split(/^#{1,2} /m)[0];
  const lines = section
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const targets = lines.map((line) => {
    const value = targetLine.exec(line);
    if (!value || value[2].length > 180)
      throw new Stop(
        'UI 재현 테스트는 tests/*.spec.ts | 정확한 테스트 제목 형식으로 지정하세요.',
      );
    return { file: value[1], title: value[2] };
  });
  if (!targets.length || targets.length > 4)
    throw new Stop('UI 재현 테스트를 1개 이상, 최대 4개 지정하세요.');
  return targets;
}

export function browserTargetsArgs(targets) {
  const escaped = (value) => value.replace(/[.*+?^$${}()|[\]\\]/g, '\\$&');
  const files = [...new Set(targets.map(({ file }) => `${escaped(file)}$`))];
  const titles = targets.flatMap(({ title }) =>
    title ? [`${escaped(title)}$`] : [],
  );
  return titles.length ? [...files, '--grep', titles.join('|')] : files;
}

export function browserResults(report) {
  const results = [];
  function collect(suites) {
    for (const suite of suites ?? []) {
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests ?? []) {
          const errors = (test.results?.at(-1)?.errors ?? []).map(
            ({ message }) =>
              stripVTControlCharacters(message ?? '')
                .trim()
                .slice(0, 1800),
          );
          results.push({
            file: spec.file.startsWith('tests/')
              ? spec.file
              : `tests/${spec.file}`,
            title: spec.title,
            status: test.status,
            outcome: test.results?.at(-1)?.status,
            expected: test.expectedStatus,
            errors,
          });
        }
      }
      collect(suite.suites);
    }
  }
  collect(report?.suites);
  return results;
}

export function targetResults(results, targets) {
  return results.filter((test) =>
    targets.some(
      ({ file, title }) =>
        test.file === file && (!title || title === test.title),
    ),
  );
}

export function reproducedTests(results, targets, { requireAll = true } = {}) {
  const failed = targetResults(results, targets).filter(
    ({ status, errors }) =>
      status === 'unexpected' &&
      errors.some((message) => /^(?:Error: )?expect\b/.test(message)),
  );
  const covered =
    failed.length &&
    (!requireAll ||
      targets.every(({ file, title }) =>
        failed.some(
          (test) => test.file === file && (!title || title === test.title),
        ),
      ));
  return covered ? failed.map(({ file, title }) => ({ file, title })) : [];
}

export function sameBrowserFailures(failed, baseline) {
  return (
    failed.length > 0 &&
    failed.every(
      (test) =>
        test.errors.length &&
        baseline.some(
          (other) =>
            other.status === 'unexpected' &&
            other.file === test.file &&
            other.title === test.title &&
            JSON.stringify(other.errors) === JSON.stringify(test.errors),
        ),
    )
  );
}

export function verifiedReproductions(results, cases) {
  return cases.every(({ file, title }) => {
    const matching = targetResults(results, [{ file, title }]);
    return (
      matching.length > 0 &&
      matching.every(
        ({ status, outcome, expected }) =>
          status === 'expected' &&
          outcome === 'passed' &&
          expected === 'passed',
      )
    );
  });
}
