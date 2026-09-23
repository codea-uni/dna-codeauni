import { useEffect } from 'react';
import { StatusBar } from './components/StatusBar';
import { Toolbar } from './components/Toolbar';
import { useShortcuts } from './hooks/useShortcuts';
import { BlastPanel } from './panels/BlastPanel';
import { PatternPanel } from './panels/PatternPanel';
import { PropertiesPanel } from './panels/PropertiesPanel';
import { getCompute } from './session';
import { Viewport } from './viewport/Viewport';

export function App() {
  useShortcuts();
  useEffect(() => {
    // Precalienta el worker (carga de módulos) para que la primera operación real no pague el arranque.
    void getCompute().api.ping('warmup');
  }, []);
  return (
    <div className="app">
      <Toolbar />
      <aside className="sidebar left">
        <BlastPanel />
        <PatternPanel />
      </aside>
      <main className="viewport-host">
        <Viewport />
      </main>
      <aside className="sidebar right">
        <PropertiesPanel />
      </aside>
      <StatusBar />
    </div>
  );
}
