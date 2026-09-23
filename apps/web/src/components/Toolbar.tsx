import type { ToolName } from '@blastlab/engine';
import {
  Box,
  Cable,
  CircleDot,
  CirclePlus,
  DraftingCompass,
  FileDown,
  FileText,
  FilePlus,
  FileUp,
  FolderOpen,
  Gauge,
  Grid3x3,
  Hand,
  Keyboard,
  Lasso,
  Magnet,
  Map as MapIcon,
  MapPin,
  Maximize2,
  Mountain,
  MousePointer2,
  Pentagon,
  Redo2,
  Save,
  Shapes,
  Sheet,
  Undo2,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useRef } from 'react';
import * as actions from '../actions';
import { useHistory } from '../hooks/useDocument';
import { useUiStore } from '../stores/uiStore';
import { IconButton } from './IconButton';
import { MenuButton } from './MenuButton';

export interface ToolDef {
  name: ToolName;
  label: string;
  key: string;
  icon: LucideIcon;
  hint: string;
}

/** Herramientas del plano, agrupadas por flujo: selección · diseño · iniciación · sitio · vista. */
export const TOOLS: ToolDef[][] = [
  [
    {
      name: 'select',
      label: 'Seleccionar / mover',
      key: 'V',
      icon: MousePointer2,
      hint: 'Arrastre en vacío: caja · Shift agrega · Ctrl quita',
    },
    {
      name: 'lasso',
      label: 'Selección por lazo',
      key: 'L',
      icon: Lasso,
      hint: 'Shift agrega · Ctrl quita',
    },
  ],
  [
    {
      name: 'add',
      label: 'Agregar taladro',
      key: 'A',
      icon: CirclePlus,
      hint: 'Clic: taladro con la plantilla',
    },
    {
      name: 'boundary',
      label: 'Dibujar perímetro',
      key: 'B',
      icon: Pentagon,
      hint: 'Clic: vértice · Doble clic o Enter: cerrar',
    },
    {
      name: 'freeFace',
      label: 'Cara libre (talud)',
      key: 'C',
      icon: Mountain,
      hint: 'Clic junto a una arista del perímetro',
    },
  ],
  [
    {
      name: 'tie',
      label: 'Amarrar taladros',
      key: 'T',
      icon: Cable,
      hint: 'Clic en taladros encadena · Ctrl+clic borra una conexión',
    },
    {
      name: 'initiate',
      label: 'Punto de inicio',
      key: 'I',
      icon: Zap,
      hint: 'Clic en un taladro agrega o quita',
    },
  ],
  [
    {
      name: 'monitor',
      label: 'Punto de control',
      key: 'M',
      icon: MapPin,
      hint: 'Clic agrega · Ctrl+clic borra',
    },
  ],
  [
    {
      name: 'pan',
      label: 'Desplazar vista',
      key: 'H',
      icon: Hand,
      hint: 'También: Espacio + arrastre o botón medio',
    },
  ],
];

const ALL_TOOLS = TOOLS.flat();

export const TOOL_KEYS: Record<string, ToolName> = Object.fromEntries(
  ALL_TOOLS.map((t) => [t.key.toLowerCase(), t.name]),
);

export function toolHint(tool: ToolName): string {
  const t = ALL_TOOLS.find((x) => x.name === tool);
  return t ? `${t.label}: ${t.hint}` : '';
}

