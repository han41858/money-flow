import { expect, test } from 'vitest';
import { example } from '../../app/example';
import { blankDiagram, decodeDiagram } from '../../lib/storage/format';
import type { Diagram } from '../../types/diagram';
import { compactV2, v2Link } from '../../../tests/shareV2Fixture';
import { encodeBinary } from './binary';
import { encodeShare, decodeShare } from './codec';

const base = 'https://example.org/money/';
const sharedIdentity = {
  id: 'shared',
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
  viewport: { x: 0, y: 0, zoom: 1 },
};

async function legacyLink(payload: unknown) {
  const bytes = await new Response(
    new Blob([JSON.stringify(payload)])
      .stream()
      .pipeThrough(new CompressionStream('gzip')),
  ).arrayBuffer();
  return base + '#share=1.' + Buffer.from(bytes).toString('base64url');
}

function household(): Diagram {
  const diagram = blankDiagram();
  const brand = {
    id: crypto.randomUUID(),
    name: '동네 신협',
    color: '#336699',
  };
  const group = {
    id: crypto.randomUUID(),
    name: '공동 자금',
    color: '#92ab86',
    position: { x: -40.4, y: 12.6 },
    width: 380.3,
    height: 240.7,
  };
  const salary = {
    id: crypto.randomUUID(),
    type: 'income' as const,
    name: '급여 & 상여 💳',
    position: { x: 10.25, y: -3.75 },
  };
  const account = {
    id: crypto.randomUUID(),
    type: 'account' as const,
    name: '생활비 통장',
    owner: '공동',
    groupId: group.id,
    institutionId: brand.id,
    position: { x: 120.5, y: 80.49 },
  };
  const card = {
    id: crypto.randomUUID(),
    type: 'card' as const,
    name: '생활비 카드',
    groupId: group.id,
    institutionId: 'shinhan-card',
    position: { x: 300, y: 80 },
  };
  return {
    ...diagram,
    name: '12월 흐름',
    customInstitutions: [brand],
    groups: [group],
    nodes: [salary, account, card],
    edges: [
      {
        id: crypto.randomUUID(),
        source: salary.id,
        target: account.id,
        min: 3000000,
        max: 3500000,
        memo: '매월 25일',
      },
      {
        id: crypto.randomUUID(),
        source: account.id,
        target: card.id,
        min: 800000,
        max: 800000,
      },
    ],
  };
}

