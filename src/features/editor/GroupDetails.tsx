import { useReactFlow } from '@xyflow/react';
import type { Diagram } from '../../types/diagram';
import { minGroupSize, measuredSizes, type Group } from '../groups/geometry';
import { editor } from './store';
import { TextField } from './fields';

export function GroupDetails({
  group,
  nodes,
}: {
  group: Group;
  nodes: Diagram['nodes'];
}) {
  const { getInternalNode } = useReactFlow();
  return (
    <>
      <TextField
        key={group.name}
        label="그룹 이름"
        value={group.name}
        commit={(name) => {
          if (!name) return '그룹 이름을 입력하세요.';
          editor.editGroup(group.id, { name });
        }}
      />
      <label className="field">
        배경색
        <input
          type="color"
          value={group.color}
          onChange={(e) =>
            editor.editGroup(group.id, { color: e.target.value })
          }
        />
      </label>
      <div className="group-dimensions">
        {(['width', 'height'] as const).map((axis) => (
          <TextField
            key={axis + group[axis]}
            label={axis === 'width' ? '너비 (px)' : '높이 (px)'}
            value={String(group[axis])}
            commit={(text) => {
              const value = Number(text);
              if (!Number.isFinite(value) || value < minGroupSize[axis])
                return minGroupSize[axis] + 'px 이상 입력하세요.';
              editor.resizeGroup(
                group.id,
                { width: group.width, height: group.height, [axis]: value },
                measuredSizes(nodes, getInternalNode),
              );
            }}
          />
        ))}
      </div>
      <div className="property">
        <span>소속 노드</span>
        <strong>{nodes.filter((n) => n.groupId === group.id).length}개</strong>
      </div>
    </>
  );
}
