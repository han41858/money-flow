import { diagramSchema, type Diagram } from '../../types/diagram';

const currentVersion = 2;
// Each key is the input version of a pure, one-version migration.
const migrations: Partial<Record<number, (input: object) => object>> = {
  1(input) {
    // In v1 accounts and cards always carried the chosen (or default) institution.
    if (
      'nodes' in input &&
      Array.isArray(input.nodes) &&
      input.nodes.some(
        (node) =>
          node &&
          (node.type === 'account' || node.type === 'card') &&
          !node.institutionId,
      )
    )
      throw new Error('이전 버전의 금융사 데이터가 올바르지 않습니다.');
    return { ...input, schemaVersion: 2 };
  },
};

export function decodeDiagram(input: unknown): Diagram {
  if (
    !input ||
    typeof input !== 'object' ||
    !('schemaVersion' in input) ||
    !Number.isSafeInteger(input.schemaVersion)
  ) {
    throw new Error('다이어그램의 스키마 버전을 확인할 수 없습니다.');
  }
  const version = input.schemaVersion as number;
  if (version > currentVersion)
    throw new Error(
      '더 최신 버전의 다이어그램입니다. 앱을 업데이트한 뒤 다시 여세요.',
    );
  let data: object = input;
  for (let v = version; v < currentVersion; v++) {
    const migrate = migrations[v];
    if (!migrate) throw new Error('지원하지 않는 다이어그램 버전입니다.');
    data = migrate(data);
  }
  const result = diagramSchema.safeParse(data);
  if (!result.success)
    throw new Error(
      '다이어그램 데이터가 손상되었거나 형식이 올바르지 않습니다.',
    );
  return result.data;
}

export function parseFile(text: string) {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('JSON 파일을 읽을 수 없습니다. 파일 형식을 확인하세요.');
  }
  return decodeDiagram(data);
}

export function serializeDiagram(diagram: Diagram) {
  return JSON.stringify(decodeDiagram(diagram), null, 2);
}

export function copyDiagram(source: Diagram, name = source.name) {
  const now = new Date().toISOString();
  return {
    ...structuredClone(source),
    id: crypto.randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
  };
}

export function blankDiagram(): Diagram {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    schemaVersion: 2,
    name: '새 자금 흐름',
    createdAt: now,
    updatedAt: now,
    nodes: [],
    edges: [],
    groups: [],
    customInstitutions: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}
