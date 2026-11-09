import { createStore, Provider } from 'jotai';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { appStateAtom } from './atoms.ts';

const store = createStore();
window.tajmator.onStateChanged((state) => store.set(appStateAtom, state));
void window.tajmator.getState().then((state) => store.set(appStateAtom, state));

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');
createRoot(root).render(
  <Provider store={store}>
    <App />
  </Provider>,
);
