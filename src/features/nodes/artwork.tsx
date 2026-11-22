import type { FlowNode } from '../editor/graph';
import { type Size } from '../groups/geometry';
import { tint } from '../../lib/brands/palette';

import {
  cardFont,
  nameX,
  nameFontSize,
  totalFontSize,
  totalLineHeight,
} from './sizing';

type Props = {
  data: FlowNode['data'];
  label: string;
  size: Size;
  hideName?: boolean;
  hideIcon?: boolean;
  decorative?: boolean;
  x?: number;
  y?: number;
};

export function NodeArtwork({
  data,
  label,
  size,
  hideName = false,
  hideIcon = false,
  decorative = false,
  x = 0,
  y = 0,
}: Props) {
  const { color, Icon } = data.appearance;
  const { width, height } = size;
  return (
    <svg
      x={x}
      y={y}
      width={width}
      height={height}
      overflow={data.totals.length ? 'visible' : undefined}
      fontFamily={cardFont}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : data.node.name}
      aria-description={
        decorative
          ? undefined
          : data.totals.map(({ description }) => description).join(', ') ||
            undefined
      }
    >
      <rect width={width} height={height} rx={12} fill={tint(color, 0.18)} />
      {!hideIcon && (
        <Icon
          x={13}
          y={(height - 18) / 2}
          width={18}
          height={18}
          color="#314937"
          aria-hidden="true"
        />
      )}
      <text
        visibility={hideName ? 'hidden' : undefined}
        x={nameX}
        y={height / 2}
        dominantBaseline="central"
        fontSize={nameFontSize}
        fontWeight={700}
        fill="#1c2923"
      >
        {label}
      </text>
      {data.totals.length ? (
        <g className="node-totals" pointerEvents="none">
          {data.totals.map(({ label }, index) => (
            <text
              key={label}
              x={width / 2}
              y={height + totalLineHeight * (index + 1) - 1}
              textAnchor="middle"
              fontSize={totalFontSize}
              fill="#415548"
            >
              {label}
            </text>
          ))}
        </g>
      ) : null}
    </svg>
  );
}
