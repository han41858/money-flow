import {
  Handle,
  Position,
  useUpdateNodeInternals,
  type NodeProps,
} from '@xyflow/react';
import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { Check, Pencil, X } from 'lucide-react';
import { strokeColor } from '../../lib/brands/palette';
import type { FlowNode } from '../editor/graph';
import { editor, nodeOfType } from '../editor/store';
import type { MoneyNode } from '../../types/diagram';
import { NodeArtwork, browserTextWidth, cardLayout } from './artwork';
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

function CardFields({ node, close }: { node: MoneyNode; close: () => void }) {
  const [name, setName] = useState(node.name);
  const [kind, setKind] = useState(node.type);
  const [error, setError] = useState('');
  return (
    <form
      className="card-fields nodrag nopan nowheel"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.nativeEvent.isComposing) {
          if (event.key === 'Enter') event.preventDefault();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          close();
        }
      }}
      onSubmit={(event) => {
        event.preventDefault();
        const nextName = name.trim();
        if (!nextName) {
          setError('이름을 입력하세요.');
          return;
        }
        const next =
          kind === node.type
            ? { ...node, name: nextName }
            : nodeOfType(kind, { ...node, name: nextName });
        if (
          (nextName !== node.name || kind !== node.type) &&
          !editor.editNode(next)
        ) {
          setError('이 유형과 맞지 않는 연결선을 먼저 삭제하세요.');
          return;
        }
        close();
      }}
    >
      <fieldset className="card-kinds">
        <legend className="sr-only">카드 유형</legend>
        {(Object.keys(kindNames) as MoneyNode['type'][]).map((type) => (
          <label key={type}>
            <input
              type="radio"
              name="card-kind"
              value={type}
              className="sr-only"
              checked={kind === type}
              onChange={() => {
                setKind(type);
                setError('');
              }}
            />
            <span>{kindNames[type]}</span>
          </label>
        ))}
      </fieldset>
      <div className="card-field-actions">
        <input
          aria-label="카드 이름"
          autoFocus
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError('');
          }}
        />
        <button type="submit" aria-label="카드 수정 저장" title="저장">
          <Check size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="카드 수정 취소"
          title="취소"
          onClick={close}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      {error && <small role="alert">{error}</small>}
    </form>
  );
}

export function MoneyNodeCard({ data, selected }: NodeProps<FlowNode>) {
  const { node, appearance } = data;
  const [editing, setEditing] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const gradientId = useId();
  const width = defaultNodeSize.width;
  const card = useMemo(
    () => cardLayout(data, width, browserTextWidth),
    [data, width],
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
        layout={card}
        size={{ width, height: card.height }}
        gradientId={gradientId}
      />
      {!data.readOnly &&
        (editing ? (
          <CardFields
            node={node}
            close={() => {
              setEditing(false);
              requestAnimationFrame(() =>
                editButton.current?.focus({ preventScroll: true }),
              );
            }}
          />
        ) : (
          <button
            ref={editButton}
            type="button"
            className="card-edit nodrag nopan"
            aria-label="카드에서 수정"
            title="카드에서 수정"
            onKeyDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              setEditing(true);
            }}
          >
            <Pencil size={15} aria-hidden="true" />
          </button>
        ))}
      {node.type !== 'expense' && <Ports ids={data.outputs} outgoing />}
    </div>
  );
}
