import {
  Handle,
  Position,
  useUpdateNodeInternals,
  ViewportPortal,
  type NodeProps,
} from '@xyflow/react';
import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { strokeColor } from '../../lib/brands/palette';
import type { FlowNode } from '../editor/graph';
import { editor, nodeOfType } from '../editor/store';
import type { MoneyNode } from '../../types/diagram';
import { NodeArtwork } from './artwork';
import {
  browserTextWidth,
  cardLabel,
  cardSize,
  nodeHeight,
  portSize,
} from './sizing';
import { kindNames } from './presentation';
import { onEditKey } from '../../lib/editing';

type PortType = 'source' | 'target';

const portDimensions = { width: portSize, height: portSize };

function Port({
  type,
  location,
  color,
  revealed,
}: {
  type: PortType;
  location: { x: number; y: number };
  color: string;
  revealed: boolean;
}) {
  const outgoing = type === 'source';
  return (
    <Handle
      type={type}
      position={outgoing ? Position.Right : Position.Left}
      isConnectableStart={outgoing}
      isConnectableEnd={!outgoing}
      className="node-port"
      data-revealed={revealed || undefined}
      style={{
        ...portDimensions,
        left: location.x,
        top: location.y,
        borderColor: color,
      }}
    />
  );
}

// React Flow measures handles inside the node wrapper. The interactive
// handles use the same coordinates in the viewport portal and own the IDs
// that React Flow uses for hit testing.
function PortAnchor({ type }: { type: PortType }) {
  return (
    <Handle
      type={type}
      position={type === 'source' ? Position.Right : Position.Left}
      isConnectable={false}
      isConnectableStart={false}
      isConnectableEnd={false}
      className="node-port-anchor"
      data-id={undefined}
      aria-hidden="true"
      style={portDimensions}
    />
  );
}

function CardNameInput({
  node,
  close,
}: {
  node: MoneyNode;
  close: (restoreFocus: boolean) => void;
}) {
  const [name, setName] = useState(node.name);

  function finish(save: boolean, restoreFocus: boolean) {
    const next = name.trim();
    if (save && next && next !== node.name)
      editor.editNode({ ...node, name: next });
    close(restoreFocus);
  }

  return (
    <input
      className="card-name-input nodrag nopan nowheel"
      aria-label="카드 이름"
      autoFocus
      value={name}
      onChange={(event) => setName(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onBlur={() => finish(true, false)}
      onKeyDown={(event) => {
        event.stopPropagation();
        onEditKey(event, (save) => finish(save, true));
      }}
    />
  );
}

function CardKinds({
  node,
  close,
}: {
  node: MoneyNode;
  close: (restoreFocus: boolean) => void;
}) {
  const [error, setError] = useState('');
  return (
    <fieldset
      className="card-kinds nodrag nopan"
      onClick={(event) => event.stopPropagation()}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) close(false);
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          close(true);
        }
      }}
    >
      <legend className="sr-only">카드 유형</legend>
      {(Object.keys(kindNames) as MoneyNode['type'][]).map((type) => (
        <button
          key={type}
          type="button"
          autoFocus={node.type === type}
          aria-pressed={node.type === type}
          onClick={() => {
            if (node.type === type || editor.editNode(nodeOfType(type, node)))
              close(true);
            else setError('이 유형과 맞지 않는 연결선을 먼저 삭제하세요.');
          }}
        >
          {kindNames[type]}
        </button>
      ))}
      {error && <small role="alert">{error}</small>}
    </fieldset>
  );
}

export const MoneyNodeCard = memo(function MoneyNodeCard({
  data,
  selected,
  positionAbsoluteX,
  positionAbsoluteY,
}: NodeProps<FlowNode>) {
  const { node, appearance } = data;
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState<'name' | 'kind' | null>(null);
  const nameButton = useRef<HTMLButtonElement>(null);
  const kindButton = useRef<HTMLButtonElement>(null);

  function close(restoreFocus: boolean) {
    const trigger = editing === 'name' ? nameButton : kindButton;
    setEditing(null);
    if (restoreFocus)
      requestAnimationFrame(() =>
        trigger.current?.focus({ preventScroll: true }),
      );
  }
  const size = useMemo(
    () => cardSize(node.name, browserTextWidth),
    [node.name],
  );
  const update = useUpdateNodeInternals();
  const layout = `${node.type}:${size.width}`;
  const lastLayout = useRef(layout);
  useLayoutEffect(() => {
    if (lastLayout.current === layout) return;
    lastLayout.current = layout;
    update(node.id);
  }, [node.id, layout, update]);
  const portY = positionAbsoluteY + (nodeHeight - portSize) / 2;
  const portColor = strokeColor(appearance.color);
  return (
    <div
      className={'money-node' + (selected ? ' active' : '')}
      onMouseEnter={data.readOnly ? undefined : () => setHovered(true)}
      onMouseLeave={data.readOnly ? undefined : () => setHovered(false)}
    >
      {node.type !== 'income' && <PortAnchor type="target" />}
      <NodeArtwork
        decorative
        data={data}
        label={cardLabel(node.name)}
        size={size}
        measure={browserTextWidth}
        hideName={editing !== null}
        hideIcon={editing === 'kind'}
      />
      {!data.readOnly && (
        <>
          {editing === 'name' ? (
            <CardNameInput node={node} close={close} />
          ) : (
            <button
              ref={nameButton}
              type="button"
              className="card-name-trigger nopan"
              aria-label={node.name + ' 이름 수정'}
              title={node.name}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ')
                  event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
                setEditing('name');
              }}
            />
          )}
          {editing === 'kind' ? (
            <CardKinds node={node} close={close} />
          ) : (
            <button
              ref={kindButton}
              type="button"
              className="card-kind-trigger nodrag nopan"
              aria-label={kindNames[node.type] + ' 유형 수정'}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ')
                  event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
                setEditing('kind');
              }}
            />
          )}
        </>
      )}
      {node.type !== 'expense' && <PortAnchor type="source" />}
      {!data.readOnly && editing !== 'kind' && (
        <ViewportPortal>
          {node.type !== 'income' && (
            <Port
              type="target"
              location={{ x: positionAbsoluteX - portSize, y: portY }}
              color={portColor}
              revealed={data.connectionTarget === true}
            />
          )}
          {node.type !== 'expense' && (
            <Port
              type="source"
              location={{ x: positionAbsoluteX + size.width, y: portY }}
              color={portColor}
              revealed={hovered || Boolean(data.portFocused)}
            />
          )}
        </ViewportPortal>
      )}
    </div>
  );
});
