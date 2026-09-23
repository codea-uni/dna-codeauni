import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { getCompute, getEngine, session } from './session';
import './styles.css';

if (import.meta.env.DEV) {
  // Gancho de depuración y medición (solo en desarrollo).
  Object.assign(window, { __blastlab: { session, getEngine, getCompute } });
}

const root = document.getElementById('root');
if (!root) throw new Error('No se encontró #root');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
