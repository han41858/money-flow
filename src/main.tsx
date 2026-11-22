import { StrictMode, useEffect, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { SharedPage } from './features/sharing/SharedPage';
import { start } from './features/diagrams/library';
import './styles.css';

function subscribe(listener: () => void) {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}
function Root() {
  const url = useSyncExternalStore(subscribe, () => location.href);
  const shared = new URL(url).hash.startsWith('#share');
  useEffect(() => {
    if (!shared) void start();
  }, [shared]);
  return shared ? <SharedPage key={url} url={url} /> : <App />;
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
