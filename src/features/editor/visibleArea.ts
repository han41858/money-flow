export function visibleArea(canvas: Element, openingInspector = false) {
  const { left, top, right, bottom } = canvas.getBoundingClientRect();
  const main = canvas.closest('#editor-main');
  const summary = main?.querySelector('.metrics')?.getBoundingClientRect();
  const inspector = main
    ?.querySelector('.editor-area > .detail-wrap')
    ?.getBoundingClientRect();
  const reservedWidth =
    openingInspector && main
      ? parseFloat(
          getComputedStyle(main).getPropertyValue('--inspector-width'),
        ) || 0
      : 0;

  return {
    left,
    top: Math.max(top, summary?.bottom ?? top),
    right: Math.min(right - reservedWidth, inspector?.left ?? right),
    bottom,
  };
}
