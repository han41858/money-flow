import { visibleArea } from './visibleArea';
import {
  useRef,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
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
import { Grid2X2, Maximize, Minus, Plus, WandSparkles } from 'lucide-react';
import { canvasLabels } from './accessibility';
import { MoneyNodeCard } from '../nodes/MoneyNodeCard';
import { browserTextWidth } from '../nodes/sizing';
import { TransferEdge } from '../edges/TransferEdge';
import { buildGraph, type FlowNode, type FlowEdge } from './graph';
import { editor, type Selection } from './store';
import { canConnect } from '../edges/connections';
import type { Diagram } from '../../types/diagram';
import '@xyflow/react/dist/style.css';
import { recordViewport, useLibrary } from '../diagrams/library';

import { useStableItems } from './stable';
import { GroupRegion, type RegionNode } from '../groups/GroupRegion';
import {
  absoluteFrom,
  measuredSizes,
  nodeBounds,
  type NodeSizes,
  type Size,
} from '../groups/geometry';
type CanvasNode = FlowNode | RegionNode;
const nodeTypes = { money: MoneyNodeCard, region: GroupRegion };
const edgeTypes = { transfer: TransferEdge };
const fitOptions = { padding: 0.13, maxZoom: 1.25 };
type Props = {
  diagram: Diagram;
  selected: Selection;
  setSelected: Dispatch<SetStateAction<Selection>>;
  openInspector: () => void;
  readOnly?: boolean;
};

export function Canvas({
  diagram,
  selected,
  setSelected,
  openInspector,
  readOnly = false,
}: Props) {
  const areaRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const interacted = useRef(false);
  const trackView = () => {
    interacted.current = true;
  };
  const fit = useLibrary((s) => s.fit);
  const [grid, setGrid] = useState(true);
  const [source, setSource] = useState<string | null>(null);
  const [positions, setPositions] = useState<Map<string, XYPosition>>(
    new Map(),
  );
  const [measurements, setMeasurements] = useState<Map<string, Size>>(
    new Map(),
  );
  const labels = useMemo(() => canvasLabels(readOnly), [readOnly]);
  const graph = useMemo(() => buildGraph(diagram, browserTextWidth), [diagram]);
  const regions = useMemo(
    () => new Map(graph.groupNodes.map((n) => [n.id, n.data.group])),
    [graph],
  );
  const [resizing, setResizing] = useState<{ id: string; size: Size } | null>(
    null,
  );
  const [shouldFit] = useState(
    () =>
      (fit || readOnly) &&
      Boolean(diagram.nodes.length || diagram.groups.length),
  );
  const [initialFit] = useState(() =>
    !readOnly && window.matchMedia('(max-width:720px)').matches
      ? {
          ...fitOptions,
          nodes: graph.nodes.filter((n) =>
            ['income', 'account'].includes(n.data.node.type),
          ),
        }
      : fitOptions,
  );
  const {
    fitView,
    zoomIn,
    zoomOut,
    zoomTo,
    getInternalNode,
    getViewport,
    setViewport,
  } = useReactFlow();
  const flowNodes = useStableItems<CanvasNode>([
    ...graph.groupNodes.map((n) => ({
      ...n,
      position: positions.get(n.id) ?? n.position,
      measured: measurements.get(n.id),
      data: { ...n.data, readOnly },
      selected: selected.groups.includes(n.data.group.id),
      ...(resizing?.id === n.id ? resizing.size : {}),
    })),
    ...graph.nodes.map((n) => ({
      ...n,
      position: positions.get(n.id) ?? n.position,
      measured: measurements.get(n.id),
      data: { ...n.data, readOnly },
      selected: selected.nodes.includes(n.id),
      className:
        source && source !== n.id
          ? canConnect(diagram, source, n.id)
            ? 'valid-target'
            : 'invalid-target'
          : '',
    })),
  ]);
  const flowEdges = useStableItems<FlowEdge>(
    graph.edges.map((e) => ({
      ...e,
      data: { ...e.data!, readOnly },
      selected: selected.edges.includes(e.id),
    })),
  );
  const zoom = useStore((s) => s.transform[2]);

  function fitVisibleArea() {
    const sizes = measuredSizes(diagram.nodes, getInternalNode);
    centerDiagram(diagram, sizes);
  }

  function arrange() {
    const sizes = measuredSizes(diagram.nodes, getInternalNode);
    editor.autoArrange(sizes);
    centerDiagram(editor.current(), sizes);
  }

  function centerDiagram({ nodes, groups }: Diagram, sizes: NodeSizes) {
    if (!nodes.length && !groups.length) return;
    trackView();
    const bounds = nodeBounds(nodes, sizes);
    let { x: left, y: top } = bounds.position;
    let right = left + bounds.width;
    let bottom = top + bounds.height;
    for (const group of groups) {
      left = Math.min(left, group.position.x);
      top = Math.min(top, group.position.y);
      right = Math.max(right, group.position.x + group.width);
      bottom = Math.max(bottom, group.position.y + group.height);
    }

    const area = areaRef.current!;
    const canvas = area.getBoundingClientRect();
    const visible = visibleArea(area);
    const screenTop = Math.max(0, visible.top);
    const controlsTop = controlsRef.current?.getBoundingClientRect().top;
    const screenBottom = Math.min(
      window.innerHeight,
      visible.bottom,
      controlsTop ?? Infinity,
    );
    const width = visible.right - visible.left;
    const height = screenBottom - screenTop;
    if (width <= 0 || height <= 0) return;

    const currentZoom = getViewport().zoom;
    const diagramWidth = right - left;
    const diagramHeight = bottom - top;
    const overflows =
      diagramWidth * currentZoom > width ||
      diagramHeight * currentZoom > height;
    const margin = Math.min(16, width / 4, height / 4);
    const nextZoom = overflows
      ? Math.min(
          (width - 2 * margin) / diagramWidth,
          (height - 2 * margin) / diagramHeight,
        )
      : currentZoom;
    void setViewport({
      x:
        (visible.left + visible.right) / 2 -
        canvas.left -
        ((left + right) / 2) * nextZoom,
      y:
        (screenTop + screenBottom) / 2 -
        canvas.top -
        ((top + bottom) / 2) * nextZoom,
      zoom: nextZoom,
    });
  }

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

  function changeNodes(changes: NodeChange<CanvasNode>[]) {
    const selections = changes.filter((c) => c.type === 'select');
    selectionChanges(
      selections.filter((c) => !regions.has(c.id)),
      'nodes',
    );
    selectionChanges(
      selections.flatMap((c) => {
        const group = regions.get(c.id);
        return group ? [{ ...c, id: group.id }] : [];
      }),
      'groups',
    );
    // Keep React Flow's measurements on controlled nodes so position and
    // selection updates preserve their measured handle bounds.
    const measured = new Map<string, Size>();
    for (const change of changes) {
      if (
        change.type === 'dimensions' &&
        change.resizing === undefined &&
        change.dimensions
      )
        measured.set(change.id, change.dimensions);
    }
    if (measured.size)
      setMeasurements((previous) => new Map([...previous, ...measured]));
    if (readOnly) return;
    for (const c of changes) {
      if (c.type !== 'dimensions' || c.resizing === undefined || !c.dimensions)
        continue;
      const group = regions.get(c.id);
      if (!group) continue;
      if (c.resizing) setResizing({ id: c.id, size: c.dimensions });
      else {
        editor.resizeGroup(
          group.id,
          c.dimensions,
          measuredSizes(diagram.nodes, getInternalNode),
        );
        setResizing(null);
      }
    }
    const moving = new Map<string, XYPosition>();
    const finished = new Map<string, XYPosition>();
    for (const change of changes) {
      if (change.type === 'position' && change.position) {
        (change.dragging ? moving : finished).set(change.id, change.position);
      }
    }
    if (moving.size)
      setPositions((previous) => new Map([...previous, ...moving]));
    if (finished.size) {
      const groupPositions = new Map<string, XYPosition>();
      const nodePositions = new Map<string, XYPosition>();
      for (const [id, point] of finished) {
        const group = regions.get(id);
        if (group) groupPositions.set(group.id, point);
        else {
          const parentId = getInternalNode(id)?.parentId;
          const parent = parentId ? regions.get(parentId) : undefined;
          nodePositions.set(
            id,
            parent ? absoluteFrom(point, parent.position) : point,
          );
        }
      }
      editor.move(
        nodePositions,
        groupPositions,
        measuredSizes(diagram.nodes, getInternalNode),
      );
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
      <div
        ref={areaRef}
        className="flow-area"
        data-port-mode={readOnly ? undefined : source ? 'connecting' : 'idle'}
        onPointerDownCapture={trackView}
        onWheelCapture={trackView}
        onKeyDownCapture={(e) => {
          trackView();
          if (
            (e.key === 'Enter' || e.key === ' ') &&
            e.target instanceof Element &&
            e.target.matches('.react-flow__node, .react-flow__edge')
          )
            openInspector();
        }}
      >
        <div className="absolute inset-0">
          <ReactFlow<CanvasNode, FlowEdge>
            ariaLabelConfig={labels}
            zIndexMode="manual"
            nodesDraggable={!readOnly}
            nodesConnectable={!readOnly}
            edgesReconnectable={!readOnly}
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={changeNodes}
            onEdgesChange={changeEdges}
            onNodeClick={(event, node) => {
              if (
                !readOnly &&
                node.type === 'region' &&
                event.target instanceof Element &&
                event.target.closest('.group-name-trigger')
              ) {
                setSelected({
                  groups: [node.data.group.id],
                  nodes: [],
                  edges: [],
                });
                if (window.matchMedia('(max-width:720px)').matches) return;
              }
              openInspector();
            }}
            onEdgeClick={openInspector}
            onConnectStart={(_, p) => setSource(p.nodeId)}
            onConnectEnd={() => setSource(null)}
            onClickConnectStart={(_, p) => setSource(p.nodeId)}
            onClickConnectEnd={() => setSource(null)}
            isValidConnection={(c) => canConnect(diagram, c.source, c.target)}
            onConnect={(c) => {
              if (readOnly) return;
              const id = editor.connect(c.source, c.target);
              if (id) {
                setSelected({ groups: [], nodes: [], edges: [id] });
                openInspector();
              }
            }}
            onPaneClick={() =>
              setSelected({ groups: [], nodes: [], edges: [] })
            }
            deleteKeyCode={null}
            multiSelectionKeyCode={
              readOnly ? null : ['Meta', 'Control', 'Shift']
            }
            defaultViewport={diagram.viewport}
            onViewportChange={(vp) =>
              !readOnly && recordViewport(diagram.id, vp, interacted.current)
            }
            fitView={shouldFit}
            fitViewOptions={initialFit}
            minZoom={Math.min(0.15, zoom, diagram.viewport.zoom)}
            maxZoom={2}
            aria-label="월간 자금 흐름도"
          >
            {grid && (
              <Background
                color="#cbced5"
                gap={19}
                size={1.4}
                variant={BackgroundVariant.Dots}
              />
            )}
            {!graph.nodes.length && !graph.groupNodes.length && (
              <div className="empty-canvas">
                {readOnly
                  ? '비어 있는 흐름입니다.'
                  : '수입 노드를 추가해 자금 흐름을 시작하세요.'}
              </div>
            )}
            {source && (
              <Panel
                position="bottom-center"
                className="connection-hint"
                role="status"
              >
                연결할 노드의 왼쪽 점을 선택하세요
              </Panel>
            )}
            <Panel
              position={readOnly ? 'bottom-left' : 'bottom-right'}
              className="canvas-controls"
              ref={controlsRef}
            >
              <button aria-label="축소" onClick={() => void zoomOut()}>
                <Minus size={16} />
              </button>
              <output aria-label="확대 비율">{Math.round(zoom * 100)}%</output>
              <button aria-label="확대" onClick={() => void zoomIn()}>
                <Plus size={16} />
              </button>
              <button
                className="zoom-reset"
                aria-label="100% 배율로 설정"
                onClick={() => void zoomTo(1)}
              >
                100%
              </button>
              <i />
              <button
                aria-label="전체 보기"
                onClick={
                  readOnly
                    ? () => void fitView({ ...fitOptions, duration: 180 })
                    : fitVisibleArea
                }
              >
                <Maximize size={15} />
              </button>
              {!readOnly && (
                <button
                  aria-label="자동 정렬"
                  disabled={!graph.nodes.length}
                  onClick={arrange}
                >
                  <WandSparkles size={15} />
                </button>
              )}
              <button
                aria-label="격자 표시"
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
