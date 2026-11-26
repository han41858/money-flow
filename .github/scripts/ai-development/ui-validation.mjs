import { checkpoint } from './workspace.mjs';
import {
  probeBrowser,
  ReproductionFailure,
  ValidationFailure,
} from './validation.mjs';
import {
  isBrowserSpec,
  reproducedTests,
  targetResults,
  uiSpecRelevant,
  verifiedReproductions,
} from './reproduction.mjs';

export function candidateReproduction({
  base,
  changes,
  targets,
  initialResults,
  probe = probeBrowser,
  createCheckpoint = checkpoint,
}) {
  if (!targets.length && !changes.some(({ path }) => uiSpecRelevant(path)))
    return [];

  const specs = changes.filter(
    ({ path, text }) => isBrowserSpec(path) && text !== null,
  );
  const selected = targets.length
    ? targets
    : specs.map(({ path }) => ({ file: path }));
  if (!selected.length)
    throw new ReproductionFailure(
      'UI 변경은 요청 동작을 재현하는 tests/*.spec.ts 검사나 이슈에 지정된 재현 검사가 필요합니다.',
    );

  const testEdits = changes.filter(({ path }) => {
    if (!path.startsWith('tests/')) return false;
    return !isBrowserSpec(path) || selected.some(({ file }) => file === path);
  });
  const baseline = testEdits.length ? createCheckpoint(base, testEdits) : base;
  let results = initialResults;
  if (testEdits.length || !targets.length) {
    try {
      results = probe(baseline, selected);
    } catch (error) {
      if (
        !testEdits.length ||
        !(error instanceof ValidationFailure) ||
        !['typecheck', 'build'].includes(error.stage)
      )
        throw error;
      throw new ReproductionFailure(
        '수정 전 코드에 후보 테스트와 지원 파일만 적용한 트리에서 타입 검사 또는 번들 빌드가 실패했습니다. 재현 테스트가 후보 제품 코드의 API에 의존하는지 확인하세요.',
        error,
      );
    }
  }
  const cases = reproducedTests(results, selected, {
    requireAll: targets.length > 0,
  });
  if (!cases.length)
    throw new ReproductionFailure(
      '수정 전 코드에서 요청 동작의 브라우저 테스트가 단언 실패로 재현되지 않았습니다. 재현 검사의 대상과 단언을 확인하세요.',
    );
  return cases;
}

export function assertUiReproductionFixed(browser, cases) {
  if (cases.length && !verifiedReproductions(browser, cases))
    throw new ReproductionFailure(
      '재현된 UI 테스트가 후보에서 실제로 실행되어 통과했는지 확인할 수 없습니다.',
    );
}

export function describeUiBaseline(results, targets) {
  const repro = reproducedTests(results, targets, { requireAll: false });
  return {
    targets,
    reproduced: repro,
    observed: targetResults(results, targets).map(
      ({ file, title, status }) => ({
        file,
        title,
        status,
      }),
    ),
  };
}
