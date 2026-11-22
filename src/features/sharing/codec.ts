import type { Diagram } from '../../types/diagram';
import { decodeDiagram } from '../../lib/storage/format';

const tooLong =
  '공유 주소가 8,000자를 넘습니다. JSON 파일로 내보내 공유하세요.';
const malformed = '공유 링크가 손상되었습니다. 전체 주소를 다시 확인하세요.';

// Format 1 used gzip. Format 2 uses headerless deflate-raw and compact IDs.
const compressions: Partial<Record<string, CompressionFormat>> = {
  '1': 'gzip',
  '2': 'deflate-raw',
};
const currentFormat = '2';

function shortIds(items: { id: string }[]) {
  return new Map(items.map((item, index) => [item.id, index.toString(36)]));
}

// Random IDs do not compress and dominate the link length.
// Replace them with list indices and round coordinates to whole pixels.
export function compactForShare(diagram: Diagram) {
  const nodeIds = shortIds(diagram.nodes);
  const edgeIds = shortIds(diagram.edges);
  const groupIds = shortIds(diagram.groups);
  const institutionIds = shortIds(diagram.customInstitutions);
  const round = ({ x, y }: { x: number; y: number }) => ({
    x: Math.round(x),
    y: Math.round(y),
  });

  return {
    schemaVersion: diagram.schemaVersion,
    name: diagram.name,
    description: diagram.description,
    nodes: diagram.nodes.map((node) => ({
      ...node,
      id: nodeIds.get(node.id)!,
      position: round(node.position),
      groupId: node.groupId && groupIds.get(node.groupId),
      // Built-in institution IDs are kept as they are.
      institutionId:
        node.institutionId &&
        (institutionIds.get(node.institutionId) ?? node.institutionId),
    })),
    edges: diagram.edges.map((edge) => ({
      ...edge,
      id: edgeIds.get(edge.id)!,
      source: nodeIds.get(edge.source)!,
      target: nodeIds.get(edge.target)!,
    })),
    groups: diagram.groups.map((group) => ({
      ...group,
      id: groupIds.get(group.id)!,
      position: round(group.position),
      width: Math.max(1, Math.round(group.width)),
      height: Math.max(1, Math.round(group.height)),
    })),
    customInstitutions: diagram.customInstitutions.map((institution) => ({
      ...institution,
      id: institutionIds.get(institution.id)!,
    })),
  };
}

export async function encodeShare(diagram: Diagram, pageUrl: string) {
  const url = new URL(pageUrl);
  url.hash = '';
  url.search = '';
  const payload = JSON.stringify(compactForShare(decodeDiagram(diagram)));
  const compressed = new Blob([payload])
    .stream()
    .pipeThrough(new CompressionStream(compressions[currentFormat]!));
  const bytes = new Uint8Array(await new Response(compressed).arrayBuffer());
  if (bytes.length > 6000) throw new Error(tooLong);
  const data = btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
  url.hash = 'share=' + currentFormat + '.' + data;
  if (url.href.length > 8000) throw new Error(tooLong);
  return url.href;
}

export async function decodeShare(pageUrl: string): Promise<Diagram> {
  if (pageUrl.length > 8000) throw new Error(tooLong);
  const match = /^#share=(\d+)\.([\w-]+)$/.exec(new URL(pageUrl).hash);
  if (!match) throw new Error(malformed);
  const compression = compressions[match[1]];
  if (!compression) throw new Error('지원하지 않는 공유 링크 버전입니다.');
  let value: unknown;
  try {
    const bytes = Uint8Array.from(
      atob(match[2].replaceAll('-', '+').replaceAll('_', '/')),
      (c) => c.charCodeAt(0),
    );
    const raw = new Blob([bytes])
      .stream()
      .pipeThrough(new DecompressionStream(compression));
    value = await new Response(raw).json();
  } catch {
    throw new Error(malformed);
  }
  if (!value || typeof value !== 'object') throw new Error(malformed);
  // Local identity and timestamps are assigned only when the recipient saves a copy.
  const epoch = new Date(0).toISOString();
  return decodeDiagram({
    ...value,
    id: 'shared',
    createdAt: epoch,
    updatedAt: epoch,
    viewport: { x: 0, y: 0, zoom: 1 },
  });
}
