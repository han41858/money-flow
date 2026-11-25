import type { Diagram, MoneyNode } from '../../types/diagram';

type SharedDiagram = Pick<
  Diagram,
  | 'schemaVersion'
  | 'name'
  | 'description'
  | 'nodes'
  | 'edges'
  | 'groups'
  | 'customInstitutions'
>;

// These tables are part of the v3 wire format; their order is fixed.
const types = ['income', 'account', 'card', 'expense'] as const;
const categories = ['consumption', 'saving', 'loan'] as const;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const zero = BigInt(0);
const one = BigInt(1);
const seven = BigInt(7);
const lowSeven = BigInt(127);

function invalid(): never {
  throw new Error('올바르지 않은 바이너리 공유 데이터입니다.');
}

function id(index: number) {
  return index.toString(36);
}

function indices(items: { id: string }[]) {
  return new Map(items.map((item, index) => [item.id, index]));
}

class Writer {
  private bytes: number[] = [];

  byte(value: number) {
    this.bytes.push(value);
  }

  private varint(value: bigint) {
    while (value > lowSeven) {
      this.byte(Number(value & lowSeven) | 128);
      value >>= seven;
    }
    this.byte(Number(value));
  }

  uint(value: number) {
    this.varint(BigInt(value));
  }

  point({ x, y }: { x: number; y: number }) {
    for (const coordinate of [x, y]) {
      const n = BigInt(Math.round(coordinate));
      this.varint(n < zero ? (-n << one) - one : n << one);
    }
  }

  text(value: string) {
    const bytes = encoder.encode(value);
    this.uint(bytes.length);
    for (const byte of bytes) this.byte(byte);
  }

  list<T>(items: T[], write: (item: T) => void) {
    this.uint(items.length);
    for (const item of items) write(item);
  }

  finish() {
    return Uint8Array.from(this.bytes);
  }
}

class Reader {
  private offset = 0;

  constructor(private bytes: Uint8Array) {}

  private get remaining() {
    return this.bytes.length - this.offset;
  }

  byte() {
    if (this.remaining === 0) invalid();
    return this.bytes[this.offset++];
  }

  flags(mask: number) {
    const flags = this.byte();
    if (flags & ~mask) invalid();
    return flags;
  }

  private varint(maxBytes: number) {
    let value = zero;
    for (let i = 0; i < maxBytes; i++) {
      const byte = this.byte();
      value |= BigInt(byte & 127) << BigInt(i * 7);
      if (byte < 128) {
        if (i > 0 && byte === 0) invalid();
        return value;
      }
    }
    return invalid();
  }

  uint() {
    const value = Number(this.varint(8));
    if (!Number.isSafeInteger(value)) invalid();
    return value;
  }

  // A rounded finite JS number can have up to 1024 bits (1025 with ZigZag).
  integer(signed = false) {
    const n = this.varint(147);
    const integer = !signed ? n : n & one ? -(n >> one) - one : n >> one;
    const value = Number(integer);
    if (!Number.isFinite(value) || BigInt(value) !== integer) invalid();
    return value;
  }

  point() {
    return { x: this.integer(true), y: this.integer(true) };
  }

  text() {
    const length = this.uint();
    if (length > this.remaining) invalid();
    const start = this.offset;
    this.offset += length;
    return decoder.decode(this.bytes.subarray(start, this.offset));
  }

  list<T>(read: (index: number, count: number) => T) {
    const count = this.uint();
    // Even the smallest record consumes at least one byte.
    if (count > this.remaining) invalid();
    const items: T[] = [];
    for (let i = 0; i < count; i++) items.push(read(i, count));
    return items;
  }

  ref(count: number) {
    const index = this.uint();
    if (index >= count) invalid();
    return index;
  }

  finish() {
    if (this.remaining !== 0) invalid();
  }
}

