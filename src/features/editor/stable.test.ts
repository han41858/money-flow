import { expect, test } from 'vitest';
import { reuseUnchanged, sameValue } from './stable';

type Item = {
  id: string;
  position: { x: number; y: number };
  selected: boolean;
  data: { name: string; readOnly: boolean };
};

const origin = { x: 0, y: 0 };
const make = (id: string, patch: Partial<Item> = {}): Item => ({
  id,
  position: origin,
  selected: false,
  data: { name: id, readOnly: false },
  ...patch,
});
const empty = { list: [] as Item[], byId: new Map<string, Item>() };

test('값이 같은 항목은 이전 객체를 그대로 돌려주고 목록도 재사용한다', () => {
  const first = reuseUnchanged(empty, [make('a'), make('b')]);
  const second = reuseUnchanged(first, [make('a'), make('b')]);
  expect(second).toBe(first);
  expect(second.list[0]).toBe(first.list[0]);
});

test('바뀐 항목만 새 객체가 되고 나머지는 유지한다', () => {
  const first = reuseUnchanged(empty, [make('a'), make('b')]);
  const moved = { x: 10, y: 5 };
  const second = reuseUnchanged(first, [
    make('a', { position: moved }),
    make('b'),
  ]);
  expect(second.list[0]).not.toBe(first.list[0]);
  expect(second.list[0].position).toBe(moved);
  expect(second.list[0].data).toBe(first.list[0].data);
  expect(second.list[1]).toBe(first.list[1]);
});

test('data 안의 값이 바뀌면 data와 항목을 모두 새로 만든다', () => {
  const first = reuseUnchanged(empty, [make('a')]);
  const second = reuseUnchanged(first, [
    make('a', { data: { name: 'a', readOnly: true } }),
  ]);
  expect(second.list[0]).not.toBe(first.list[0]);
  expect(second.list[0].data.readOnly).toBe(true);
});

test('항목이 추가·삭제되거나 순서가 바뀌면 새 목록을 돌려준다', () => {
  const first = reuseUnchanged(empty, [make('a'), make('b')]);
  const added = reuseUnchanged(first, [make('a'), make('b'), make('c')]);
  expect(added.list).toHaveLength(3);
  expect(added.list[0]).toBe(first.list[0]);
  const removed = reuseUnchanged(added, [make('b')]);
  expect(removed.list).toEqual([first.list[1]]);
  expect(removed.byId.has('a')).toBe(false);
  const swapped = reuseUnchanged(first, [make('b'), make('a')]);
  expect(swapped).not.toBe(first);
  expect(swapped.list[0]).toBe(first.list[1]);
});

test('키가 사라지거나 생기면 다른 항목으로 본다', () => {
  const first = reuseUnchanged(empty, [make('a')]);
  const withWidth = reuseUnchanged(first, [
    { ...make('a'), width: 120 } as Item,
  ]);
  expect(withWidth.list[0]).not.toBe(first.list[0]);
  const back = reuseUnchanged(withWidth, [make('a')]);
  expect(back.list[0]).not.toBe(withWidth.list[0]);
  expect('width' in back.list[0]).toBe(false);
});

test('내용이 같은 새 객체·배열은 같은 값으로 보고 이전 항목을 유지한다', () => {
  type Rich = {
    id: string;
    position: { x: number; y: number };
    data: { ports: string[]; totals: { label: string }[]; icon: () => void };
  };
  const icon = () => {};
  const rich = (label: string): Rich => ({
    id: 'a',
    position: { x: 1, y: 2 },
    data: { ports: ['e1', 'e2'], totals: [{ label }], icon },
  });
  const none = { list: [] as Rich[], byId: new Map<string, Rich>() };
  const first = reuseUnchanged(none, [rich('10만')]);
  expect(reuseUnchanged(first, [rich('10만')])).toBe(first);
  const changed = reuseUnchanged(first, [rich('20만')]);
  expect(changed.list[0]).not.toBe(first.list[0]);
  expect(changed.list[0].data.totals[0].label).toBe('20만');
});

test('함수와 클래스 인스턴스는 참조가 같을 때만 같은 값이다', () => {
  expect(sameValue({ run: () => {} }, { run: () => {} })).toBe(false);
  expect(sameValue(new Map(), new Map())).toBe(false);
  expect(
    sameValue([1, [2, { a: undefined }]], [1, [2, { a: undefined }]]),
  ).toBe(true);
  expect(sameValue({ a: undefined }, { b: undefined })).toBe(false);
  expect(sameValue([1, 2], [1, 2, 3])).toBe(false);
  expect(sameValue(NaN, NaN)).toBe(true);
});
