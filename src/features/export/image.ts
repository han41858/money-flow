import { getBezierPath, Position } from '@xyflow/react';
import type { Diagram } from '../../types/diagram';
import { buildGraph, type FlowNode } from '../editor/graph';
import { amountLabel, edgeWidth } from '../edges/money';
import { defaultNodeSize, type NodeSizes } from '../groups/geometry';
import { strokeColor } from '../../lib/brands/palette';

const entities: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};
function escape(text: string) {
  return Array.from(text, (char) => {
    const n = char.codePointAt(0)!;
    if (
      (n < 32 && ![9, 10, 13].includes(n)) ||
      (n >= 0xd800 && n <= 0xdfff) ||
      n === 0xfffe ||
      n === 0xffff
    )
      return '�';
    return entities[char] ?? char;
  }).join('');
}
function textWidth(value: string, size: number) {
  return Array.from(value).reduce(
    (w, c) => w + (c.codePointAt(0)! > 255 ? 1 : 0.65) * size,
    0,
  );
}
function label(
  value: string,
  x: number,
  y: number,
  size: number,
  available: number,
  bold = false,
) {
  const fit =
    textWidth(value, size) > available
      ? ` textLength="${available}" lengthAdjust="spacingAndGlyphs"`
      : '';
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${bold ? 700 : 400}"${fit}>${escape(value)}</text>`;
}
export function renderSvg(diagram: Diagram, sizes: NodeSizes) {
  const { nodes, edges } = buildGraph(diagram);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  function bounds(x: number, y: number, width = 0, height = 0) {
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x + width);
    bottom = Math.max(bottom, y + height);
  }
  const groups = diagram.groups.map((g) => {
    const { x, y } = g.position;
    bounds(x - 1, y - 1, g.width + 2, g.height + 2);
    const title = label(
      g.name,
      x + 12,
      y + 22,
      13,
      Math.max(1, g.width - 24),
      true,
    );
    return `<g><rect x="${x}" y="${y}" width="${g.width}" height="${g.height}" rx="12" fill="${g.color}" fill-opacity=".12" stroke="${g.color}"/>${title}</g>`;
  });
  function port(node: FlowNode, id: string, outgoing: boolean) {
    const { x, y } = node.data.node.position;
    const { width, height } = sizes.get(node.id) ?? defaultNodeSize;
    const ports = outgoing ? node.data.outputs : node.data.inputs;
    return {
      x: x + (outgoing ? width : 0),
      y: y + (height * (ports.indexOf(id) + 1)) / (ports.length + 1),
    };
  }
  const lines: string[] = [],
    labels: string[] = [],
    markers: string[] = [];
  for (const [i, e] of edges.entries()) {
    const { edge, color } = e.data!;
    const from = port(byId.get(e.source)!, e.id, true),
      to = port(byId.get(e.target)!, e.id, false);
    const [path, x, y] = getBezierPath({
      sourceX: from.x,
      sourceY: from.y,
      sourcePosition: Position.Right,
      targetX: to.x,
      targetY: to.y,
      targetPosition: Position.Left,
    });
    // The convex hull of a cubic's endpoints and control points contains the entire stroke.
    const coords = path
      .match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi)!
      .map(Number);
    const stroke = edgeWidth(edge),
      radius = Math.max(8, stroke / 2);
    for (let j = 0; j < coords.length; j += 2)
      bounds(
        coords[j] - radius,
        coords[j + 1] - radius,
        radius * 2,
        radius * 2,
      );
    markers.push(`<marker id="arrow${i}" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto">
      <path d="M0 0 L10 5 L0 10 Z" fill="${color}"/></marker>`);
    lines.push(
      `<path d="${path}" fill="none" stroke="${color}" stroke-width="${stroke}" marker-end="url(#arrow${i})"/>`,
    );
    const value = amountLabel(edge.min, edge.max),
      width = textWidth(value, 13) + 18;
    bounds(x - width / 2, y - 12, width, 24);
    labels.push(`<g><rect x="${x - width / 2}" y="${y - 12}" width="${width}" height="24" rx="8" fill="white" stroke="#d7dfda"/>
      <text x="${x}" y="${y + 4}" text-anchor="middle" font-size="13">${escape(value)}</text></g>`);
  }
  const cards = nodes.map(({ id, data }) => {
    const { node, appearance } = data,
      { x, y } = node.position,
      { width, height } = sizes.get(id) ?? defaultNodeSize;
    bounds(x - 1, y - 1, width + 2, height + 2);
    const kind = (node.type === 'card' ? '💳 ' : '') + appearance.kind;
    return `<g><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="12" fill="white" stroke="${strokeColor(appearance.color)}"/>
      <rect x="${x + 9}" y="${y + 12}" width="5" height="19" rx="2" fill="${appearance.color}"/>
      ${label(kind, x + 21, y + 27, 12, width - 32)}
      ${label(node.name, x + 12, y + height * 0.58, 16, width - 24, true)}
      ${label(appearance.subtitle, x + 12, y + height - 12, 12, width - 24)}</g>`;
  });
  if (left === Infinity) bounds(0, 0, 1, 1);
  const x = Math.floor(left) - 40,
    y = Math.floor(top) - 40,
    width = Math.ceil(right) + 40 - x,
    height = Math.ceil(bottom) + 40 - y;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${x} ${y} ${width} ${height}" font-family="system-ui, sans-serif" fill="#21372e">
    <title>${escape(diagram.name)}</title><defs>${markers.join('')}</defs>
    <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="white"/>
    ${[...groups, ...lines, ...cards, ...labels].join('')}</svg>`;
}
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
  const svg = new Blob([renderSvg(diagram, sizes)], {
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
