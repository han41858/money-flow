import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  FilePlus2,
  FolderOpen,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { editor } from '../editor/store';
import * as library from './library';

export function StorageNotice() {
  const { error, conflict, busy, dirty } = library.useLibrary();
  if (!error && !conflict) return null;
  return (
    <section className="storage-notice" role="alert">
      {conflict && (
        <>
          <p>
            {conflict.revision === null
              ? '다른 탭에서 이 흐름을 삭제했습니다. 현재 내용을 새 흐름으로 보관할 수 있습니다.'
              : '다른 탭에서 이 흐름을 수정했습니다. 어떤 내용을 유지할지 선택하세요.'}
          </p>
          <button disabled={busy} onClick={() => void library.reloadLatest()}>
            최신 내용 불러오기
          </button>
          <button
            disabled={busy}
            onClick={() => void library.keepLocal(conflict)}
          >
            {conflict.revision === null
              ? '새 흐름으로 보관'
              : '현재 탭 내용으로 계속'}
          </button>
        </>
      )}
      {error && (
        <>
          <p>{error}</p>
          {dirty && !conflict && (
            <button disabled={busy} onClick={() => void library.retrySave()}>
              저장 다시 시도
            </button>
          )}
        </>
      )}
    </section>
  );
}
export function LibraryDialog({ close }: { close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null),
    file = useRef<HTMLInputElement>(null);
  const diagram = editor.useDiagram((s) => s.diagram);
  const { entries, busy } = library.useLibrary();
  const [name, setName] = useState(diagram.name);
  useEffect(() => {
    const el = ref.current!;
    el.showModal();
    return () => el.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="library-dialog"
      aria-labelledby="library-title"
      onCancel={close}
    >
      <div className="library-top">
        <h2 id="library-title">
          <FolderOpen size={20} /> 내 흐름
        </h2>
        <button aria-label="목록 닫기" onClick={close}>
          <X size={18} />
        </button>
      </div>
      <p className="backup-note">
        데이터는 이 브라우저에만 저장됩니다. JSON 파일로 내보내 백업할 수
        있습니다.
      </p>
      <StorageNotice />
      <div className="library-list" aria-label="저장된 흐름">
        {entries.map((item) => (
          <button
            key={item.id}
            disabled={busy}
            aria-current={diagram.id === item.id ? 'true' : undefined}
            onClick={() => {
              if (item.id === diagram.id) close();
              else void library.open(item.id);
            }}
          >
            <span>{item.name}</span>
            {item.id === diagram.id ? (
              <Check size={16} aria-label="현재 흐름" />
            ) : (
              <span>열기</span>
            )}
          </button>
        ))}
      </div>
      <div className="library-actions">
        <button disabled={busy} onClick={() => void library.createBlank()}>
          <FilePlus2 />새 흐름
        </button>
        <button disabled={busy} onClick={() => file.current?.click()}>
          <Upload />
          JSON 가져오기
        </button>
        <input
          ref={file}
          type="file"
          accept=".json,application/json"
          aria-label="JSON 파일 선택"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void library.importFile(f);
          }}
        />
      </div>
      <section className="document-actions">
        <h3>현재 흐름 관리</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void library.rename(name);
          }}
        >
          <label className="field">
            흐름 이름
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <button
            disabled={busy || !name.trim() || name.trim() === diagram.name}
          >
            이름 변경
          </button>
        </form>
        <div className="library-actions">
          <button disabled={busy} onClick={() => void library.duplicate()}>
            <Copy />
            복제
          </button>
          <button onClick={library.exportFile}>
            <Download />
            JSON 내보내기
          </button>
          <button
            className="danger"
            disabled={busy}
            onClick={() => {
              if (window.confirm('“' + diagram.name + '” 흐름을 삭제할까요?'))
                void library.remove();
            }}
          >
            <Trash2 />
            삭제
          </button>
        </div>
      </section>
    </dialog>
  );
}
