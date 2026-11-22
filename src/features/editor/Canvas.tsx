import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import {
  ReactFlow,
  Background,
  Panel,
  useReactFlow,
  useStore,
  BackgroundVariant,
  type NodeChange,
  type EdgeChange,
  type NodeSelectionChange,
  type XYPosition,
} from '@xyflow/react';
import { Grid2X2, Maximize, Minus, Plus, Workflow } from 'lucide-react';
import { MoneyNodeCard } from '../nodes/MoneyNodeCard';
import { TransferEdge } from '../edges/TransferEdge';
import { buildGraph, type FlowNode, type FlowEdge } from './graph';
import { editor, type Selection } from './store';
import { canConnect } from '../edges/connections';
import type { Diagram } from '../../types/diagram';
import '@xyflow/react/dist/style.css';

const nodeTypes = { money: MoneyNodeCard },
  edgeTypes = { transfer: TransferEdge };
const fitOptions = { padding: 0.13, maxZoom: 1.25 };
type Props = {
  diagram: Diagram;
  selected: Selection;
  setSelected: Dispatch<SetStateAction<Selection>>;
  openInspector: () => void;
};
export function Canvas({
  diagram,
  selected,
  setSelected,
  openInspector,
}: Props) {
  const [grid, setGrid] = useState(true);
  const [source, setSource] = useState<string | null>(null);
  const [positions, setPositions] = useState<Map<string, XYPosition>>(
    new Map(),
  );
  const graph = useMemo(() => buildGraph(diagram), [diagram]);
  const [initialFit] = useState(() =>
    window.matchMedia('(max-width:720px)').matches
      ? {
          ...fitOptions,
          nodes: graph.nodes.filter((n) =>
            ['income', 'account'].includes(n.data.node.type),
          ),
        }
      : fitOptions,
  );
  const { fitView, zoomIn, zoomOut } = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);
  function selectionChanges(
    changes: NodeSelectionChange[],
    key: keyof Selection,
  ) {
    if (!changes.length) return;
    setSelected((previous) => {
      const ids = new Set(previous[key]);
      for (const change of changes) {
        if (change.selected) ids.add(change.id);
        else ids.delete(change.id);
      }
      return { ...previous, [key]: [...ids] };
    });
  }
  function changeNodes(changes: NodeChange<FlowNode>[]) {
    selectionChanges(
      changes.filter((c) => c.type === 'select'),
      'nodes',
    );
    const moving = new Map<string, XYPosition>(),
      finished = new Map<string, XYPosition>();
    for (const change of changes) {
      if (change.type === 'position' && change.position) {
        (change.dragging ? moving : finished).set(change.id, change.position);
      }
    }
    if (moving.size)
      setPositions((previous) => new Map([...previous, ...moving]));
    if (finished.size) {
      editor.move(finished);
      setPositions((previous) => {
        const next = new Map(previous);
        for (const id of finished.keys()) next.delete(id);
        return next;
      });
    }
  }
  function changeEdges(changes: EdgeChange<FlowEdge>[]) {
    selectionChanges(
      changes.filter((c) => c.type === 'select'),
      'edges',
    );
  }
  return (
    <section className="canvas-shell" aria-label="자금 흐름 캔버스">
      <div className="canvas-heading">
        <span>
          <Workflow size={17} />
          흐름도
        </span>
        <small>
          {source ? '연결할 노드의 왼쪽 점을 선택하세요' : '월 기준 · KRW'}
        </small>
      </div>
      <div className="flow-area">
        <div className="absolute inset-0">
          <ReactFlow<FlowNode, FlowEdge>
            nodes={graph.nodes.map((n) => ({
              ...n,
              position: positions.get(n.id) ?? n.position,
              selected: selected.nodes.includes(n.id),
              className:
                source && source !== n.id && !canConnect(diagram, source, n.id)
                  ? 'invalid-target'
                  : '',
            }))}
            edges={graph.edges.map((e) => ({
              ...e,
              selected: selected.edges.includes(e.id),
            }))}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={changeNodes}
            onEdgesChange={changeEdges}
            onNodeClick={openInspector}
            onEdgeClick={openInspector}
            onConnectStart={(_, p) => setSource(p.nodeId)}
            onConnectEnd={() => setSource(null)}
            isValidConnection={(c) => canConnect(diagram, c.source, c.target)}
            onConnect={(c) => {
              const id = editor.connect(c.source, c.target);
              if (id) {
                setSelected({ nodes: [], edges: [id] });
                openInspector();
              }
            }}
            onPaneClick={() => setSelected({ nodes: [], edges: [] })}
            deleteKeyCode={null}
            multiSelectionKeyCode={['Meta', 'Control', 'Shift']}
            fitView={graph.nodes.length > 0}
            fitViewOptions={initialFit}
            minZoom={0.15}
            maxZoom={2}
            aria-label="월간 자금 흐름도"
          >
            {grid && (
              <Background
                color="#cbd5cf"
                gap={19}
                size={1.4}
                variant={BackgroundVariant.Dots}
              />
            )}
            {!graph.nodes.length && (
              <div className="empty-canvas">
                수입 노드를 추가해 자금 흐름을 시작하세요.
              </div>
            )}
            <Panel position="bottom-left" className="canvas-controls">
              <button aria-label="축소" onClick={() => void zoomOut()}>
                <Minus size={16} />
              </button>
              <output aria-label="확대 비율">{Math.round(zoom * 100)}%</output>
              <button aria-label="확대" onClick={() => void zoomIn()}>
                <Plus size={16} />
              </button>
              <i />
              <button
                aria-label="전체 보기"
                title="전체 보기"
                onClick={() => void fitView({ ...fitOptions, duration: 180 })}
              >
                <Maximize size={15} />
              </button>
              <button
                aria-label="격자 표시"
                title="격자 표시"
                aria-pressed={grid}
                onClick={() => setGrid(!grid)}
              >
                <Grid2X2 size={15} />
              </button>
            </Panel>
          </ReactFlow>
        </div>
      </div>
    </section>
  );
}
