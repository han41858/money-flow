import type { Diagram } from '../../types/diagram';
import { decodeDiagram } from '../../lib/storage/format';

const tooLong =
  '공유 주소가 8,000자를 넘습니다. JSON 파일로 내보내 공유하세요.';
const malformed = '공유 링크가 손상되었습니다. 전체 주소를 다시 확인하세요.';

export async function encodeShare(diagram: Diagram, pageUrl: string) {
  const url = new URL(pageUrl);
  url.hash = '';
  url.search = '';
  const {
    schemaVersion,
    name,
    description,
    nodes,
    edges,
    groups,
    customInstitutions,
  } = decodeDiagram(diagram);
  const payload = JSON.stringify({
    schemaVersion,
    name,
    description,
    nodes,
    edges,
    groups,
    customInstitutions,
  });
  const compressed = new Blob([payload])
    .stream()
    .pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(compressed).arrayBuffer());
  if (bytes.length > 6000) throw new Error(tooLong);
  const data = btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
  url.hash = 'share=1.' + data;
  if (url.href.length > 8000) throw new Error(tooLong);
  return url.href;
}

export async function decodeShare(pageUrl: string): Promise<Diagram> {
  if (pageUrl.length > 8000) throw new Error(tooLong);
  const match = /^#share=(\d+)\.([\w-]+)$/.exec(new URL(pageUrl).hash);
  if (!match) throw new Error(malformed);
  if (match[1] !== '1') throw new Error('지원하지 않는 공유 링크 버전입니다.');
  let value: unknown;
  try {
    const bytes = Uint8Array.from(
      atob(match[2].replaceAll('-', '+').replaceAll('_', '/')),
      (c) => c.charCodeAt(0),
    );
    const raw = new Blob([bytes])
      .stream()
      .pipeThrough(new DecompressionStream('gzip'));
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
