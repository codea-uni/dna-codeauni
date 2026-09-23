import { ChartColumn, MousePointerClick, SlidersHorizontal } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useSelectionIds } from '../hooks/useDocument';
import { useUiStore } from '../stores/uiStore';
import { MapPanel } from './MapPanel';
import { PropertiesPanel } from './PropertiesPanel';
import { ResultsPanel } from './ResultsPanel';
import { ViewPanel } from './ViewPanel';

const TABS = [
  {
    id: 'selection',
    label: 'Selección',
    icon: MousePointerClick,
    title: 'Propiedades de los taladros seleccionados',
  },
  {
    id: 'view',
    label: 'Vista',
    icon: SlidersHorizontal,
    title: 'Ajustes generales: colores, etiquetas, capas, secuencia y mapa',
  },
  { id: 'results', label: 'Resultados', icon: ChartColumn, title: 'Carguío, cubicación y tiempos' },
] as const;

/**
 * Panel derecho: la selección (lo específico) separada de los ajustes generales y los resultados.
 * Al seleccionar taladros se muestra la pestaña Selección.
 */
export function RightSidebar() {
  const tab = useUiStore((s) => s.rightTab);
  const setTab = useUiStore((s) => s.setRightTab);
  const selection = useSelectionIds();
  const prevSize = useRef(selection.size);
  useEffect(() => {
    if (prevSize.current === 0 && selection.size > 0) setTab('selection');
    prevSize.current = selection.size;
  }, [selection, setTab]);

  return (
    <aside className="sidebar right">
      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? 'active' : ''}
            title={t.title}
            onClick={() => {
              setTab(t.id);
            }}
          >
            <t.icon size={16} strokeWidth={1.8} aria-hidden />
            <span>
              {t.label}
              {t.id === 'selection' && selection.size > 0 && (
                <em className="badge">{selection.size}</em>
              )}
            </span>
          </button>
        ))}
      </nav>
      <ErrorBoundary>
        {tab === 'selection' && <PropertiesPanel />}
        {tab === 'view' && (
          <>
            <ViewPanel />
            <MapPanel />
          </>
        )}
        {tab === 'results' && <ResultsPanel />}
      </ErrorBoundary>
    </aside>
  );
}
