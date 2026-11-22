import { useEffect, useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { X, Share2 } from 'lucide-react';
import { snapshot, exportFile } from '../diagrams/library';
import { measuredSizes } from '../groups/geometry';
import { exportImage } from '../export/image';
import { exactAmount } from '../edges/money';
import { encodeShare } from './codec';

export function ShareDialog({ close }: { close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [diagram] = useState(snapshot);
  const [link, setLink] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { getInternalNode } = useReactFlow();
  const names = new Map(diagram.nodes.map((n) => [n.id, n.name]));
  useEffect(() => {
    const el = dialog.current!;
    el.showModal();
    return () => el.close();
  }, []);

  async function run(action: () => Promise<void>) {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : '작업을 완료할 수 없습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="library-dialog share-dialog"
      aria-labelledby="share-title"
      onCancel={close}
    >
      <div className="library-top">
        <h2 id="share-title">
          <Share2 size={20} />
          공유 및 내보내기
        </h2>
        <button onClick={close} aria-label="공유 창 닫기">
          <X size={18} />
        </button>
      </div>
      <section>
        <h3>공유 링크</h3>
        <p>
          링크를 가진 사람은 누구나 이름, 금액, 메모 등 흐름 전체를 읽고 복사할
          수 있습니다. 링크에 담긴 데이터는 암호화되지 않습니다.
        </p>
        <details>
          <summary>공유할 이름과 금액 확인</summary>
          <ul>
            {diagram.nodes.map((n) => (
              <li key={n.id}>{n.name}</li>
            ))}
          </ul>
          <ul>
            {diagram.edges.map((e) => (
              <li key={e.id}>
                {names.get(e.source)} → {names.get(e.target)} · {exactAmount(e)}
              </li>
            ))}
          </ul>
        </details>
        {link && (
          <label className="field">
            읽기 전용 주소
            <input readOnly value={link} onFocus={(e) => e.target.select()} />
          </label>
        )}
        <div className="library-actions">
          {link ? (
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await navigator.clipboard.writeText(link);
                  setMessage('링크를 복사했습니다.');
                })
              }
            >
              링크 복사
            </button>
          ) : (
            <button
              disabled={busy}
              onClick={() =>
                void run(async () =>
                  setLink(await encodeShare(diagram, location.href)),
                )
              }
            >
              공유 링크 만들기
            </button>
          )}
        </div>
      </section>
      <section>
        <h3>파일 내보내기</h3>
        <p>이미지는 화면 밖의 영역을 포함한 전체 흐름을 담습니다.</p>
        <div className="library-actions">
          {(['svg', 'png'] as const).map((format) => (
            <button
              key={format}
              disabled={busy}
              onClick={() =>
                void run(() =>
                  exportImage(
                    diagram,
                    measuredSizes(diagram.nodes, getInternalNode),
                    format,
                  ),
                )
              }
            >
              {format.toUpperCase()} 저장
            </button>
          ))}
          <button onClick={exportFile}>JSON 내보내기</button>
        </div>
      </section>
      {error && <p role="alert">{error}</p>}
      <p role="status">{message}</p>
    </dialog>
  );
}
