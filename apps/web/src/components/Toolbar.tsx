import type { ToolName } from '@blastlab/engine';
import { useRef } from 'react';
import * as actions from '../actions';
import { useHistory } from '../hooks/useDocument';
import { useUiStore } from '../stores/uiStore';

const TOOLS: { name: ToolName; label: string; key: string; hint: string }[] = [
  {
    name: 'select',
    label: 'Seleccionar',
    key: 'V',
    hint: 'Clic: seleccionar · Arrastre: caja / mover · Shift agrega · Ctrl quita',
  },
  {
    name: 'lasso',
    label: 'Lazo',
    key: 'L',
    hint: 'Arrastre: selección por lazo · Shift agrega · Ctrl quita',
  },
  { name: 'add', label: 'Agregar', key: 'A', hint: 'Clic: agregar taladro con la plantilla' },
  {
    name: 'boundary',
    label: 'Perímetro',
    key: 'B',
    hint: 'Clic: vértice · Doble clic / Enter: cerrar · Retroceso: deshacer vértice',
  },
  {
    name: 'freeFace',
    label: 'Cara libre',
    key: 'C',
    hint: 'Clic junto a una arista del perímetro: marca/desmarca cara libre (talud) · Clic dentro: activa el perímetro',
  },
  {
    name: 'tie',
    label: 'Amarrar',
    key: 'T',
    hint: 'Clic en taladros para encadenar conexiones · Clic en vacío/Esc termina · Ctrl+clic borra una conexión',
  },
  {
    name: 'initiate',
    label: 'Inicio',
    key: 'I',
    hint: 'Clic en un taladro: agrega/quita punto de inicio',
  },
  { name: 'pan', label: 'Desplazar', key: 'H', hint: 'Arrastre: desplazar la vista' },
];

export const TOOL_KEYS: Record<string, ToolName> = Object.fromEntries(
  TOOLS.map((t) => [t.key.toLowerCase(), t.name]),
);

export function toolHint(tool: ToolName): string {
  return TOOLS.find((t) => t.name === tool)?.hint ?? '';
}

export function Toolbar() {
  const tool = useUiStore((s) => s.tool);
  const setTool = useUiStore((s) => s.setTool);
  const snap = useUiStore((s) => s.snap);
  const setSnap = useUiStore((s) => s.setSnap);
  const history = useHistory();
  const fileInput = useRef<HTMLInputElement>(null);
  const csvInput = useRef<HTMLInputElement>(null);

  return (
    <header className="toolbar">
      <div className="toolbar-group">
        <strong className="brand">BlastLab</strong>
        <button onClick={actions.newProject}>Nuevo</button>
        <button onClick={() => fileInput.current?.click()}>Abrir…</button>
        <button onClick={() => void actions.saveProject()}>Guardar</button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void actions.openProject(file);
            e.target.value = '';
          }}
        />
        <button onClick={() => csvInput.current?.click()} title="Importar taladros desde CSV">
          Importar CSV…
        </button>
        <button onClick={() => void actions.exportCsv()} title="Exportar taladros a CSV">
          Exportar CSV
        </button>
        <input
          ref={csvInput}
          type="file"
          accept=".csv,.txt,.tsv,text/csv"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void actions.openCsv(file);
            e.target.value = '';
          }}
        />
      </div>
      <div className="toolbar-group">
        <button
          onClick={actions.undo}
          disabled={!history.canUndo}
          title={
            history.undoLabel ? `Deshacer: ${history.undoLabel} (Ctrl+Z)` : 'Deshacer (Ctrl+Z)'
          }
        >
          ↶ Deshacer
        </button>
        <button
          onClick={actions.redo}
          disabled={!history.canRedo}
          title={
            history.redoLabel
              ? `Rehacer: ${history.redoLabel} (Ctrl+Shift+Z)`
              : 'Rehacer (Ctrl+Shift+Z)'
          }
        >
          ↷ Rehacer
        </button>
      </div>
      <div className="toolbar-group" role="radiogroup" aria-label="Herramienta">
        {TOOLS.map((t) => (
          <button
            key={t.name}
            role="radio"
            aria-checked={tool === t.name}
            className={tool === t.name ? 'active' : ''}
            title={`${t.label} (${t.key}) — ${t.hint}`}
            onClick={() => {
              setTool(t.name);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="toolbar-group snap">
        <span className="muted">Snap:</span>
        <label>
          <input
            type="checkbox"
            checked={snap.holes}
            onChange={(e) => {
              setSnap({ holes: e.target.checked });
            }}
          />{' '}
          taladros
        </label>
        <label>
          <input
            type="checkbox"
            checked={snap.pattern}
            onChange={(e) => {
              setSnap({ pattern: e.target.checked });
            }}
          />{' '}
          malla
        </label>
        <label>
          <input
            type="checkbox"
            checked={snap.grid}
            onChange={(e) => {
              setSnap({ grid: e.target.checked });
            }}
          />{' '}
          grilla
        </label>
        <input
          className="grid-size"
          type="number"
          min={0.01}
          step={0.5}
          value={snap.gridSize}
          disabled={!snap.grid}
          title="Paso de la grilla de snapping [m]"
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v > 0) setSnap({ gridSize: v });
          }}
        />
        <span className="muted">m</span>
      </div>
      <div className="toolbar-group">
        <button
          onClick={() => {
            actions.zoomToFit();
          }}
          title="Encuadrar todo (F)"
        >
          Encuadrar
        </button>
        <button
          onClick={() => void actions.generatePerfFixture()}
          title="Genera una malla de 5.000 taladros para medir rendimiento"
        >
          Prueba 5.000
        </button>
      </div>
    </header>
  );
}