test('ID를 순번으로 바꾸고 좌표를 정수로 맞추되 이름, 메모, 금융사, 그룹과 연결 관계를 보존한다', async () => {
  const source = household();
  const link = await encodeShare(source, base + '?unused=yes#old');
  expect(link).toMatch(/^https:\/\/example.org\/money\/#share=3\.[\w-]+$/);
  const result = await decodeShare(link);
  expect(result).toEqual({
    ...sharedIdentity,
    schemaVersion: source.schemaVersion,
    name: '12월 흐름',
    customInstitutions: [{ id: '0', name: '동네 신협', color: '#336699' }],
    groups: [
      {
        id: '0',
        name: '공동 자금',
        color: '#92ab86',
        position: { x: -40, y: 13 },
        width: 380,
        height: 241,
      },
    ],
    nodes: [
      {
        id: '0',
        type: 'income',
        name: '급여 & 상여 💳',
        position: { x: 10, y: -4 },
      },
      {
        id: '1',
        type: 'account',
        name: '생활비 통장',
        groupId: '0',
        institutionId: '0',
        position: { x: 121, y: 80 },
      },
      {
        id: '2',
        type: 'card',
        name: '생활비 카드',
        groupId: '0',
        institutionId: 'shinhan-card',
        position: { x: 300, y: 80 },
      },
    ],
    edges: [
      {
        id: '0',
        source: '0',
        target: '1',
        min: 3000000,
        max: 3500000,
        memo: '매월 25일',
      },
      { id: '1', source: '1', target: '2', min: 800000, max: 800000 },
    ],
  });
});

test('로컬 ID와 날짜, 뷰포트는 공유하지 않는다', async () => {
  const source = household();
  const rewritten = {
    ...source,
    id: 'not-shared',
    createdAt: sharedIdentity.createdAt,
    updatedAt: sharedIdentity.updatedAt,
    viewport: { x: 10, y: 20, zoom: 2 },
    nodes: source.nodes.map((node) => ({ ...node, id: `local-${node.id}` })),
    edges: source.edges.map((edge) => ({
      ...edge,
      id: `local-${edge.id}`,
      source: `local-${edge.source}`,
      target: `local-${edge.target}`,
    })),
  };
  expect(await encodeShare(rewritten, base)).toBe(
    await encodeShare(source, base),
  );
});

test('v2와 v3는 중첩 그룹과 선택 필드가 있는 흐름을 동일하게 복원한다', async () => {
  const source = household();
  const [parent] = source.groups;
  source.description = '한글 설명';
  source.groups.unshift({
    ...parent,
    id: 'child',
    parentId: parent.id,
    width: 0.4,
  });
  source.nodes[0] = {
    ...source.nodes[0],
    type: 'income',
    payer: '회사',
    groupId: 'child',
  };
  source.nodes.push({
    id: 'loan',
    type: 'expense',
    category: 'loan',
    name: '대출 상환',
    position: { x: 0, y: 0 },
  });
  source.edges[1].memo = '';
  source.edges[1].min = Number.MAX_SAFE_INTEGER - 1;
  source.edges[1].max = Number.MAX_SAFE_INTEGER;
  const legacy = await decodeShare(v2Link(source, base));
  const expected = decodeDiagram(
    JSON.parse(JSON.stringify({ ...compactV2(source), ...sharedIdentity })),
  );
  expect(legacy).toEqual(expected);
  expect(await decodeShare(await encodeShare(source, base))).toEqual(legacy);
});

test.each([
  { name: 'a', mode: 0 },
  { name: '반복 '.repeat(100), mode: 1 },
])(
  'v3는 실제 주소가 더 짧은 모드를 선택한다 (모드 $mode)',
  async ({ name, mode }) => {
    const source = { ...blankDiagram(), name: name.trim() };
    // An empty diagram has consecutive zero counts that Deflate can shorten.
    if (mode === 0) {
      source.nodes.push({
        id: '0',
        type: 'expense',
        category: 'loan',
        name: 'b',
        position: { x: 3, y: 4 },
      });
    }
    const binary = encodeBinary(source);
    const compressed = await new Response(
      new Blob([binary])
        .stream()
        .pipeThrough(new CompressionStream('deflate-raw')),
    ).arrayBuffer();
    const candidates = [binary, new Uint8Array(compressed)].map(
      (bytes, index) =>
        base +
        '#share=3.' +
        Buffer.concat([Buffer.from([index]), bytes]).toString('base64url'),
    );
    expect(candidates[mode].length).toBeLessThan(candidates[1 - mode].length);
    const link = await encodeShare(source, base);
    expect(link).toBe(candidates[mode]);
    expect(await decodeShare(link)).toEqual({ ...source, ...sharedIdentity });
  },
);

test('노드 30개·연결 30개 흐름의 주소가 이전 형식의 절반 이하로 줄어든다', async () => {
  const source = blankDiagram();
  source.nodes = Array.from({ length: 30 }, (_, index) => ({
    id: crypto.randomUUID(),
    type: index === 0 ? ('income' as const) : ('account' as const),
    name: '통장 ' + index,
    position: { x: index * 37.25, y: index * 11.75 },
  }));
  source.edges = source.nodes.slice(1).map((node, index) => ({
    id: crypto.randomUUID(),
    source: source.nodes[0].id,
    target: node.id,
    min: (index + 1) * 10000,
    max: (index + 1) * 10000,
  }));
  source.edges.push({
    id: crypto.randomUUID(),
    source: source.nodes[1].id,
    target: source.nodes[2].id,
    min: 0,
    max: 50000,
  });
  const previous = await legacyLink({
    schemaVersion: source.schemaVersion,
    name: source.name,
    nodes: source.nodes,
    edges: source.edges,
    groups: source.groups,
    customInstitutions: source.customInstitutions,
  });
  const link = await encodeShare(source, base);
  expect(link.length).toBeLessThanOrEqual(previous.length / 2);
  expect(link.length).toBeLessThan(v2Link(source, base).length);
});

test('이전 형식(1)으로 만든 링크도 원래 ID 그대로 연다', async () => {
  const { schemaVersion, name, nodes, edges, groups, customInstitutions } =
    example;
  const link = await legacyLink({
    schemaVersion: 1,
    name,
    nodes: nodes.map((node) => ({ ...node, owner: '이전 소유자' })),
    edges,
    groups,
    customInstitutions,
  });
  expect(await decodeShare(link)).toEqual({
    ...sharedIdentity,
    schemaVersion,
    name,
    nodes,
    edges,
    groups,
    customInstitutions,
  });
});

test('손상, 미래 형식과 잘못된 스키마를 거부한다', async () => {
  await expect(decodeShare(base + '#share=1.ABC')).rejects.toThrow('손상');
  await expect(decodeShare(base + '#share=2.ABC')).rejects.toThrow('손상');
  await expect(decodeShare(base + '#share=3.ABC')).rejects.toThrow('손상');
  await expect(decodeShare(base + '#share=4.ABC')).rejects.toThrow('버전');
  await expect(
    decodeShare(await legacyLink({ schemaVersion: 99 })),
  ).rejects.toThrow('최신');
});

test('v3는 잘못된 모드, 압축, 길이, UTF-8, 참조와 후행 바이트를 거부한다', async () => {
  const binary = encodeBinary({ ...blankDiagram(), name: 'a' });
  const damaged = [
    [2, ...binary],
    [1, 255],
    [0, ...binary.slice(0, -1)],
    [0, 0, 128],
    [0, 0, 1, 255, 0, 0, 0, 0, 0],
    // One node has a group reference, but the group list is empty.
    [0, 0, 1, 97, 0, 0, 0, 1, 4, 1, 98, 0, 0, 0, 0],
    [0, ...binary, 0],
  ];
  for (const bytes of damaged) {
    const link = base + '#share=3.' + Buffer.from(bytes).toString('base64url');
    await expect(decodeShare(link)).rejects.toThrow('손상');
  }
});

test('전체 URL 8,000자는 허용하고 한 글자라도 넘으면 JSON을 안내한다', async () => {
  const url = await encodeShare(example, base);
  const exact = base + 'x'.repeat(8000 - url.length);
  const atLimit = await encodeShare(example, exact);
  expect(atLimit).toHaveLength(8000);
  await expect(decodeShare(atLimit)).resolves.toMatchObject({
    name: example.name,
  });
  await expect(encodeShare(example, exact + 'x')).rejects.toThrow('JSON');
  await expect(decodeShare(atLimit + 'x')).rejects.toThrow('JSON');
});