export function Toolbar() {
  const tool = useUiStore((s) => s.tool);
  const setTool = useUiStore((s) => s.setTool);
  const snap = useUiStore((s) => s.snap);
  const setSnap = useUiStore((s) => s.setSnap);
  const setShortcutsOpen = useUiStore((s) => s.setShortcutsOpen);
  const viewMode = useUiStore((s) => s.viewMode);
  const setViewMode = useUiStore((s) => s.setViewMode);
  const history = useHistory();
  const fileInput = useRef<HTMLInputElement>(null);
  const csvInput = useRef<HTMLInputElement>(null);
  const dxfInput = useRef<HTMLInputElement>(null);

  return (
    <header className="toolbar">
      <strong className="brand">BlastLab</strong>
      <div className="toolbar-group">
        <IconButton icon={FilePlus} label="Proyecto nuevo" onClick={actions.newProject} />
        <IconButton
          icon={FolderOpen}
          label="Abrir proyecto"
          onClick={() => fileInput.current?.click()}
        />
        <IconButton
          icon={Save}
          label="Guardar proyecto"
          shortcut="Ctrl+S"
          onClick={() => void actions.saveProject()}
        />
        <MenuButton
          icon={FileUp}
          label="Importar"
          items={[
            {
              icon: Sheet,
              label: 'Taladros desde CSV…',
              onSelect: () => csvInput.current?.click(),
            },
            {
              icon: DraftingCompass,
              label: 'Taladros, perímetros y topografía desde DXF…',
              onSelect: () => dxfInput.current?.click(),
            },
          ]}
        />
        <MenuButton
          icon={FileDown}
          label="Exportar"
          items={[
            { icon: Sheet, label: 'Taladros a CSV', onSelect: () => void actions.exportCsv() },
            {
              icon: DraftingCompass,
              label: 'Plano a DXF',
              onSelect: () => void actions.exportDxf(),
            },
            { icon: FileText, label: 'Informe PDF', onSelect: () => void actions.exportReport() },
          ]}
        />
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
        <input
          ref={dxfInput}
          type="file"
          accept=".dxf"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void actions.openDxf(file);
            e.target.value = '';
          }}
        />
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
        <IconButton
          icon={Undo2}
          label={history.undoLabel ? `Deshacer: ${history.undoLabel}` : 'Deshacer'}
          shortcut="Ctrl+Z"
          disabled={!history.canUndo}
          onClick={actions.undo}
        />
        <IconButton
          icon={Redo2}
          label={history.redoLabel ? `Rehacer: ${history.redoLabel}` : 'Rehacer'}
          shortcut="Ctrl+Shift+Z"
          disabled={!history.canRedo}
          onClick={actions.redo}
        />
      </div>
      <div className="toolbar-group" role="radiogroup" aria-label="Vista">
        <IconButton
          icon={MapIcon}
          label="Vista en planta (edición)"
          shortcut="3"
          active={viewMode === 'plan'}
          onClick={() => {
            setViewMode('plan');
          }}
        />
        <IconButton
          icon={Box}
          label="Vista 3D del banco"
          shortcut="3"
          active={viewMode === '3d'}
          onClick={() => {
            setViewMode('3d');
          }}
        />
      </div>
      {TOOLS.map((group, g) => (
        <div key={g} className="toolbar-group" role="radiogroup" aria-label="Herramientas">
          {group.map((t) => (
            <IconButton
              key={t.name}
              icon={t.icon}
              label={t.label}
              shortcut={t.key}
              hint={t.hint}
              active={tool === t.name}
              onClick={() => {
                setViewMode('plan');
                setTool(t.name);
              }}
            />
          ))}
        </div>
      ))}
      <div
        className="toolbar-group snap"
        title="Snapping: a qué se ajusta el cursor al dibujar y mover"
      >
        <Magnet size={16} aria-hidden className="muted" />
        <IconButton
          icon={CircleDot}
          label="Ajustar a taladros"
          active={snap.holes}
          onClick={() => {
            setSnap({ holes: !snap.holes });
          }}
        />
        <IconButton
          icon={Shapes}
          label="Ajustar a nodos de malla"
          active={snap.pattern}
          onClick={() => {
            setSnap({ pattern: !snap.pattern });
          }}
        />
        <IconButton
          icon={Grid3x3}
          label="Ajustar a grilla"
          active={snap.grid}
          onClick={() => {
            setSnap({ grid: !snap.grid });
          }}
        />
        {snap.grid && (
          <input
            className="grid-size"
            type="number"
            min={0.01}
            step={0.5}
            value={snap.gridSize}
            title="Paso de la grilla [m]"
            onChange={(e) => {
              const v = Number(e.target.value);
              if (v > 0) setSnap({ gridSize: v });
            }}
          />
        )}
      </div>
      <div className="toolbar-group">
        <IconButton
          icon={Maximize2}
          label="Encuadrar todo"
          shortcut="F"
          onClick={() => {
            actions.zoomToFit();
          }}
        />
        <IconButton
          icon={Gauge}
          label="Prueba de rendimiento (5.000 taladros)"
          onClick={() => void actions.generatePerfFixture()}
        />
        <IconButton
          icon={Keyboard}
          label="Atajos de teclado"
          shortcut="?"
          onClick={() => {
            setShortcutsOpen(true);
          }}
        />
      </div>
    </header>
  );
}
