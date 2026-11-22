import {
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

const narrow = window.matchMedia('(max-width: 720px)');

function subscribe(listener: () => void) {
  narrow.addEventListener('change', listener);
  return () => narrow.removeEventListener('change', listener);
}

export function ResponsivePanel({
  children,
  open,
  side,
  label,
  close,
}: {
  children: ReactNode;
  open: boolean;
  side: 'left' | 'right';
  label: string;
  close: () => void;
}) {
  const mobile = useSyncExternalStore(subscribe, () => narrow.matches);
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    if (!mobile || !open) return;
    const el = ref.current!;
    const trigger = document.activeElement;
    el.showModal();
    el.querySelector('button')?.focus({ preventScroll: true });
    return () => {
      el.close();
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus({ preventScroll: true });
    };
  }, [mobile, open]);
  if (!mobile) return children;
  if (!open) return null;
  return (
    <dialog
      ref={ref}
      className={'mobile-panel ' + side}
      aria-label={label}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      {children}
    </dialog>
  );
}
