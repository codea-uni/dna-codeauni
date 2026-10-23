import { projectKind } from '@cronos/core';
import { useMemo, useRef, useState } from 'react';
import * as actions from '../actions';
import { TOOLS } from '../components/Toolbar';
import { WORKSPACE_PANELS, openWorkspacePanel } from '../components/WorkspaceWindows';
import { useProject } from '../hooks/useDocument';
import { useT, type MessageKey } from '../i18n';
import { fitsKind } from '../product/product';
import { saveVersionShortcut } from '../server/ProjectContext';
import { getEngine } from '../session';
import { useAnalysisStore } from '../stores/analysisStore';
import { useUiStore } from '../stores/uiStore';
import {
  QUICK_LAYERS,
  frameSelectionOrAll,
  quickLayerOn,
  setQuickLayer,
  simulateBlast,
  stopSimulation,
} from './quickActions';

interface Command {
  id: string;
  kind: 'action' | 'panel' | 'tool' | 'layer' | 'view';
  label: string;
  hint?: string;
  run: () => void;
}

const KIND_LABEL = {
  action: 'quick.kind.action',
  panel: 'quick.kind.panel',
  tool: 'quick.kind.tool',
  layer: 'quick.kind.layer',
  view: 'quick.kind.view',
} as const satisfies Record<Command['kind'], MessageKey>;

/** Texto comparable: minúsculas y sin tildes («vibracion» encuentra «Vibración»). */
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

/**
 * Buscador de acciones (Ctrl+K): escribir lo que se quiere hacer y ejecutarlo, sin buscar en qué
 * pestaña de la cinta está. Incluye simular, vistas, capas, paneles y herramientas.
 */
export function CommandPalette() {
  const open = useUiStore((s) => s.paletteOpen);
  // Montado solo abierto: cada vez empieza vacío.
  return open ? <PaletteBody /> : null;
}

function PaletteBody() {
  const t = useT();
  const setOpen = useUiStore((s) => s.setPaletteOpen);
  const project = useProject();
  const layers = useAnalysisStore((s) => s.layers);
  const topoOpacity3d = useAnalysisStore((s) => s.topoOpacity3d);
  const viewMode = useUiStore((s) => s.viewMode);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const commands = useMemo<Command[]>(() => {
    const kind = projectKind(project);
    const ui = useUiStore.getState();
    const a = useAnalysisStore.getState();
    const list: Command[] = [
      {
        id: 'simulate',
        kind: 'action',
        label: t('quick.simulate'),
        hint: t('quick.simulateHint'),
        run: simulateBlast,
      },
      { id: 'stop', kind: 'action', label: t('quick.stop'), run: stopSimulation },
      {
        id: 'plan',
        kind: 'view',
        label: t('quick.plan'),
        hint: t('quick.planHint'),
        run: () => {
          ui.setViewMode('plan');
        },
      },
      {
        id: '3d',
        kind: 'view',
        label: t('quick.3d'),
        hint: t('quick.3dHint'),
        run: () => {
          ui.setViewMode('3d');
        },
      },
      {
        id: 'fit',
        kind: 'view',
        label: t('quick.fit'),
        hint: t('quick.fitHint'),
        run: frameSelectionOrAll,
      },
    ];
    const views: [string, MessageKey, number | null, number][] = [
      ['top', 'quick.view.top', null, 89],
      ['n', 'quick.view.north', 0, 20],
      ['s', 'quick.view.south', 180, 20],
      ['e', 'quick.view.east', 90, 20],
      ['w', 'quick.view.west', 270, 20],
      ['iso', 'quick.view.iso', 150, 35],
    ];
    for (const [id, label, yaw, pitch] of views)
      list.push({
        id: `view.${id}`,
        kind: 'view',
        label: t(label),
        run: () => {
          ui.setViewMode('3d');
          const engine = getEngine();
          engine?.viewFrom(yaw ?? engine.cameraYawDeg, pitch);
        },
      });
    list.push(
      {
        id: 'save',
        kind: 'action',
        label: t('quick.saveVersion'),
        hint: 'Ctrl+S',
        run: () => {
          if (!saveVersionShortcut()) void actions.saveProject();
        },
      },
      { id: 'undo', kind: 'action', label: t('toolbar.undo'), hint: 'Ctrl+Z', run: actions.undo },
      { id: 'redo', kind: 'action', label: t('toolbar.redo'), hint: 'Ctrl+Y', run: actions.redo },
      {
        id: 'shortcuts',
        kind: 'action',
        label: t('quick.shortcuts'),
        hint: '?',
        run: () => {
          ui.setShortcutsOpen(true);
        },
      },
    );
    for (const q of QUICK_LAYERS) {
      const on = quickLayerOn(q, a);
      list.push({
        id: `layer.${q.id}`,
        kind: 'layer',
        label: t(on ? 'quick.hideLayer' : 'quick.showLayer', { layer: t(q.label) }),
        run: () => {
          setQuickLayer(q, !on);
        },
      });
    }
    for (const panel of WORKSPACE_PANELS)
      if (fitsKind(panel.id, kind))
        list.push({
          id: `panel.${panel.id}`,
          kind: 'panel',
          label: t(panel.label),
          run: () => {
            openWorkspacePanel(panel.id);
          },
        });
    for (const tool of TOOLS.flat())
      if (fitsKind(tool.name, kind))
        list.push({
          id: `tool.${tool.name}`,
          kind: 'tool',
          label: t(tool.label),
          hint: `${t(tool.hint)} (${tool.key})`,
          run: () => {
            ui.setViewMode('plan');
            ui.setTool(tool.name);
          },
        });
    return list;
    // Las capas y la vista cambian la etiqueta (Mostrar/Ocultar) de los comandos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, project, layers, topoOpacity3d, viewMode]);

  const results = useMemo(() => {
    const words = fold(query).split(/\s+/).filter(Boolean);
    if (words.length === 0) return commands;
    return commands.filter((c) => {
      const text = fold(`${c.label} ${c.hint ?? ''} ${t(KIND_LABEL[c.kind])}`);
      return words.every((w) => text.includes(w));
    });
  }, [commands, query, t]);

  const close = () => {
    setOpen(false);
  };
  const run = (c: Command | undefined) => {
    if (!c) return;
    close();
    c.run();
  };
  const current = Math.min(active, Math.max(0, results.length - 1));

  return (
    <div className="modal-backdrop palette-backdrop" onPointerDown={close}>
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label={t('quick.search')}
        onPointerDown={(e) => {
          e.stopPropagation();
        }}
      >
        <input
          ref={input}
          autoFocus
          type="search"
          value={query}
          placeholder={t('quick.searchPlaceholder')}
          aria-label={t('quick.search')}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((i) => Math.min(results.length - 1, i + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 1));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              run(results[current]);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              close();
            }
          }}
        />
        {results.length === 0 ? (
          <p className="palette-empty">{t('quick.noResults', { q: query })}</p>
        ) : (
          <ul role="listbox">
            {results.map((c, i) => (
              <li key={c.id} role="option" aria-selected={i === current}>
                <button
                  type="button"
                  className={i === current ? 'on' : ''}
                  onPointerEnter={() => {
                    setActive(i);
                  }}
                  onClick={() => {
                    run(c);
                  }}
                >
                  <span className="palette-kind">{t(KIND_LABEL[c.kind])}</span>
                  <span className="palette-label">{c.label}</span>
                  {c.hint && <small>{c.hint}</small>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
