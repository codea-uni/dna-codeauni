import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ServerApp } from './pages/ServerApp';
import { serverMode } from './server/api';
import { getCompute, getEngine, session } from './session';
// Barlow autohospedada (identidad, ARCHITECTURE L127): texto 400/500/600 y titulares semicondensados.
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow-semi-condensed/500.css';
import '@fontsource/barlow-semi-condensed/600.css';
import './styles.css';
import './server.css';
import './product/product.css';
import './ux.css';
import { topographyElevation } from './topography/session';

if (import.meta.env.DEV) {
  // Gancho de depuración y medición (solo en desarrollo).
  Object.assign(window, { __cronos: { session, getEngine, getCompute, topographyElevation } });
}

const root = document.getElementById('root');
if (!root) throw new Error('No se encontró #root');

createRoot(root).render(
  <StrictMode>{serverMode ? <ServerApp /> : <App restoreLocalDraft />}</StrictMode>,
);
