import { useState, type ReactNode } from 'react';
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Layers2,
  ListTree,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Sprout,
  Waypoints,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Canvas, type Selection } from '../features/editor/Canvas';
import { amountLabel, sum } from '../features/edges/money';
import { describe, kindNames } from '../features/nodes/presentation';
import { example } from './example';
import type { MoneyNode } from '../types/diagram';

const { nodes, edges } = example;
const byId = new Map(nodes.map((n) => [n.id, n]));
const monthlyIncome = sum(
  edges.filter((e) => byId.get(e.source)?.type === 'income'),
);
function endpointAmount(category: 'consumption' | 'saving') {
  return sum(
    edges.filter((e) => {
      const n = byId.get(e.target);
      return n?.type === 'expense' && n.category === category;
    }),
  );
}
function Summary({
  icon: Icon,
  label,
  value,
  theme,
}: {
  icon: LucideIcon;
  label: string;
  value: { min: number; max: number };
  theme: string;
}) {
  return (
    <div className={'metric ' + theme}>
      <span className="metric-icon">
        <Icon size={21} />
      </span>
      <div>
        <span>{label}</span>
        <strong>
          {amountLabel(value.min, value.max)}
          <small>원</small>
        </strong>
      </div>
    </div>
  );
}
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="property">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
function exact(value: { min: number; max: number }) {
  const format = (n: number) => n.toLocaleString('ko-KR') + '원';
  return (
    format(value.min) +
    (value.min === value.max ? '' : ' ~ ' + format(value.max))
  );
}
function NodeRow({ node, onClick }: { node: MoneyNode; onClick: () => void }) {
  const { Icon, color } = describe(node, example);
  return (
    <button className="node-row" onClick={onClick}>
      <span
        style={{ background: 'color-mix(in srgb, ' + color + ' 12%, white)' }}
      >
        <Icon size={14} />
      </span>
      {node.name}
      <ChevronRight size={13} />
    </button>
  );
}
function Inspector({
  selected,
  select,
}: {
  selected: NonNullable<Selection>;
  select: (s: Selection) => void;
}) {
  const node = selected.type === 'node' ? byId.get(selected.id) : undefined;
  const edge =
    selected.type === 'edge'
      ? edges.find((e) => e.id === selected.id)
      : undefined;
  const info = node && describe(node, example);
  return (
    <>
      <button className="back" onClick={() => select(null)}>
        <ChevronLeft size={15} /> 노드 목록
      </button>
      <h2>{node?.name ?? '연결선 상세'}</h2>
      {node && info && (
        <>
          <dl>
            <Row label="유형">{info.kind}</Row>
            <Row
              label={
                node.type === 'expense'
                  ? '분류'
                  : node.type === 'income'
                    ? '수입 항목'
                    : '금융사'
              }
            >
              {info.subtitle}
            </Row>
            {node.owner && <Row label="소유자">{node.owner}</Row>}
            <Row label="월 유입">
              {exact(sum(edges.filter((e) => e.target === node.id)))}
            </Row>
            <Row label="월 유출">
              {exact(sum(edges.filter((e) => e.source === node.id)))}
            </Row>
          </dl>
          <h3>연결 흐름</h3>
          {edges
            .filter((e) => e.target === node.id || e.source === node.id)
            .map((e) => (
              <button
                className="related"
                key={e.id}
                onClick={() => select({ type: 'edge', id: e.id })}
              >
                {e.source === node.id ? (
                  <ArrowUpRight size={15} />
                ) : (
                  <ArrowDownLeft size={15} />
                )}{' '}
                {byId.get(e.source === node.id ? e.target : e.source)?.name}
                <ChevronRight size={13} />
              </button>
            ))}
        </>
      )}
      {edge && (
        <>
          <dl>
            <Row label="최소 금액">
              {exact({ min: edge.min, max: edge.min })}
            </Row>
            <Row label="최대 금액">
              {exact({ min: edge.max, max: edge.max })}
            </Row>
            {edge.memo && <Row label="메모">{edge.memo}</Row>}
          </dl>
          {(['source', 'target'] as const).map((end) => (
            <div key={end}>
              <h3>{end === 'source' ? '출발' : '도착'}</h3>
              <NodeRow
                node={byId.get(edge[end])!}
                onClick={() => select({ type: 'node', id: edge[end] })}
              />
            </div>
          ))}
        </>
      )}
    </>
  );
}
export function App() {
  const [selected, setSelected] = useState<Selection>(null);
  const [mobilePanel, setMobilePanel] = useState(false);
  function inspect(s: Selection) {
    setSelected(s);
    setMobilePanel(Boolean(s));
  }
  return (
    <div className="workspace">
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon">
            <Waypoints size={23} />
          </span>
          Money Flow
        </div>
        <span className="header-divider" />
        <span className="workspace-title">워크스페이스</span>
        <div className="view-mode">
          <CircleDot size={13} /> 예제 보기
        </div>
      </header>
      <div className="workspace-body">
        {mobilePanel && (
          <button
            className="scrim"
            aria-label="패널 닫기"
            onClick={() => setMobilePanel(false)}
          />
        )}
        <aside
          aria-label="다이어그램 탐색"
          className={'sidebar' + (mobilePanel ? ' open' : '')}
        >
          <div className="side-head">
            <span>
              <Layers2 size={16} /> 다이어그램
            </span>
            <button
              className="mobile-only"
              onClick={() => setMobilePanel(false)}
              aria-label="탐색 닫기"
            >
              <X size={17} />
            </button>
          </div>
          <button
            className="diagram-link"
            onClick={() => {
              setSelected(null);
              setMobilePanel(false);
            }}
          >
            <Network size={17} />
            {example.name}
          </button>
          <div className="side-content">
            {selected ? (
              <Inspector selected={selected} select={setSelected} />
            ) : (
              <>
                <div className="side-head">
                  <span>
                    <ListTree size={16} /> 노드 목록
                  </span>
                  <b>{nodes.length}</b>
                </div>
                {(Object.keys(kindNames) as MoneyNode['type'][]).map((type) => (
                  <section key={type} className="node-group">
                    <h3>{kindNames[type]}</h3>
                    {nodes
                      .filter((n) => n.type === type)
                      .map((n) => (
                        <NodeRow
                          key={n.id}
                          node={n}
                          onClick={() => inspect({ type: 'node', id: n.id })}
                        />
                      ))}
                  </section>
                ))}
              </>
            )}
          </div>
        </aside>
        <main>
          <div className="page-head">
            <div className="breadcrumb">
              <Network size={14} /> 다이어그램 <ChevronRight size={13} />{' '}
              <span>월간 계획</span>
            </div>
            <div className="title-row">
              <h1>{example.name}</h1>
              <button
                className="mobile-only"
                aria-label="노드 목록 열기"
                onClick={() => {
                  setSelected(null);
                  setMobilePanel(true);
                }}
              >
                {mobilePanel ? <PanelLeftClose /> : <PanelLeftOpen />}
              </button>
            </div>
            <p>{example.description}</p>
          </div>
          <div className="metrics">
            <Summary
              label="월 수입"
              value={monthlyIncome}
              theme="income"
              icon={ArrowDownLeft}
            />
            <Summary
              label="월 소비 지출"
              value={endpointAmount('consumption')}
              theme="spend"
              icon={ArrowUpRight}
            />
            <Summary
              label="월 저축·투자"
              value={endpointAmount('saving')}
              theme="save"
              icon={Sprout}
            />
          </div>
          <Canvas selected={selected} onSelect={inspect} />
          <footer>
            <span>
              <Activity size={14} /> 노드 {nodes.length}개 <i /> 연결{' '}
              {edges.length}개
            </span>
            <span>
              수입 <ArrowRight size={12} /> 계좌·카드 <ArrowRight size={12} />{' '}
              지출
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
