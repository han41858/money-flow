import { useEffect, type KeyboardEvent, type RefObject } from 'react';

// Inline editors confirm with Enter and cancel with Escape. Keys pressed while
// an input method is composing text belong to the composition.
export function onEditKey(
  event: KeyboardEvent<HTMLInputElement>,
  finish: (save: boolean) => void,
  canSave = true,
) {
  if (event.nativeEvent.isComposing) return;
  if (event.key !== 'Enter' && event.key !== 'Escape') return;
  event.preventDefault();
  if (event.key === 'Enter' && !canSave) return;
  finish(event.key === 'Enter');
}

// Opens a <dialog> as a modal while the component is mounted.
export function useModalDialog(dialog: RefObject<HTMLDialogElement | null>) {
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, [dialog]);
}
