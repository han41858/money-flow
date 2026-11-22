import { StrictMode, lazy, Suspense, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const App = lazy(() => import('./app/App').then((m) => ({ default: m.App })));
const SharedPage = lazy(() =>
  import('./features/sharing/SharedPage').then((m) => ({
    default: m.SharedPage,
  })),
);

function subscribe(listener: () => void) {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}

function Root() {
  const url = useSyncExternalStore(subscribe, () => location.href);
  const shared = new URL(url).hash.startsWith('#share');
  return (
    <Suspense fallback={<main role="status">흐름을 여는 중…</main>}>
      {shared ? <SharedPage key={url} url={url} /> : <App />}
    </Suspense>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
