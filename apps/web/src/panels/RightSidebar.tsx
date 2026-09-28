import { ChartColumn, MousePointerClick, SlidersHorizontal } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useT } from '../i18n';
import { useSelectionIds } from '../hooks/useDocument';
import { useUiStore } from '../stores/uiStore';
import { MapPanel } from './MapPanel';
import { PropertiesPanel } from './PropertiesPanel';
import { ResultsPanel } from './ResultsPanel';
import { ViewPanel } from './ViewPanel';

const TABS = [
  {
    id: 'selection',
    label: 'sidebar.selection',
    icon: MousePointerClick,
    title: 'sidebar.selectionTitle',
  },
  {
    id: 'view',
    label: 'sidebar.view',
    icon: SlidersHorizontal,
    title: 'sidebar.viewTitle',
  },
  {
    id: 'results',
    label: 'sidebar.results',
    icon: ChartColumn,
    title: 'sidebar.resultsTitle',
  },
] as const;

/**
 * Panel derecho: la selección (lo específico) separada de los ajustes generales y los resultados.
 * Al seleccionar taladros se muestra la pestaña Selección.
 */
export function RightSidebar() {
  const t = useT();
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
        {TABS.map((it) => (
          <button
            key={it.id}
            role="tab"
            aria-selected={tab === it.id}
            className={tab === it.id ? 'active' : ''}
            title={t(it.title)}
            onClick={() => {
              setTab(it.id);
            }}
          >
            <it.icon size={16} strokeWidth={1.8} aria-hidden />
            <span>
              {t(it.label)}
              {it.id === 'selection' && selection.size > 0 && (
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