// v3 record order: header, literal institution IDs, custom institutions,
// groups, nodes, edges. Text and arrays have unsigned varint lengths.
export function encodeBinary(diagram: Diagram) {
  const w = new Writer();
  const groups = indices(diagram.groups);
  const nodes = indices(diagram.nodes);
  const institutions = indices(diagram.customInstitutions);
  const literals: string[] = [];
  for (const { institutionId } of diagram.nodes) {
    if (institutionId !== undefined && !institutions.has(institutionId)) {
      institutions.set(institutionId, institutions.size);
      literals.push(institutionId);
    }
  }

  w.byte(diagram.description === undefined ? 0 : 1);
  w.text(diagram.name);
  if (diagram.description !== undefined) w.text(diagram.description);
  w.list(literals, (literal) => w.text(literal));
  w.list(diagram.customInstitutions, ({ name, color }) => {
    w.text(name);
    w.text(color);
  });
  w.list(diagram.groups, (group) => {
    w.byte(group.parentId === undefined ? 0 : 1);
    w.text(group.name);
    w.text(group.color);
    w.point(group.position);
    w.uint(Math.max(1, Math.round(group.width)));
    w.uint(Math.max(1, Math.round(group.height)));
    if (group.parentId !== undefined) w.uint(groups.get(group.parentId)!);
  });
  w.list(diagram.nodes, (node) => {
    const payer = node.type === 'income' ? node.payer : undefined;
    const category =
      node.type === 'expense' ? categories.indexOf(node.category) : 0;
    w.byte(
      types.indexOf(node.type) |
        (node.groupId === undefined ? 0 : 4) |
        (node.institutionId === undefined ? 0 : 8) |
        (payer === undefined ? 0 : 16) |
        (category << 5),
    );
    w.text(node.name);
    w.point(node.position);
    if (node.groupId !== undefined) w.uint(groups.get(node.groupId)!);
    if (node.institutionId !== undefined)
      w.uint(institutions.get(node.institutionId)!);
    if (payer !== undefined) w.text(payer);
  });
  w.list(diagram.edges, (edge) => {
    const delta = edge.max - edge.min;
    w.byte((delta === 0 ? 0 : 1) | (edge.memo === undefined ? 0 : 2));
    w.uint(nodes.get(edge.source)!);
    w.uint(nodes.get(edge.target)!);
    w.uint(edge.min);
    if (delta !== 0) w.uint(delta);
    if (edge.memo !== undefined) w.text(edge.memo);
  });
  return w.finish();
}

export function decodeBinary(bytes: Uint8Array): SharedDiagram {
  const r = new Reader(bytes);
  const flags = r.flags(1);
  const name = r.text();
  const description = flags & 1 ? { description: r.text() } : {};
  const literals = r.list(() => r.text());
  const reserved = new Set(literals);
  const customInstitutions = r.list((index) => {
    let institutionId = id(index);
    // Do not let a regenerated local ID shadow any literal institution ID.
    while (reserved.has(institutionId)) institutionId += ':';
    return { id: institutionId, name: r.text(), color: r.text() };
  });
  const institutions = [
    ...customInstitutions.map((item) => item.id),
    ...literals,
  ];
  const groups = r.list((index, count) => {
    const flags = r.flags(1);
    const group = {
      id: id(index),
      name: r.text(),
      color: r.text(),
      position: r.point(),
      width: r.integer(),
      height: r.integer(),
    };
    return flags & 1 ? { ...group, parentId: id(r.ref(count)) } : group;
  });
  const nodes = r.list<MoneyNode>((index) => {
    const flags = r.flags(127);
    const type = types[flags & 3];
    const category = flags >> 5;
    if (
      (type !== 'income' && flags & 16) ||
      (type === 'expense' ? category >= categories.length : category !== 0)
    )
      invalid();
    const core = {
      id: id(index),
      name: r.text(),
      position: r.point(),
      ...(flags & 4 ? { groupId: id(r.ref(groups.length)) } : {}),
      ...(flags & 8
        ? { institutionId: institutions[r.ref(institutions.length)] }
        : {}),
    };
    if (type === 'income')
      return { ...core, type, ...(flags & 16 ? { payer: r.text() } : {}) };
    if (type === 'expense')
      return { ...core, type, category: categories[category] };
    if (type === 'account') return { ...core, type };
    return { ...core, type };
  });
  const edges = r.list((index) => {
    const flags = r.flags(3);
    const source = id(r.ref(nodes.length));
    const target = id(r.ref(nodes.length));
    const min = r.uint();
    const delta = flags & 1 ? r.uint() : 0;
    const max = min + delta;
    if ((flags & 1 && delta === 0) || !Number.isSafeInteger(max)) invalid();
    return {
      id: id(index),
      source,
      target,
      min,
      max,
      ...(flags & 2 ? { memo: r.text() } : {}),
    };
  });
  r.finish();
  return {
    schemaVersion: 2,
    name,
    ...description,
    nodes,
    edges,
    groups,
    customInstitutions,
  };
}
