import { renderToStaticMarkup } from 'react-dom/server';
import type { Diagram } from '../../types/diagram';
import { buildGraph, type FlowNode, type FlowEdge } from '../editor/graph';
import { amountLabel, edgeWidth } from '../edges/money';
import { transferGeometry } from '../edges/geometry';
import type { NodeSizes, Group } from '../groups/geometry';
import {
  cardLabel,
  totalFontSize,
  totalLineHeight,
  cardSize,
  cardFont,
  estimatedTextWidth,
  type MeasureText,
} from '../nodes/sizing';
import { NodeArtwork } from '../nodes/artwork';

class Bounds {
  private left = Infinity;
  private top = Infinity;
  private right = -Infinity;
  private bottom = -Infinity;

  include(x: number, y: number, width = 0, height = 0) {
    this.left = Math.min(this.left, x);
    this.top = Math.min(this.top, y);
    this.right = Math.max(this.right, x + width);
    this.bottom = Math.max(this.bottom, y + height);
  }

  path(d: string, radius: number) {
    // The control polygon contains every point on a cubic Bézier curve.
    const numbers = d.match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi)!.map(Number);
    for (let i = 0; i < numbers.length; i += 2)
      this.include(
        numbers[i] - radius,
        numbers[i + 1] - radius,
        2 * radius,
        2 * radius,
      );
  }

  frame() {
    if (this.left === Infinity) this.include(0, 0, 1, 1);
    const x = Math.floor(this.left) - 40;
    const y = Math.floor(this.top) - 40;
    return {
      x,
      y,
      width: Math.ceil(this.right) + 40 - x,
      height: Math.ceil(this.bottom) + 40 - y,
    };
  }
}

function groupShape(group: Group, bounds: Bounds, measure: MeasureText) {
  const { x, y } = group.position;
  bounds.include(x - 1, y - 1, group.width + 2, group.height + 2);
  const width = Math.max(1, group.width - 24);
  const textLength = measure(group.name, 13, true) > width ? width : undefined;
  return (
    <g key={group.id}>
      <rect
        x={x}
        y={y}
        width={group.width}
        height={group.height}
        rx={12}
        fill={group.color}
        fillOpacity={0.12}
        stroke={group.color}
      />
      <text
        x={x + 12}
        y={y + 22}
        fontSize={13}
        fontWeight={700}
        textLength={textLength}
        lengthAdjust="spacingAndGlyphs"
      >
        {group.name}
      </text>
    </g>
  );
}

function nodeShape(
  node: FlowNode,
  sizes: NodeSizes,
  bounds: Bounds,
  measure: MeasureText,
) {
  const { x, y } = node.data.node.position;
  const { name } = node.data.node;
  const { width, height } = sizes.get(node.id) ?? cardSize(name, measure);
  const label = cardLabel(name);
  bounds.include(x - 1, y - 1, width + 2, height + 2);
  for (const { label } of node.data.totals) {
    const labelWidth = measure(label, totalFontSize) + 2;
    bounds.include(
      x + (width - labelWidth) / 2,
      y + height,
      labelWidth,
      node.data.totals.length * totalLineHeight,
    );
  }
  return (
    <NodeArtwork
      key={node.id}
      x={x}
      y={y}
      data={node.data}
      label={label}
      size={{ width, height }}
    />
  );
}

function anchor(
  node: FlowNode,
  fraction: number,
  outgoing: boolean,
  sizes: NodeSizes,
  measure: MeasureText,
) {
  const { x, y } = node.data.node.position;
  const { width, height } =
    sizes.get(node.id) ?? cardSize(node.data.node.name, measure);
  return {
    x: x + (outgoing ? width : 0),
    y: y + height * fraction,
  };
}

function edgeShape(
  flow: FlowEdge,
  nodes: Map<string, FlowNode>,
  sizes: NodeSizes,
  bounds: Bounds,
  measure: MeasureText,
) {
  const { edge, color, sourcePort, targetPort, targetPortCount } = flow.data!;
  const from = anchor(
    nodes.get(flow.source)!,
    sourcePort,
    true,
    sizes,
    measure,
  );
  const to = anchor(nodes.get(flow.target)!, targetPort, false, sizes, measure);
  const stroke = edgeWidth(edge);
  const { path, arrow, x, y } = transferGeometry(
    from.x,
    from.y,
    to.x,
    to.y,
    stroke,
    targetPortCount,
  );
  bounds.path(path, stroke / 2);
  bounds.path(arrow, 0);
  const value = amountLabel(edge.min, edge.max);
  const width = measure(value, 13, true) + 18;
  bounds.include(x - width / 2, y - 12, width, 24);
  return {
    line: (
      <g key={flow.id}>
        <path d={path} fill="none" stroke={color} strokeWidth={stroke} />
        <path d={arrow} fill={color} />
      </g>
    ),
    label: (
      <g key={flow.id}>
        <rect
          x={x - width / 2}
          y={y - 12}
          width={width}
          height={24}
          rx={8}
          fill="white"
          stroke="#d7dfda"
        />
        <text x={x} y={y + 4} textAnchor="middle" fontSize={13}>
          {value}
        </text>
      </g>
    ),
  };
}

export function renderSvg(
  diagram: Diagram,
  sizes: NodeSizes,
  measure: MeasureText = estimatedTextWidth,
) {
  const graph = buildGraph(diagram);
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const bounds = new Bounds();
  const groups = diagram.groups.map((g) => groupShape(g, bounds, measure));
  const edges = graph.edges.map((e) =>
    edgeShape(e, nodes, sizes, bounds, measure),
  );
  const cards = graph.nodes.map((n) => nodeShape(n, sizes, bounds, measure));
  const frame = bounds.frame();
  const svg = renderToStaticMarkup(
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={frame.width}
      height={frame.height}
      viewBox={[frame.x, frame.y, frame.width, frame.height].join(' ')}
      fontFamily={cardFont}
      fill="#21372e"
    >
      <title>{diagram.name}</title>
      <rect {...frame} fill="white" />
      {groups}
      {edges.map((e) => e.line)}
      {cards}
      {edges.map((e) => e.label)}
    </svg>,
  );
  return svg.replace(
    /[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu,
    '�',
  );
}
