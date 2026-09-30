import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ServerApp } from './pages/ServerApp';
import { serverMode } from './server/api';
import { getCompute, getEngine, session } from './session';
import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow/latin-700.css';
import '@fontsource/barlow-semi-condensed/latin-500.css';
import '@fontsource/barlow-semi-condensed/latin-600.css';
import '@fontsource/barlow-semi-condensed/latin-700.css';
import './styles.css';
import './server.css';

if (import.meta.env.DEV) {
  // Gancho de depuración y medición (solo en desarrollo).
  Object.assign(window, { __cronos: { session, getEngine, getCompute } });
}

const root = document.getElementById('root');
if (!root) throw new Error('No se encontró #root');

createRoot(root).render(
  <StrictMode>{serverMode ? <ServerApp /> : <App restoreLocalDraft />}</StrictMode>,
);
