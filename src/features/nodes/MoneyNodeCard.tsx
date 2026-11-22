import {
  Handle,
  Position,
  useUpdateNodeInternals,
  type NodeProps,
} from '@xyflow/react';
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { strokeColor } from '../../lib/brands/palette';
import type { FlowNode } from '../editor/graph';
import { editor, nodeOfType } from '../editor/store';
import type { MoneyNode } from '../../types/diagram';
import { NodeArtwork, browserTextWidth, cardLabel } from './artwork';
import { kindNames } from './presentation';
import { defaultNodeSize } from '../groups/geometry';
import { portFraction } from '../edges/geometry';

function Ports({
  ids,
  outgoing = false,
}: {
  ids: string[];
  outgoing?: boolean;
}) {
  const ports = ids.length ? ids : [outgoing ? 'new-out' : 'new-in'];
  return ports.map((id, i) => (
    <Handle
      key={id}
      id={id}
      type={outgoing ? 'source' : 'target'}
      position={outgoing ? Position.Right : Position.Left}
      isConnectableStart={outgoing}
      isConnectableEnd={!outgoing}
      style={{ top: portFraction(i, ports.length) * 100 + '%' }}
    />
  ));
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
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Enter' || event.key === 'Escape') {
          event.preventDefault();
          finish(event.key === 'Enter', true);
        }
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

export function MoneyNodeCard({ data, selected }: NodeProps<FlowNode>) {
  const { node, appearance } = data;
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
  const width = defaultNodeSize.width;
  const label = useMemo(
    () => cardLabel(node.name, width, browserTextWidth),
    [node.name, width],
  );
  const update = useUpdateNodeInternals();
  const layout = JSON.stringify([node.type, data.inputs, data.outputs]);
  const lastLayout = useRef(layout);
  useLayoutEffect(() => {
    if (lastLayout.current === layout) return;
    lastLayout.current = layout;
    update(node.id);
  }, [node.id, layout, update]);
  return (
    <div
      className={'money-node' + (selected ? ' active' : '')}
      style={{ '--outline': strokeColor(appearance.color) } as CSSProperties}
    >
      {node.type !== 'income' && <Ports ids={data.inputs} />}
      <NodeArtwork
        decorative
        data={data}
        label={label}
        size={{ width, height: defaultNodeSize.height }}
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
      {node.type !== 'expense' && <Ports ids={data.outputs} outgoing />}
    </div>
  );
}
