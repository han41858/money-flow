import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { checkpoint, resolveEdits, snapshot } from './workspace.mjs';
import {
  browserResults,
  browserTargetsArgs,
  uiReproductionTargets,
} from './reproduction.mjs';
import {
  assertUiReproductionFixed,
  candidateReproduction,
} from './ui-validation.mjs';
import {
  BaselineFailure,
  confirmBaselineFailure,
  ReproductionFailure,
  retryValidationStage,
  ValidationFailure,
} from './validation.mjs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
const spec = { file: 'tests/editor.spec.ts', title: '금액이 읽힌다 (390px)' };
const passed = {
  ...spec,
  status: 'expected',
  outcome: 'passed',
  expected: 'passed',
  errors: [],
};
const failed = {
  ...spec,
  status: 'unexpected',
  outcome: 'failed',
  expected: 'passed',
  errors: [
    'Error: expect(received).toBe(expected) failed\nExpected: 20\nReceived: 10',
  ],
};

test('실패 후보를 읽어 수정분만 적용하고 게시할 때 합친 차이를 반환한다', () => {
  const head = git('rev-parse', 'HEAD').trim();
  const path = 'src/ai-validation-test-candidate.ts';
  const removal = 'src/features/editor/arrange.ts';
  const first = checkpoint(head, [
    { path, text: 'const state = 1;\n' },
    { path: removal, text: null },
  ]);
  const work = snapshot(head, first);
  assert.match(
    work.inspect('read_diff', { line: 1 }),
    /ai-validation-test-candidate/,
  );
  assert.match(work.inspect('read_file', { path, line: 1 }), /state = 1/);
  const repair = resolveEdits(
    [{ path, before: 'state = 1', after: 'state = 2' }],
    work,
  );
  const second = checkpoint(first, repair);
  assert.deepEqual(snapshot(head, second).existingBranchEdits(), [
    { path, text: 'const state = 2;\n' },
    { path: removal, text: null },
  ]);
  assert.equal(git('rev-parse', 'HEAD').trim(), head);
  assert.equal(git('for-each-ref', '--points-at', second), '');
  assert.throws(
    () =>
      checkpoint(head, [{ path: '.github/workflows/ci.yml', text: 'changed' }]),
    /허용 범위/,
  );
});

test('지정된 UI 재현 검사의 파일 본문만 읽기 확인에 사용한다', () => {
  const head = git('rev-parse', 'HEAD').trim();
  const work = snapshot(head, head);
  const changed = ['src/features/editor/arrange.ts'];
  work.inspect('read_file', { path: 'tests/storage.spec.ts', line: 1 });
  assert(work.needsUiSpec(changed, [spec]));
  work.inspect('read_file', { path: spec.file, line: 1 });
  assert(!work.needsUiSpec(changed, [spec]));
  const unread = snapshot(head, head);
  assert(unread.needsUiSpec(changed));
});

test('이슈의 UI 재현 검사는 파일과 정확한 제목으로 선택한다', () => {
  const issue = `## 재현\n수입과 계좌를 연결\n\n## UI 재현 테스트\n- ${spec.file} | ${spec.title}\n\n## 완료 기준\n레이블 확인`;
  assert.deepEqual(uiReproductionTargets(issue), [spec]);
  const [file, grep, title] = browserTargetsArgs([spec]);
  assert.equal(grep, '--grep');
  assert(new RegExp(file).test('/app/tests/editor.spec.ts'));
  assert(new RegExp(title).test(spec.title));
  assert(!new RegExp(title).test(spec.title + ' 다른 경우'));
  assert.throws(() =>
    uiReproductionTargets(
      '## UI 재현 테스트\n- ../playwright.config.ts | test',
    ),
  );
});

