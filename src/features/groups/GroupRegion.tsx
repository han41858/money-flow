import { NodeResizer, type Node, type NodeProps } from '@xyflow/react';
import { Frame } from 'lucide-react';
import { useRef, useState, type CSSProperties } from 'react';
import { onEditKey } from '../../lib/editing';
import { editor } from '../editor/store';
import { minGroupSize, type Group } from './geometry';

export type RegionNode = Node<{ group: Group; readOnly?: boolean }, 'region'>;

export function GroupRegion({ data, selected }: NodeProps<RegionNode>) {
  const { group } = data;
  const [draft, setDraft] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  function finish(save: boolean, restoreFocus: boolean) {
    const name = draft?.trim();
    if (save && name && name !== group.name)
      editor.editGroup(group.id, { name });
    setDraft(null);
    if (restoreFocus)
      requestAnimationFrame(() =>
        trigger.current?.focus({ preventScroll: true }),
      );
  }

  return (
    <div
      className={'group-region' + (selected ? ' active' : '')}
      style={{ '--group-color': group.color } as CSSProperties}
    >
      <div className="group-title">
        <Frame size={13} aria-hidden="true" />
        {data.readOnly ? (
          <strong>{group.name}</strong>
        ) : draft === null ? (
          <button
            ref={trigger}
            type="button"
            className="group-name-trigger"
            title={group.name}
            aria-label={group.name + ' 이름 수정'}
            onClick={() => setDraft(group.name)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ')
                event.stopPropagation();
            }}
          >
            {group.name}
          </button>
        ) : (
          <input
            className="group-name-input nodrag nopan nowheel"
            aria-label="캔버스 그룹 이름"
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onBlur={() => finish(true, false)}
            onKeyDown={(event) => {
              event.stopPropagation();
              onEditKey(event, (save) => finish(save, true));
            }}
          />
        )}
      </div>
      {selected && !data.readOnly && (
        <NodeResizer
          lineClassName="group-resize-edge nopan"
          handleClassName="group-resize-corner nopan"
          minWidth={minGroupSize.width}
          minHeight={minGroupSize.height}
        />
      )}
    </div>
  );
}
