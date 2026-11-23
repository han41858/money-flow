import { useRef, useState, type CSSProperties } from 'react';
import type { MoneyEdge } from '../../types/diagram';
import { editor } from '../editor/store';
import { amountLabel, exactAmount } from './money';
import { onEditKey } from '../../lib/editing';

export function TransferAmount({
  edge,
  readOnly,
  style,
}: {
  edge: MoneyEdge;
  readOnly?: boolean;
  style: CSSProperties;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const label = amountLabel(edge.min, edge.max);
  const title = exactAmount(edge);
  const className = 'edge-label nodrag nopan';

  function finish(save: boolean, restoreFocus: boolean) {
    if (save && draft !== null) {
      const match = /^(\d+)\s*(?:~\s*(\d+))?$/.exec(draft.trim());
      if (
        !match ||
        !editor.editEdge(edge.id, {
          min: Number(match[1]),
          max: Number(match[2] ?? match[1]),
        })
      ) {
        if (restoreFocus) {
          setError(true);
          return;
        }
      }
    }
    setDraft(null);
    setError(false);
    if (restoreFocus)
      requestAnimationFrame(() =>
        trigger.current?.focus({ preventScroll: true }),
      );
  }

  if (readOnly)
    return (
      <span className={className} title={title} style={style}>
        {label}
      </span>
    );

  return draft === null ? (
    <button
      ref={trigger}
      type="button"
      className={className}
      title={title}
      aria-label={title + ' 금액 수정'}
      style={style}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
      }}
      onClick={(event) => {
        event.stopPropagation();
        setDraft(
          edge.min === edge.max ? String(edge.min) : edge.min + '~' + edge.max,
        );
      }}
    >
      {label}
    </button>
  ) : (
    <div
      className={className + ' edge-amount-editor nowheel'}
      style={style}
      onClick={(event) => event.stopPropagation()}
    >
      <input
        autoFocus
        aria-label="연결선 금액 (원)"
        aria-invalid={error}
        title="원 단위 숫자 또는 최소~최대"
        value={draft}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(false);
        }}
        onBlur={() => finish(true, false)}
        onKeyDown={(event) => {
          event.stopPropagation();
          onEditKey(event, (save) => finish(save, true));
        }}
      />
      {error && (
        <small role="alert">
          원 단위 숫자 또는 최소~최대 금액을 입력하세요.
        </small>
      )}
    </div>
  );
}