test('Playwright 보고서에서 실제 결과와 단언의 기대값·실제값을 보존한다', () => {
  const report = {
    suites: [
      {
        suites: [
          {
            specs: [
              {
                file: 'editor.spec.ts',
                title: spec.title,
                tests: [
                  {
                    status: 'unexpected',
                    expectedStatus: 'passed',
                    results: [
                      {
                        status: 'failed',
                        errors: [{ message: failed.errors[0] }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  assert.deepEqual(browserResults(report), [failed]);
});

test('재현 테스트와 지원 파일을 기준 트리에 적용하고 후보의 실제 통과를 확인한다', () => {
  const newTest = { path: spec.file, text: 'test(...)' };
  const fixture = { path: 'tests/exampleFixture.ts', text: 'fixture' };
  const changes = [
    newTest,
    { path: 'src/features/editor/arrange.ts', text: 'layout' },
    fixture,
    { path: 'tests/storage.spec.ts', text: 'unrelated test' },
  ];
  const cases = candidateReproduction({
    base: 'base',
    changes,
    targets: [spec],
    initialResults: [],
    createCheckpoint(head, edits) {
      assert.equal(head, 'base');
      assert.deepEqual(edits, [newTest, fixture]);
      return 'tests-only';
    },
    probe(head, targets) {
      assert.equal(head, 'tests-only');
      assert.deepEqual(targets, [spec]);
      return [failed];
    },
  });
  assert.deepEqual(cases, [spec]);
  assert.doesNotThrow(() => assertUiReproductionFixed([passed], cases));
  for (const result of [
    [],
    [failed],
    [{ ...passed, outcome: 'skipped' }],
    [{ ...passed, expected: 'failed' }],
  ])
    assert.throws(
      () => assertUiReproductionFixed(result, cases),
      ReproductionFailure,
    );
});

test('재현용 기준 트리의 빌드 오류와 후보의 빌드 오류를 구분한다', () => {
  const build = new ValidationFailure(
    24,
    'tests/groups.spec.ts(35,5): error TS2554',
  );
  assert.throws(
    () =>
      candidateReproduction({
        base: 'base',
        changes: [{ path: spec.file, text: 'test(...)' }],
        targets: [spec],
        createCheckpoint: () => 'tests-only',
        probe: () => {
          throw build;
        },
      }),
    (error) => {
      assert(error instanceof ReproductionFailure);
      assert.equal(error.stage, 'UI 재현');
      assert.match(error.message, /수정 전 코드/);
      assert.match(
        error.diagnostics,
        /tests\/groups\.spec\.ts\(35,5\): error TS2554/,
      );
      retryValidationStage('candidate', error, () =>
        assert.fail('재현 단계는 별도로 다시 검사합니다.'),
      );
      return true;
    },
  );
});

test('단언 오류를 재현하지 못하거나 지정 검사 일부만 실패한 UI 후보를 거부한다', () => {
  const changes = [{ path: 'src/features/editor/arrange.ts', text: 'layout' }];
  const infra = {
    ...failed,
    errors: ['UnknownError: Internal error opening backing store'],
  };
  for (const initialResults of [[passed], [infra], []])
    assert.throws(
      () =>
        candidateReproduction({
          base: 'base',
          changes,
          targets: [spec],
          initialResults,
        }),
      ReproductionFailure,
    );
  assert.throws(
    () =>
      candidateReproduction({
        base: 'base',
        changes,
        targets: [spec, { ...spec, title: '다른 화면' }],
        initialResults: [failed],
      }),
    ReproductionFailure,
  );
  assert.throws(
    () => candidateReproduction({ base: 'base', changes, targets: [] }),
    ReproductionFailure,
  );
});

test('복구 시 실패한 검사나 브라우저 사례를 먼저 다시 실행한다', () => {
  const cases = [
    [new ValidationFailure(21), { stages: ['typecheck'], targets: [] }],
    [
      new ValidationFailure(25, '', undefined, [failed]),
      { stages: ['build', 'test:e2e'], targets: [spec] },
    ],
  ];
  for (const [error, options] of cases)
    retryValidationStage('candidate', error, (head, actual) => {
      assert.equal(head, 'candidate');
      assert.deepEqual(actual, options);
    });
});

test('같은 기준 브라우저 오류만 환경 중단으로 기록한다', () => {
  const error = new ValidationFailure(25, '', undefined, [failed]);
  assert.throws(
    () =>
      confirmBaselineFailure(error, 'base', [], [], (head, targets) => {
        assert.equal(head, 'base');
        assert.deepEqual(targets, [spec]);
        return [failed];
      }),
    BaselineFailure,
  );
  confirmBaselineFailure(error, 'base', [], [], () => [
    {
      ...failed,
      errors: [failed.errors[0].replace('Received: 10', 'Received: 11')],
    },
  ]);
  for (const [changes, targets] of [
    [[{ path: spec.file }], []],
    [[], [spec]],
  ])
    confirmBaselineFailure(error, 'base', changes, targets, () =>
      assert.fail('변경된 재현 검사는 환경 오류로 분류하지 않습니다.'),
    );
});
