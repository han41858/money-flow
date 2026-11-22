import { expect, it } from 'vitest';
import { example } from '../../app/example';
import {
  blankDiagram,
  copyDiagram,
  decodeDiagram,
  parseFile,
  serializeDiagram,
} from './format';

it('JSON 복원은 그룹, 사용자 금융사, 절대 좌표와 뷰포트를 보존한다', () => {
  const data = structuredClone(example);
  data.groups.push({
    id: 'g',
    name: '공동',
    color: '#234567',
    position: { x: -12, y: 400 },
    width: 500,
    height: 250,
  });
  data.customInstitutions.push({
    id: 'b',
    name: '지역 은행',
    color: '#abcdef',
  });
  Object.assign(data.nodes[2], { groupId: 'g', institutionId: 'b' });
  data.viewport = { x: 55, y: -16, zoom: 1.5 };
  expect(parseFile(serializeDiagram(data))).toEqual(data);
  const copy = copyDiagram(data, '다음 달');
  expect(copy.id).not.toBe(data.id);
  copy.nodes[0].name = '변경';
  expect(data.nodes[0].name).toBe(example.nodes[0].name);
  expect(copy.groups).toEqual(data.groups);
  expect(copy.customInstitutions).toEqual(data.customInstitutions);
});
it('빈 흐름과 최초 버전 데이터를 읽고 잘못된 버전·JSON·참조를 거부한다', () => {
  const blank = blankDiagram();
  expect(decodeDiagram(blank)).toEqual(blank);
  expect(() => parseFile('[')).toThrow(/JSON/);
  expect(() => decodeDiagram({})).toThrow(/버전/);
  expect(() => decodeDiagram({ ...example, schemaVersion: 3 })).toThrow(/최신/);
  expect(() => decodeDiagram({ ...example, schemaVersion: 0 })).toThrow(
    /지원하지/,
  );
  expect(() => decodeDiagram({ ...example, nodes: [] })).toThrow(/형식/);
});

it('스키마 1의 기존 금융사와 다이어그램을 유지하고 스키마 2에서 미지정을 허용한다', () => {
  expect(parseFile(JSON.stringify({ ...example, schemaVersion: 1 }))).toEqual(
    example,
  );
  const unassigned = {
    ...example,
    nodes: example.nodes.map((n) => ({ ...n, institutionId: undefined })),
  };
  expect(() => decodeDiagram({ ...unassigned, schemaVersion: 1 })).toThrow(
    /금융사/,
  );
  expect(decodeDiagram(unassigned)).toEqual(unassigned);
});
