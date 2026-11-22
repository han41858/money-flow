import type { Diagram } from '../../types/diagram';
import type { NodeSizes } from '../groups/geometry';
import { browserTextWidth } from '../nodes/artwork';

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportImage(
  diagram: Diagram,
  sizes: NodeSizes,
  format: 'svg' | 'png',
) {
  const { renderSvg } = await import('./scene');
  const svg = new Blob([renderSvg(diagram, sizes, browserTextWidth)], {
    type: 'image/svg+xml;charset=utf-8',
  });
  if (format === 'svg') {
    downloadBlob(svg, diagram.name + '.svg');
    return;
  }
  const url = URL.createObjectURL(svg);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth * 2;
    canvas.height = image.naturalHeight * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('PNG 이미지를 만들 수 없습니다.');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png'),
    );
    if (!png) throw new Error('PNG 이미지가 너무 큽니다. SVG로 저장하세요.');
    downloadBlob(png, diagram.name + '.png');
  } finally {
    URL.revokeObjectURL(url);
  }
}
