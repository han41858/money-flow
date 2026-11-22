import { expect, test } from 'vitest';
import { example } from '../../app/example';
import { encodeShare, decodeShare } from './codec';
const base = 'https://example.org/money/';
test('유니코드 이름, 메모, 금융사, 그룹을 복원하고 로컬 ID와 날짜는 공유하지 않는다', async () => {
  const source = { ...example, name: '급여 & 생활비 💳' };
  const link = await encodeShare(source, base + '?unused=yes#old');
  expect(link).toMatch(/^https:\/\/example.org\/money\/#share=1\.[\w-]+$/);
  const result = await decodeShare(link);
  expect(result).toEqual({
    ...source,
    id: 'shared',
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    viewport: { x: 0, y: 0, zoom: 1 },
  });
});
test('손상, 미래 형식과 잘못된 스키마를 거부한다', async () => {
  await expect(decodeShare(base + '#share=1.ABC')).rejects.toThrow('손상');
  await expect(decodeShare(base + '#share=2.ABC')).rejects.toThrow('버전');
  const bytes = await new Response(
    new Blob(['{"schemaVersion":99}'])
      .stream()
      .pipeThrough(new CompressionStream('gzip')),
  ).arrayBuffer();
  await expect(
    decodeShare(base + '#share=1.' + Buffer.from(bytes).toString('base64url')),
  ).rejects.toThrow('최신');
});
test('전체 URL 8,000자는 허용하고 한 글자라도 넘으면 JSON을 안내한다', async () => {
  const url = await encodeShare(example, base);
  const exact = base + 'x'.repeat(8000 - url.length);
  expect(await encodeShare(example, exact)).toHaveLength(8000);
  await expect(encodeShare(example, exact + 'x')).rejects.toThrow('JSON');
});
