import { useRef, useState } from 'react';
import {
  useReactFlow,
  type NodeChange,
  type NodeSelectionChange,
  type XYPosition,
} from '@xyflow/react';
import type { Diagram } from '../../types/diagram';
import type { RegionNode } from '../groups/GroupRegion';
import {
  absoluteFrom,
  measuredSizes,
  type Group,
  type Size,
} from '../groups/geometry';
import type { FlowNode } from './graph';
import { editor, type Selection } from './store';

type CanvasNode = FlowNode | RegionNode;

export function useCanvasNodeInteractions(
  diagram: Diagram,
  readOnly: boolean,
  selectionChanges: (
    changes: NodeSelectionChange[],
    key: keyof Selection,
  ) => void,
) {
  const { getInternalNode } = useReactFlow();
  const [positions, setPositions] = useState<Map<string, XYPosition>>(
    new Map(),
  );
  const [measurements, setMeasurements] = useState<Map<string, Size>>(
    new Map(),
  );
  const [resizing, setResizing] = useState<{ id: string; size: Size } | null>(
    null,
  );
  const resizePositions = useRef(new Map<string, XYPosition>());

  function changeNodes(
    changes: NodeChange<CanvasNode>[],
    regions: ReadonlyMap<string, Group>,
  ) {
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
    const resize = changes.find(
      (change) =>
        change.type === 'dimensions' &&
        change.resizing !== undefined &&
        change.dimensions &&
        regions.has(change.id),
    );
    if (resize?.type === 'dimensions' && resize.dimensions) {
      const group = regions.get(resize.id)!;
      if (resize.resizing) {
        // Keep the moving origin and the children's compensating positions
        // in the preview; these position changes are not separate moves.
        const next = new Map(resizePositions.current);
        for (const change of changes) {
          if (change.type === 'position' && change.position)
            next.set(change.id, change.position);
        }
        resizePositions.current = next;
        setPositions((previous) => new Map([...previous, ...next]));
        setResizing({ id: resize.id, size: resize.dimensions });
      } else {
        const preview = resizePositions.current;
        const local = preview.get(resize.id);
        const parentId = getInternalNode(resize.id)?.parentId;
        const parent = parentId ? getInternalNode(parentId) : undefined;
        const position =
          local && parent
            ? absoluteFrom(local, parent.internals.positionAbsolute)
            : local;
        editor.resizeGroup(
          group.id,
          resize.dimensions,
          measuredSizes(diagram.nodes, getInternalNode),
          position,
        );
        resizePositions.current = new Map();
        setPositions((previous) => {
          const next = new Map(previous);
          for (const id of preview.keys()) next.delete(id);
          return next;
        });
        setResizing(null);
      }
      return;
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
        let absolute = point;
        let parentId = getInternalNode(id)?.parentId;
        while (parentId) {
          const parent = getInternalNode(parentId);
          if (!parent) break;
          absolute = absoluteFrom(
            absolute,
            finished.get(parentId) ?? parent.position,
          );
          parentId = parent.parentId;
        }
        const group = regions.get(id);
        if (group) groupPositions.set(group.id, absolute);
        else nodePositions.set(id, absolute);
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

  return { positions, measurements, resizing, changeNodes };
}
