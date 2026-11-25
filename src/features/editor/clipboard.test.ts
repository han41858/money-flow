import { expect, test } from 'vitest';
import { example } from '../../app/example';
import { copyNodes, pasteNodes } from './clipboard';

test('그룹 붙여넣기는 복사한 계층만 새 ID로 연결한다', () => {
  const [seed] = example.groups;
  const [first, second] = example.nodes;
  const source = {
    ...example,
    groups: [
      { ...seed, id: 'leaf', parentId: 'child' },
      { ...seed, id: 'outside' },
      { ...seed, id: 'child', parentId: 'root' },
      { ...seed, id: 'root', parentId: 'outside' },
    ],
    nodes: [
      { ...first, groupId: 'root' },
      { ...second, groupId: 'leaf' },
    ],
    edges: [],
  };
  const copied = copyNodes(source, [first.id], ['root', 'child'])!;
  const { change, selection } = pasteNodes(source, copied, { x: 0, y: 0 });
  const [leaf, child, root] = change.groups!.slice(source.groups.length);
  const [direct, nested] = change.nodes.slice(source.nodes.length);
  expect(root.id).not.toBe('root');
  expect(root.parentId).toBeUndefined();
  expect(child.parentId).toBe(root.id);
  expect(leaf.parentId).toBe(child.id);
  expect(direct.groupId).toBe(root.id);
  expect(nested.groupId).toBe(leaf.id);
  expect(selection).toEqual({ groups: [root.id], nodes: [], edges: [] });
});

test('노드가 없는 그룹도 붙여넣을 수 있다', () => {
  const [group] = example.groups;
  const source = { ...example, groups: [group], nodes: [], edges: [] };
  const copied = copyNodes(source, [], [group.id])!;
  const { change, selection } = pasteNodes(source, copied, { x: 0, y: 0 });
  expect(change.nodes).toEqual([]);
  expect(change.groups).toHaveLength(2);
  expect(selection.groups).toEqual([change.groups![1].id]);
});
