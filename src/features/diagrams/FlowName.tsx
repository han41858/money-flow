import { useRef, useState } from 'react';
import { editor } from '../editor/store';

export function FlowName({ name }: { name: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  function finish(value: string | null, restoreFocus: boolean) {
    setDraft(null);
    if (value !== null) editor.rename(value);
    if (restoreFocus) requestAnimationFrame(() => trigger.current?.focus());
  }

  return (
    <div className="workspace-title">
      {draft === null ? (
        <button
          ref={trigger}
          type="button"
          title={name}
          aria-label={name + ' 이름 수정'}
          onClick={() => setDraft(name)}
        >
          {name}
        </button>
      ) : (
        <input
          aria-label="현재 흐름 이름"
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={(event) => finish(event.currentTarget.value, false)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'Enter' || event.key === 'Escape') {
              event.preventDefault();
              finish(
                event.key === 'Enter' ? event.currentTarget.value : null,
                true,
              );
            }
          }}
        />
      )}
    </div>
  );
}
