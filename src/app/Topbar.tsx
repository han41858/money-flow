import { useStore } from 'zustand';
import { FilePlus2, FolderOpen, Redo2, Share2, Undo2 } from 'lucide-react';
import type { Diagram } from '../types/diagram';
import { FlowName } from '../features/diagrams/FlowName';
import { createBlank } from '../features/diagrams/library';
import { editor } from '../features/editor/store';
import { Logo } from './Logo';

export function Topbar({
  diagram,
  setShareOpen,
  setLibraryOpen,
}: {
  diagram: Diagram;
  setShareOpen: (open: boolean) => void;
  setLibraryOpen: (open: boolean) => void;
}) {
  const undoable = useStore(editor.history, (s) => s.pastStates.length > 0);
  const redoable = useStore(editor.history, (s) => s.futureStates.length > 0);
  return (
    <header className="topbar">
      <div className="brand">
        <Logo size={34} />
        Money Flow
      </div>
      <span className="header-divider" />
      <FlowName key={diagram.id} name={diagram.name} />
      <div className="history-tools">
        <button
          aria-label="실행 취소"
          title="실행 취소 (Ctrl/⌘ Z)"
          disabled={!undoable}
          onClick={() => editor.history.getState().undo()}
        >
          <Undo2 size={17} />
        </button>
        <button
          aria-label="다시 실행"
          title="다시 실행 (Ctrl/⌘ Shift Z)"
          disabled={!redoable}
          onClick={() => editor.history.getState().redo()}
        >
          <Redo2 size={17} />
        </button>
        <button
          className="fresh share-trigger"
          aria-label="공유 및 내보내기"
          title="공유 및 내보내기"
          onClick={() => setShareOpen(true)}
        >
          <Share2 size={15} />
          <span>공유</span>
        </button>
        <button className="fresh" onClick={() => setLibraryOpen(true)}>
          <FolderOpen size={15} />내 흐름
        </button>
        <button className="fresh" onClick={() => void createBlank()}>
          <FilePlus2 size={15} />새 흐름
        </button>
      </div>
    </header>
  );
}
