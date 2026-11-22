import type { AriaLabelConfig } from '@xyflow/react';
const movement: Record<string, string> = {
  left: '왼쪽으로',
  right: '오른쪽으로',
  up: '위로',
  down: '아래로',
};
export function canvasLabels(readOnly: boolean): Partial<AriaLabelConfig> {
  const select = 'Enter 또는 Space로 선택하고 Esc로 선택을 해제합니다.';
  return {
    'node.a11yDescription.default': readOnly
      ? select
      : select + ' 방향키로 노드를 이동합니다.',
    'node.a11yDescription.keyboardDisabled': select,
    'edge.a11yDescription.default': select,
    'handle.ariaLabel': '연결점',
    'node.a11yDescription.ariaLiveMessage': ({ direction }) =>
      '선택한 노드를 ' + movement[direction] + ' 이동했습니다.',
  };
}
