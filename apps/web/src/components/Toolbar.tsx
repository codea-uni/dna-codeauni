import type { ToolName } from '@cronos/engine';
import {
  Box,
  Cable,
  CircleDot,
  CirclePlus,
  DraftingCompass,
  FileDown,
  FileText,
  FilePlus,
  Clapperboard,
  Image as ImageIcon,
  ClipboardCopy,
  History as HistoryIcon,
  FileUp,
  FolderOpen,
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
  Presentation,
  Pentagon,
  Redo2,
  Ruler,
  Save,
  Settings,
  Shapes,
  Sheet,
  Undo2,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { EXAMPLES } from '@cronos/core';
import { useRef } from 'react';
import * as actions from '../actions';
import { startDemo, stopDemo } from '../demo/tour';
import { useHistory } from '../hooks/useDocument';
import { useUiStore } from '../stores/uiStore';
import { IconButton } from './IconButton';
import { MenuButton } from './MenuButton';
import { UserMenu } from '../auth/UserMenu';
import { serverMode } from '../server/api';
import { t as translate, useT, type MessageKey } from '../i18n';
import { exampleText } from '../i18n/coreText';

export interface ToolDef {
  name: ToolName;
  /** Clave del texto (se traduce al mostrar). */
  label: MessageKey;
  key: string;
  icon: LucideIcon;
  hint: MessageKey;
}

/** Herramientas del plano, agrupadas por flujo: selección · diseño · iniciación · sitio · vista. */
export const TOOLS: ToolDef[][] = [
  [
    {
      name: 'select',
      label: 'tools.select',
      key: 'V',
      icon: MousePointer2,
      hint: 'tools.select.hint',
    },
    {
      name: 'lasso',
      label: 'tools.lasso',
      key: 'L',
      icon: Lasso,
      hint: 'tools.lasso.hint',
    },
  ],
  [
    {
      name: 'add',
      label: 'tools.add',
      key: 'A',
      icon: CirclePlus,
      hint: 'tools.add.hint',
    },
    {
      name: 'boundary',
      label: 'tools.boundary',
      key: 'B',
      icon: Pentagon,
      hint: 'tools.boundary.hint',
    },
    {
      name: 'freeFace',
      label: 'tools.freeFace',
      key: 'C',
      icon: Mountain,
      hint: 'tools.freeFace.hint',
    },
  ],
  [
    {
      name: 'tie',
      label: 'tools.tie',
      key: 'T',
      icon: Cable,
      hint: 'tools.tie.hint',
    },
    {
      name: 'initiate',
      label: 'tools.initiate',
      key: 'I',
      icon: Zap,
      hint: 'tools.initiate.hint',
    },
  ],
  [
    {
      name: 'monitor',
      label: 'tools.monitor',
      key: 'M',
      icon: MapPin,
      hint: 'tools.monitor.hint',
    },
  ],
  [
    {
      name: 'measure',
      label: 'tools.measure',
      key: 'R',
      icon: Ruler,
      hint: 'tools.measure.hint',
    },
    {
      name: 'pan',
      label: 'tools.pan',
      key: 'H',
      icon: Hand,
      hint: 'tools.pan.hint',
    },
  ],
];

const ALL_TOOLS = TOOLS.flat();

export const TOOL_KEYS: Record<string, ToolName> = Object.fromEntries(
  ALL_TOOLS.map((t) => [t.key.toLowerCase(), t.name]),
);

export function toolHint(tool: ToolName): string {
  const t = ALL_TOOLS.find((x) => x.name === tool);
  return t ? `${translate(t.label)}: ${translate(t.hint)}` : '';
}

export function Toolbar() {
  const tr = useT();
  const demoOn = useUiStore((s) => s.demoStep !== null);
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
  const geoJsonInput = useRef<HTMLInputElement>(null);
  const boundariesInput = useRef<HTMLInputElement>(null);

  return (
    <header className="toolbar">
      <strong className="brand">Cronos</strong>
      <div className="toolbar-group">
        <IconButton icon={FilePlus} label={tr('toolbar.newProject')} onClick={actions.newProject} />
        <IconButton
          icon={FolderOpen}
          label={tr('toolbar.openProject')}
          onClick={() => fileInput.current?.click()}
        />
        <IconButton
          icon={Save}
          label={tr('toolbar.saveProject')}
          shortcut="Ctrl+S"
          onClick={() => void actions.saveProject()}
        />
        <IconButton
          icon={Clapperboard}
          label={tr('toolbar.demo')}
          active={demoOn}
          onClick={() => {
            if (demoOn) stopDemo();
            else startDemo();
          }}
        />
        <IconButton
          icon={HistoryIcon}
          label={tr('toolbar.versions')}
          onClick={() => {
            useUiStore.getState().setVersionsOpen(true);
          }}
        />
        <IconButton
          icon={Settings}
          label={tr('toolbar.settings')}
          onClick={() => {
            useUiStore.getState().setSettingsOpen(true);
          }}
        />
        <MenuButton
          icon={FileUp}
          label={tr('toolbar.import')}
          items={[
            {
              icon: Sheet,
              label: tr('toolbar.importCsv'),
              onSelect: () => {
                if (actions.requireCrs()) csvInput.current?.click();
              },
            },
            {
              icon: DraftingCompass,
              label: tr('toolbar.importDxf'),
              onSelect: () => {
                if (actions.requireCrs()) dxfInput.current?.click();
              },
            },
            {
              icon: MapIcon,
              label: tr('toolbar.importGeoJson'),
              onSelect: () => {
                if (actions.requireCrs()) geoJsonInput.current?.click();
              },
            },
            {
              icon: Pentagon,
              label: tr('toolbar.importBoundariesCsv'),
              onSelect: () => {
                if (actions.requireCrs()) boundariesInput.current?.click();
              },
            },
          ]}
        />
        <MenuButton
          icon={FileDown}
          label={tr('toolbar.export')}
          items={[
            {
              icon: Sheet,
              label: tr('toolbar.exportCsv'),
              onSelect: () => void actions.exportCsv(),
            },
            {
              icon: DraftingCompass,
              label: tr('toolbar.exportDxf'),
              onSelect: () => void actions.exportDxf(),
            },
            {
              icon: MapIcon,
              label: tr('toolbar.exportGeoJson'),
              onSelect: () => void actions.exportGeoJson(),
            },
            { icon: ImageIcon, label: tr('toolbar.exportPng'), onSelect: actions.exportPlanPng },
            {
              icon: ClipboardCopy,
              label: tr('toolbar.copyTsv'),
              onSelect: () => void actions.copyHolesTsv(),
            },
            {
              icon: FileText,
              label: tr('toolbar.exportPdf'),
              onSelect: () => void actions.exportReport(),
            },
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
          ref={geoJsonInput}
          type="file"
          accept=".geojson,.json,application/geo+json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void actions.openGeoJson(file);
            e.target.value = '';
          }}
        />
        <input
          ref={boundariesInput}
          type="file"
          accept=".csv,.txt,.tsv,text/csv"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void actions.openBoundariesCsv(file);
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
          label={
            history.undoLabel
              ? tr('toolbar.undoNamed', { label: history.undoLabel })
              : tr('toolbar.undo')
          }
          shortcut="Ctrl+Z"
          disabled={!history.canUndo}
          onClick={actions.undo}
        />
        <IconButton
          icon={Redo2}
          label={
            history.redoLabel
              ? tr('toolbar.redoNamed', { label: history.redoLabel })
              : tr('toolbar.redo')
          }
          shortcut="Ctrl+Shift+Z"
          disabled={!history.canRedo}
          onClick={actions.redo}
        />
      </div>
      <div className="toolbar-group" role="radiogroup" aria-label={tr('tools.viewGroup')}>
        <IconButton
          icon={MapIcon}
          label={tr('tools.planView')}
          shortcut="3"
          active={viewMode === 'plan'}
          onClick={() => {
            setViewMode('plan');
          }}
        />
        <IconButton
          icon={Box}
          label={tr('tools.view3d')}
          shortcut="3"
          active={viewMode === '3d'}
          onClick={() => {
            setViewMode('3d');
          }}
        />
      </div>
      {TOOLS.map((group, g) => (
        <div key={g} className="toolbar-group" role="radiogroup" aria-label={tr('tools.group')}>
          {group.map((t) => (
            <IconButton
              key={t.name}
              icon={t.icon}
              label={tr(t.label)}
              shortcut={t.key}
              hint={tr(t.hint)}
              active={tool === t.name}
              onClick={() => {
                setViewMode('plan');
                setTool(t.name);
              }}
            />
          ))}
        </div>
      ))}
      <div className="toolbar-group snap" title={tr('tools.snapTitle')}>
        <Magnet size={16} aria-hidden className="muted" />
        <IconButton
          icon={CircleDot}
          label={tr('tools.snapHoles')}
          active={snap.holes}
          onClick={() => {
            setSnap({ holes: !snap.holes });
          }}
        />
        <IconButton
          icon={Shapes}
          label={tr('tools.snapPattern')}
          active={snap.pattern}
          onClick={() => {
            setSnap({ pattern: !snap.pattern });
          }}
        />
        <IconButton
          icon={Grid3x3}
          label={tr('tools.snapGrid')}
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
            title={tr('tools.gridSize')}
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
          label={tr('tools.zoomFit')}
          shortcut="F"
          onClick={() => {
            actions.zoomToFit();
          }}
        />
        <MenuButton
          icon={Presentation}
          label={tr('tools.examples')}
          items={EXAMPLES.map((sc) => {
            const text = exampleText(sc.id, { name: sc.name, description: sc.description });
            return {
              icon: Presentation,
              label: text.name,
              hint: text.description,
              onSelect: () => void actions.loadExample(sc.id, text.name),
            };
          })}
        />
        <IconButton
          icon={Keyboard}
          label={tr('tools.shortcuts')}
          shortcut="?"
          onClick={() => {
            setShortcutsOpen(true);
          }}
        />
      </div>
      {serverMode && (
        <div className="toolbar-group toolbar-account">
          <UserMenu />
        </div>
      )}
    </header>
  );
}
