import { useId, useRef, useState } from 'react';
import { editor } from '../editor/store';

export function FlowName({ name }: { name: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const errorId = useId();
  const invalid = draft !== null && !draft.trim();
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
        <>
          <input
            aria-label="현재 흐름 이름"
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? errorId : undefined}
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={(event) => finish(event.currentTarget.value, false)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === 'Enter' || event.key === 'Escape') {
                event.preventDefault();
                if (event.key === 'Enter' && invalid) return;
                finish(
                  event.key === 'Enter' ? event.currentTarget.value : null,
                  true,
                );
              }
            }}
          />
          {invalid ? (
            <span className="workspace-title-error" id={errorId} role="status">
              흐름 이름을 입력하세요.
            </span>
          ) : null}
        </>
      )}
    </div>
  );
}
