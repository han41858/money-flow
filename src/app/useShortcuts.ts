import { useEffect } from 'react';
import { useLibrary } from '../features/diagrams/library';
import { editor } from '../features/editor/store';

export function useShortcuts({
  blocked,
  copyNodes,
  pasteNodes,
  remove,
  clear,
}: {
  blocked: boolean;
  copyNodes: () => boolean;
  pasteNodes: () => boolean;
  remove: () => void;
  clear: () => void;
}) {
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (
        blocked ||
        useLibrary.getState().busy ||
        e.defaultPrevented ||
        e.isComposing ||
        (e.target instanceof HTMLElement &&
          (e.target.isContentEditable ||
            e.target.closest('input,textarea,select,[role=textbox]')))
      )
        return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'c' && !e.altKey && !e.shiftKey) {
        if (!window.getSelection()?.toString() && copyNodes())
          e.preventDefault();
      } else if (mod && key === 'v' && !e.altKey && !e.shiftKey) {
        if (pasteNodes()) e.preventDefault();
      } else if (mod && (key === 'z' || key === 'y')) {
        e.preventDefault();
        const h = editor.history.getState();
        if (key === 'y' || e.shiftKey) h.redo();
        else h.undo();
      } else if (key === 'delete' || key === 'backspace') {
        e.preventDefault();
        remove();
      } else if (key === 'escape') {
        clear();
      }
    }

    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [remove, blocked, copyNodes, pasteNodes, clear]);
}
