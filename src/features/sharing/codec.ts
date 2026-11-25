import type { Diagram } from '../../types/diagram';
import { decodeDiagram } from '../../lib/storage/format';
import { decodeBinary, encodeBinary } from './binary';

const tooLong =
  '공유 주소가 8,000자를 넘습니다. JSON 파일로 내보내 공유하세요.';
const malformed = '공유 링크가 손상되었습니다. 전체 주소를 다시 확인하세요.';

// Format 1 used gzip. Format 2 uses headerless deflate-raw and compact IDs.
const compressions: Partial<Record<string, CompressionFormat>> = {
  '1': 'gzip',
  '2': 'deflate-raw',
};
const maxUrlLength = 8000;
const rawMode = 0;
const deflateMode = 1;

export async function encodeShare(diagram: Diagram, pageUrl: string) {
  const url = new URL(pageUrl);
  url.hash = '';
  url.search = '';
  const binary = encodeBinary(decodeDiagram(diagram));
  const compressed = new Blob([binary])
    .stream()
    .pipeThrough(new CompressionStream('deflate-raw'));
  const deflated = new Uint8Array(await new Response(compressed).arrayBuffer());

  // Both candidates use the same URL prefix and a one-byte mode marker.
  // Unpadded base64url length grows strictly with the byte length.
  const useDeflate = deflated.length < binary.length;
  const bytes = useDeflate ? deflated : binary;
  const mode = useDeflate ? deflateMode : rawMode;
  const prefix = `${url.href}#share=3.`;
  if (prefix.length + Math.ceil(((bytes.length + 1) * 4) / 3) > maxUrlLength)
    throw new Error(tooLong);
  const data = btoa(String.fromCharCode(mode, ...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
  return prefix + data;
}

function withSharedIdentity(value: object): Diagram {
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

export async function decodeShare(pageUrl: string): Promise<Diagram> {
  if (pageUrl.length > maxUrlLength) throw new Error(tooLong);
  const match = /^#share=(\d+)\.([\w-]+)$/.exec(new URL(pageUrl).hash);
  if (!match) throw new Error(malformed);
  const [, version, data] = match;
  const compression = compressions[version];
  if (version !== '3' && !compression)
    throw new Error('지원하지 않는 공유 링크 버전입니다.');
  let value: unknown;
  try {
    const bytes = Uint8Array.from(
      atob(data.replaceAll('-', '+').replaceAll('_', '/')),
      (c) => c.charCodeAt(0),
    );
    if (version === '3') {
      const mode = bytes[0];
      const payload = bytes.slice(1);
      if (mode === rawMode) return withSharedIdentity(decodeBinary(payload));
      if (mode !== deflateMode) throw new Error(malformed);
      const inflated = new Blob([payload])
        .stream()
        .pipeThrough(new DecompressionStream('deflate-raw'));
      const binary = new Uint8Array(await new Response(inflated).arrayBuffer());
      return withSharedIdentity(decodeBinary(binary));
    }
    const raw = new Blob([bytes])
      .stream()
      .pipeThrough(new DecompressionStream(compression!));
    value = await new Response(raw).json();
  } catch {
    throw new Error(malformed);
  }
  if (!value || typeof value !== 'object') throw new Error(malformed);
  return withSharedIdentity(value);
}
