import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'jotai';
import { App } from './App.jsx';
import './styles.css';

/**
 * Mount the React application into the document root.
 * @returns {void}
 */
const mount = () => {
  const root = createRoot(document.getElementById('root'));
  root.render(
    <StrictMode>
      <Provider>
        <App />
      </Provider>
    </StrictMode>,
  );
};

mount();
