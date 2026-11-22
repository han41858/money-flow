import { useCallback, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Panel,
  useReactFlow,
  useStore,
  BackgroundVariant,
} from '@xyflow/react';
import { Grid2X2, Maximize, Minus, Plus, Workflow } from 'lucide-react';
import { MoneyNodeCard } from '../nodes/MoneyNodeCard';
import { TransferEdge } from '../edges/TransferEdge';
import { buildGraph } from './graph';
import { example } from '../../app/example';
import '@xyflow/react/dist/style.css';

export type Selection = { type: 'node' | 'edge'; id: string } | null;
const graph = buildGraph(example);
const nodeTypes = { money: MoneyNodeCard },
  edgeTypes = { transfer: TransferEdge };
const fitOptions = { padding: 0.13, maxZoom: 1.25 };
type Props = { selected: Selection; onSelect: (s: Selection) => void };
function CanvasContent({ selected, onSelect }: Props) {
  const [grid, setGrid] = useState(true);
  const { fitView, zoomIn, zoomOut } = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);
  const refit = useCallback(
    () => void fitView({ ...fitOptions, duration: 180 }),
    [fitView],
  );
  return (
    <section className="canvas-shell" aria-label="자금 흐름 캔버스">
      <div className="canvas-heading">
        <span>
          <Workflow size={17} /> 흐름도
        </span>
        <small>월 기준 · KRW</small>
      </div>
      <div className="flow-area">
        <ReactFlow
          nodes={graph.nodes.map((n) => ({
            ...n,
            selected: selected?.type === 'node' && selected.id === n.id,
          }))}
          edges={graph.edges.map((e) => ({
            ...e,
            selected: selected?.type === 'edge' && selected.id === e.id,
          }))}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          deleteKeyCode={null}
          multiSelectionKeyCode={null}
          onNodeClick={(_, n) => onSelect({ type: 'node', id: n.id })}
          onEdgeClick={(_, e) => onSelect({ type: 'edge', id: e.id })}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onSelect(null);
            const item = (e.target as HTMLElement).closest('[data-id]');
            if (
              (e.key === 'Enter' || e.key === ' ') &&
              item instanceof Element
            ) {
              const id = item.getAttribute('data-id');
              if (id)
                onSelect({
                  type: item.classList.contains('react-flow__edge')
                    ? 'edge'
                    : 'node',
                  id,
                });
            }
          }}
          onPaneClick={() => onSelect(null)}
          fitView
          fitViewOptions={fitOptions}
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
          <Panel position="bottom-left" className="canvas-controls">
            <button aria-label="축소" onClick={() => void zoomOut()}>
              <Minus size={16} />
            </button>
            <output aria-label="확대 비율">{Math.round(zoom * 100)}%</output>
            <button aria-label="확대" onClick={() => void zoomIn()}>
              <Plus size={16} />
            </button>
            <i />
            <button aria-label="전체 보기" title="전체 보기" onClick={refit}>
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
    </section>
  );
}
export function Canvas(props: Props) {
  return (
    <ReactFlowProvider>
      <CanvasContent {...props} />
    </ReactFlowProvider>
  );
}
