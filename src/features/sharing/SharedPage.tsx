import { useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import type { Diagram } from '../../types/diagram';
import { decodeShare } from './codec';
import { Canvas } from '../editor/Canvas';
import { emptySelection, type Selection } from '../editor/store';
import { copyShared, useLibrary } from '../diagrams/library';
import { describe } from '../nodes/presentation';
import { exactAmount } from '../edges/money';

function Viewer({ diagram }: { diagram: Diagram }) {
  const [selected, setSelected] = useState<Selection>(emptySelection);
  const { busy, error, conflict } = useLibrary();
  const node = diagram.nodes.find((n) => selected.nodes.includes(n.id));
  const edge = diagram.edges.find((e) => selected.edges.includes(e.id));
  const group = diagram.groups.find((g) => selected.groups.includes(g.id));
  const names = new Map(diagram.nodes.map((n) => [n.id, n.name]));
  const appearance = node && describe(node, diagram);
  return (
    <main className="shared-page">
      <header className="shared-heading">
        <div>
          <p>Money Flow · 읽기 전용</p>
          <h1>{diagram.name}</h1>
        </div>
        <button
          className="fresh"
          disabled={busy}
          onClick={async () => {
            if (await copyShared(diagram)) window.location.hash = '';
          }}
        >
          내 다이어그램으로 복사
        </button>
      </header>
      {error && <p role="alert">{error}</p>}
      {conflict && (
        <p role="alert">
          열려 있는 내 흐름의 저장 충돌을 먼저 해결하세요.{' '}
          <a href="#">내 흐름 열기</a>
        </p>
      )}
      <Canvas
        diagram={diagram}
        selected={selected}
        setSelected={setSelected}
        openInspector={() => {}}
        readOnly
      />
      <section
        className="shared-info"
        aria-label="선택 상세"
        aria-live="polite"
      >
        {node && appearance ? (
          <>
            <strong>{node.name}</strong>
            <span>
              {appearance.kind} · {appearance.subtitle}
            </span>
            {node.owner && <span>소유자 {node.owner}</span>}
            {node.groupId && (
              <span>
                소속 그룹{' '}
                {diagram.groups.find((g) => g.id === node.groupId)?.name}
              </span>
            )}
          </>
        ) : edge ? (
          <>
            <strong>
              {names.get(edge.source)} → {names.get(edge.target)}
            </strong>
            <span>{exactAmount(edge)}</span>
            {edge.memo && <span>{edge.memo}</span>}
          </>
        ) : group ? (
          <>
            <strong>{group.name}</strong>
            <span>
              소속 노드{' '}
              {diagram.nodes.filter((n) => n.groupId === group.id).length}개
            </span>
          </>
        ) : (
          <span>노드나 연결선을 선택하면 상세 정보를 볼 수 있습니다.</span>
        )}
      </section>
    </main>
  );
}
export function SharedPage({ url }: { url: string }) {
  const [result, setResult] = useState<Diagram | string | null>(null);
  useEffect(() => {
    let active = true;
    void decodeShare(url).then(
      (d) => {
        if (active) setResult(d);
      },
      (e: Error) => {
        if (active) setResult(e.message);
      },
    );
    return () => {
      active = false;
    };
  }, [url]);
  if (!result || typeof result === 'string')
    return (
      <main className="library-start">
        <h1>공유 흐름</h1>
        {result ? (
          <>
            <p role="alert">{result}</p>
            <a href="#">내 흐름 열기</a>
          </>
        ) : (
          <p role="status">공유 링크를 여는 중…</p>
        )}
      </main>
    );
  return (
    <ReactFlowProvider>
      <Viewer diagram={result} />
    </ReactFlowProvider>
  );
}
