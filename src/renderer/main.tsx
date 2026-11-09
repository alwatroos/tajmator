import { createStore, Provider } from 'jotai';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { appStateAtom, updateStatusAtom } from './atoms.ts';

const store = createStore();
window.tajmator.onStateChanged((state) => store.set(appStateAtom, state));
void window.tajmator.getState().then((state) => store.set(appStateAtom, state));
window.tajmator.onUpdateStatusChanged((status) => store.set(updateStatusAtom, status));
void window.tajmator.getUpdateStatus().then((status) => store.set(updateStatusAtom, status));

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');
createRoot(root).render(
  <Provider store={store}>
    <App />
  </Provider>,
);
