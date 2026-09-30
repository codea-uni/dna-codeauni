import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AuthGate } from './auth/AuthGate';
import { serverMode } from './server/api';
import { getCompute, getEngine, session } from './session';
import './styles.css';

if (import.meta.env.DEV) {
  // Gancho de depuración y medición (solo en desarrollo).
  Object.assign(window, { __cronos: { session, getEngine, getCompute } });
}

const root = document.getElementById('root');
if (!root) throw new Error('No se encontró #root');

createRoot(root).render(
  <StrictMode>
    {serverMode ? (
      <AuthGate>
        <App />
      </AuthGate>
    ) : (
      <App />
    )}
  </StrictMode>,
);
