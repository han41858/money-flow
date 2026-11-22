import { NodeResizeControl, type Node, type NodeProps } from '@xyflow/react';
import { Frame, Scaling } from 'lucide-react';
import type { CSSProperties } from 'react';
import { minGroupSize, type Group } from './geometry';

export type RegionNode = Node<{ group: Group }, 'region'>;
export function GroupRegion({ data, selected }: NodeProps<RegionNode>) {
  const { group } = data;
  return (
    <div
      className={'group-region' + (selected ? ' active' : '')}
      style={{ '--group-color': group.color } as CSSProperties}
    >
      <div className="group-title">
        <Frame size={13} />
        <strong>{group.name}</strong>
      </div>
      {selected && (
        <NodeResizeControl
          position="bottom-right"
          className="group-size-handle"
          minWidth={minGroupSize.width}
          minHeight={minGroupSize.height}
          aria-label="그룹 크기 조절"
        >
          <Scaling size={15} aria-hidden="true" />
        </NodeResizeControl>
      )}
    </div>
  );
}
