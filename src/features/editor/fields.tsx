import { useState } from 'react';
import type { MoneyEdge } from '../../types/diagram';
import { editor } from './store';

type FieldProps = {
  label: string;
  value: string;
  list?: string;
  commit: (value: string) => string | void;
};
export function TextField({ label, value, list, commit }: FieldProps) {
  const [draft, setDraft] = useState(value),
    [error, setError] = useState('');
  return (
    <label className="field">
      {label}
      <input
        value={draft}
        list={list}
        onChange={(e) => {
          setDraft(e.target.value);
          setError('');
        }}
        onBlur={() => {
          const text = draft.trim();
          if (text !== value) {
            const message = commit(text);
            setError(message ?? '');
            if (!message) setDraft(text);
          } else setDraft(value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing)
            e.currentTarget.blur();
        }}
        aria-invalid={Boolean(error)}
      />
      {error && <small role="alert">{error}</small>}
    </label>
  );
}
export function AmountFields({ edge }: { edge: MoneyEdge }) {
  const [min, setMin] = useState(String(edge.min)),
    [max, setMax] = useState(String(edge.max));
  const [range, setRange] = useState(edge.min !== edge.max),
    [error, setError] = useState('');
  function commit() {
    const upper = range ? max : min;
    if (
      !/^\d+$/.test(min) ||
      !/^\d+$/.test(upper) ||
      !editor.editEdge(edge.id, { min: Number(min), max: Number(upper) })
    ) {
      setError(
        '0 이상의 원 단위 정수를 입력하세요. 최대 금액은 최소 금액 이상이어야 합니다.',
      );
    } else setError('');
  }
  function input(label: string, value: string, set: (s: string) => void) {
    return (
      <label className="field">
        {label}
        <input
          inputMode="numeric"
          value={value}
          onChange={(e) => {
            set(e.target.value);
            setError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.currentTarget.blur();
            }
          }}
        />
      </label>
    );
  }
  return (
    <div className="amount-fields">
      <label className="field">
        금액 방식
        <select
          value={range ? 'range' : 'fixed'}
          onChange={(e) => {
            const next = e.target.value === 'range';
            setRange(next);
            setMin(String(edge.min));
            setMax(String(next ? edge.max : edge.min));
            setError('');
            if (!next) editor.editEdge(edge.id, { max: edge.min });
          }}
        >
          <option value="fixed">고정 금액</option>
          <option value="range">범위 금액</option>
        </select>
      </label>
      <div
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) commit();
        }}
      >
        {input(range ? '월 최소 금액 (원)' : '월 금액 (원)', min, setMin)}
        {range && input('월 최대 금액 (원)', max, setMax)}
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
