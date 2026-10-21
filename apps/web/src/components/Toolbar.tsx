import type { ToolName } from '@cronos/engine';
import {
  Activity,
  Bot,
  BookOpen,
  Box,
  Boxes,
  Cable,
  CircleDot,
  CirclePlus,
  DraftingCompass,
  Drill,
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
  Layers,
  Timer,
  ChartColumn,
  Library,
  Home,
  Eye,
  Hand,
  Keyboard,
  Lasso,
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
  Spline,
  Undo2,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { EXAMPLES } from '@cronos/core';
import { useRef } from 'react';
import * as actions from '../actions';
import { startDemo, stopDemo } from '../demo/playback';
import { useHistory } from '../hooks/useDocument';
import { useUiStore } from '../stores/uiStore';
import { IconButton } from './IconButton';
import { MenuButton } from './MenuButton';
import { UserMenu } from '../auth/UserMenu';
import { BackToMine, ProjectActions, ProjectContext } from '../server/ProjectContext';
import { serverMode } from '../server/api';
import { t as translate, useT, type MessageKey } from '../i18n';
import { exampleText } from '../i18n/coreText';
import { tabAvailable, useWorkflow } from '../hooks/useWorkflow';
import { WORKSPACE_PANELS, openWorkspacePanel } from './WorkspaceWindows';
import { XrButtons } from '../xr/XrButtons';
import { OtherToolProjects, ProductMark } from '../product/CrossView';
import { fitsKind, kindOrder, useEditorTool, useProjectKind } from '../product/product';
import { importModel3dFiles, MODEL3D_ACCEPT } from '../topography/models3d';
import { openWorkingsImport } from '../panels/WorkingsImport';

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
  const ribbonTab = useUiStore((s) => s.ribbonTab);
  const setRibbonTab = useUiStore((s) => s.setRibbonTab);
  const history = useHistory();
  const workflow = useWorkflow();
  const floating = useUiStore((s) => s.floating);
  const fileInput = useRef<HTMLInputElement>(null);
  const geoJsonInput = useRef<HTMLInputElement>(null);
  const boundariesInput = useRef<HTMLInputElement>(null);
  const topographyInput = useRef<HTMLInputElement>(null);
  const model3dInput = useRef<HTMLInputElement>(null);
  const holesInput = useRef<HTMLInputElement>(null);
  // Herramienta en uso (marca) y tipo del proyecto (qué paneles y herramientas tienen sentido).
  const productTool = useEditorTool();
  const kind = useProjectKind();
  const panels = WORKSPACE_PANELS.filter(
    (panel) => panel.section === ribbonTab && fitsKind(panel.id, kind),
  ).sort((a, b) => kindOrder(a.id, kind) - kindOrder(b.id, kind));

  // Un solo menú Importar con lo que se puede traer, cada opción dice qué es y qué archivos lee.
  // Bajo tierra las labores van primero. Sin sistema de coordenadas se pide y sigue sola.
  const workingsItem = {
    icon: Spline,
    label: tr('import.menu.workings'),
    hint: tr('import.menu.workingsHint'),
    onSelect: () => {
      actions.withCrs(() => {
        openWorkspacePanel('topography');
        openWorkingsImport();
      });
    },
  };
  const vibrationAvailable = tabAvailable('charged', workflow);
  const importItems = [
    ...(kind === 'underground' ? [workingsItem] : []),
    {
      icon: Mountain,
      label: tr('import.menu.topography'),
      hint: tr('import.menu.topographyHint'),
      onSelect: () => {
        actions.withCrs(() => topographyInput.current?.click());
      },
    },
    ...(kind === 'underground' ? [] : [workingsItem]),
    {
      icon: Boxes,
      label: tr('import.menu.model3d'),
      hint: tr('import.menu.model3dHint'),
      onSelect: () => {
        actions.withCrs(() => model3dInput.current?.click());
      },
    },
    {
      icon: DraftingCompass,
      label: tr('import.menu.holes'),
      hint: tr('import.menu.holesHint'),
      onSelect: () => {
        actions.withCrs(() => holesInput.current?.click());
      },
    },
    // La desviación medida se une a los taladros del diseño: se importa en su ventana.
    ...(tabAvailable('holes', workflow)
      ? [
          {
            icon: Drill,
            label: tr('import.menu.drillSurvey'),
            hint: tr('import.menu.drillSurveyHint'),
            onSelect: () => {
              openWorkspacePanel('drillSurvey');
            },
          },
        ]
      : []),
    {
      icon: Pentagon,
      label: tr('import.menu.boundariesCsv'),
      onSelect: () => {
        actions.withCrs(() => boundariesInput.current?.click());
      },
    },
    {
      icon: MapIcon,
      label: tr('import.menu.geoJson'),
      onSelect: () => {
        actions.withCrs(() => geoJsonInput.current?.click());
      },
    },
    // Los registros de sismógrafos son de la mina y se cargan en la ventana Vibración.
    ...(vibrationAvailable
      ? [
          {
            icon: Activity,
            label: tr('import.menu.seismographs'),
            onSelect: () => {
              openWorkspacePanel('vibration');
            },
          },
        ]
      : []),
  ];

  return (
    <header className="toolbar">
      <strong className="brand" translate="no">
        <img className="brand-logo" src="/brand/codeauni-blanco.png" alt="CODEa UNI" />
        <ProductMark tool={productTool} />
      </strong>
      {serverMode && <ProjectContext />}
      <nav
        className="ribbon-tabs"
        role="tablist"
        aria-label={tr('toolbar.sections')}
        onKeyDown={(event) => {
          const tabs = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
          );
          const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
          let next: number | undefined;
          if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
          if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
          if (event.key === 'Home') next = 0;
          if (event.key === 'End') next = tabs.length - 1;
          if (next !== undefined) {
            event.preventDefault();
            tabs[next]?.focus();
            tabs[next]?.click();
          }
        }}
      >
        {(
          [
            ['home', Home, 'toolbar.home'],
            ['tools', Wrench, 'app.tab.design'],
            ['charge', Layers, 'app.tab.charge'],
            ['timing', Timer, 'app.tab.timing'],
            ['analysis', ChartColumn, 'toolbar.analysis'],
            ['view', Eye, 'toolbar.view'],
            ['library', Library, 'app.tab.library'],
            ['ai', Bot, 'toolbar.ai'],
          ] as const
        ).map(([id, , label]) => (
          <button
            key={id}
            role="tab"
            id={`ribbon-tab-${id}`}
            aria-controls="ribbon-panel"
            tabIndex={ribbonTab === id ? 0 : -1}
            aria-selected={ribbonTab === id}
            className={ribbonTab === id ? 'active' : ''}
            onClick={() => {
              setRibbonTab(id);
              // La sección de IA abre directamente la conversación.
              if (id === 'ai') openWorkspacePanel('ai');
            }}
          >
            {tr(label)}
          </button>
        ))}
      </nav>
      <button
        className="toolbar-documentation"
        onClick={() => {
          openWorkspacePanel('documentation');
        }}
        aria-haspopup="dialog"
        title={tr('toolbar.documentation')}
      >
        <BookOpen size={16} aria-hidden="true" />
        {tr('toolbar.documentation')}
      </button>
      <div
        className="ribbon-body"
        id="ribbon-panel"
        role="tabpanel"
        aria-labelledby={`ribbon-tab-${ribbonTab}`}
      >
        {ribbonTab === 'home' && (
          <div className="toolbar-group" data-group={tr('ribbon.project')}>
            {/* En modo servidor el proyecto viene de la mina: nuevo y abrir están en la página de la mina. */}
            {!serverMode && (
              <>
                <IconButton
                  showLabel
                  icon={FilePlus}
                  label={tr('toolbar.newProject')}
                  onClick={actions.newProject}
                />
                <IconButton
                  showLabel
                  icon={FolderOpen}
                  label={tr('toolbar.openProject')}
                  onClick={() => fileInput.current?.click()}
                />
              </>
            )}
            {/* Sin servidor, la copia descargada es el guardado; en la mina se guarda una versión
                (junto al aviso de cambios sin publicar) y la copia queda en Exportar. */}
            {!serverMode && (
              <IconButton
                showLabel
                icon={Save}
                label={tr('save.downloadCopy')}
                hint={tr('save.downloadCopyHint')}
                shortcut="Ctrl+S"
                onClick={() => void actions.saveProject()}
              />
            )}
            <MenuButton
              showLabel
              icon={Clapperboard}
              label={tr('toolbar.demo')}
              items={[
                {
                  icon: Presentation,
                  label: tr('demo.tour'),
                  onSelect: () => {
                    startDemo('tour');
                  },
                },
                {
                  icon: Clapperboard,
                  label: tr('demo.trailer.menu'),
                  onSelect: () => {
                    startDemo('trailer');
                  },
                },
                ...(demoOn
                  ? [{ icon: Clapperboard, label: tr('demo.exit'), onSelect: stopDemo }]
                  : []),
              ]}
            />
            {!serverMode && (
              <>
                <IconButton
                  showLabel
                  icon={HistoryIcon}
                  label={tr('toolbar.versions')}
                  onClick={() => {
                    useUiStore.getState().setVersionsOpen(true);
                  }}
                />
              </>
            )}
            <IconButton
              showLabel
              icon={Settings}
              label={tr('toolbar.settings')}
              onClick={() => {
                useUiStore.getState().setSettingsOpen(true);
              }}
            />
            <MenuButton showLabel icon={FileUp} label={tr('toolbar.import')} items={importItems} />
            <MenuButton
              showLabel
              icon={FileDown}
              label={tr('toolbar.export')}
              items={[
                ...(serverMode
                  ? [
                      {
                        icon: Save,
                        label: tr('save.downloadCopy'),
                        hint: tr('save.downloadCopyHint'),
                        onSelect: () => void actions.saveProject(),
                      },
                    ]
                  : []),
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
                {
                  icon: ImageIcon,
                  label: tr('toolbar.exportPng'),
                  onSelect: actions.exportPlanPng,
                },
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
              ref={topographyInput}
              type="file"
              accept={actions.TOPOGRAPHY_ACCEPT}
              multiple
              hidden
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                if (files.length > 0) void actions.openTopography(files);
                e.target.value = '';
              }}
            />
            <input
              ref={model3dInput}
              type="file"
              accept={MODEL3D_ACCEPT}
              multiple
              hidden
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                if (files.length > 0) void importModel3dFiles(files);
                e.target.value = '';
              }}
            />
            <input
              ref={holesInput}
              type="file"
              accept=".dxf,.csv,.txt,.tsv,text/csv"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                // Un solo «Taladros y perímetros»: el DXF va a su asistente y el texto al de CSV.
                if (file)
                  void (/\.dxf$/i.test(file.name) ? actions.openDxf(file) : actions.openCsv(file));
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
          </div>
        )}
        <div className="toolbar-group toolbar-history" data-group={tr('ribbon.edit')}>
          <IconButton
            showLabel
            icon={Undo2}
            displayLabel={tr('toolbar.undo')}
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
            showLabel
            icon={Redo2}
            displayLabel={tr('toolbar.redo')}
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
        {ribbonTab === 'view' && (
          <div
            className="toolbar-group"
            data-group={tr('toolbar.view')}
            role="group"
            aria-label={tr('tools.viewGroup')}
          >
            <IconButton
              showLabel
              icon={MapIcon}
              label={tr('tools.planView')}
              displayLabel={tr('ribbon.plan')}
              shortcut="3"
              active={viewMode === 'plan'}
              onClick={() => {
                setViewMode('plan');
              }}
            />
            <IconButton
              showLabel
              icon={Box}
              label={tr('tools.view3d')}
              displayLabel="3D"
              shortcut="3"
              active={viewMode === '3d'}
              onClick={() => {
                setViewMode('3d');
              }}
            />
          </div>
        )}
        {ribbonTab === 'view' && <XrButtons />}
        {(ribbonTab === 'tools' || ribbonTab === 'timing') &&
          TOOLS.filter((_, i) => (ribbonTab === 'timing' ? i === 2 : i !== 2)).map((group, g) => (
            <div
              key={g}
              className="toolbar-group"
              role="group"
              aria-label={tr('tools.group')}
              data-group={tr(
                ribbonTab === 'timing'
                  ? 'ribbon.initiation'
                  : ((
                      [
                        'ribbon.selection',
                        'ribbon.geometry',
                        'ribbon.monitor',
                        'ribbon.navigation',
                      ] as const
                    )[g] ?? 'toolbar.tools'),
              )}
            >
              {group
                .filter((t) => fitsKind(t.name, kind))
                .map((t) => (
                  <IconButton
                    showLabel
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
        {ribbonTab === 'view' && (
          <div
            className="toolbar-group snap"
            data-group={tr('ribbon.snap')}
            title={tr('tools.snapTitle')}
          >
            <IconButton
              showLabel
              icon={CircleDot}
              label={tr('tools.snapHoles')}
              active={snap.holes}
              onClick={() => {
                setSnap({ holes: !snap.holes });
              }}
            />
            <IconButton
              showLabel
              icon={Shapes}
              label={tr('tools.snapPattern')}
              active={snap.pattern}
              onClick={() => {
                setSnap({ pattern: !snap.pattern });
              }}
            />
            <IconButton
              showLabel
              icon={Mountain}
              label={tr('tools.snapTopography')}
              displayLabel={tr('topo.section')}
              active={snap.topography}
              onClick={() => {
                setSnap({ topography: !snap.topography });
              }}
            />
            <IconButton
              showLabel
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
        )}
        {ribbonTab === 'view' && (
          <div className="toolbar-group" data-group={tr('ribbon.navigation')}>
            <IconButton
              showLabel
              icon={Maximize2}
              label={tr('tools.zoomFit')}
              shortcut="F"
              onClick={() => {
                actions.zoomToFit();
              }}
            />
          </div>
        )}
        {ribbonTab === 'home' && (
          <div className="toolbar-group" data-group={tr('ribbon.help')}>
            <MenuButton
              showLabel
              icon={Presentation}
              label={tr('tools.examples')}
              displayLabel={tr('ribbon.examples')}
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
              showLabel
              icon={Keyboard}
              label={tr('tools.shortcuts')}
              shortcut="?"
              onClick={() => {
                setShortcutsOpen(true);
              }}
            />
          </div>
        )}
        <div className="toolbar-group workspace-actions" data-group={tr('ribbon.parameters')}>
          {panels.map((panel) => {
            const available = demoOn || tabAvailable(panel.requires, workflow);
            return (
              <IconButton
                key={panel.id}
                icon={panel.icon}
                label={tr(panel.label)}
                showLabel
                active={floating.some((win) => win.id === `workspace.${panel.id}`)}
                disabled={!available}
                hint={
                  !available
                    ? tr(panel.requires === 'charged' ? 'tabs.needCharge' : 'tabs.needHoles')
                    : tr('workspace.openWindow')
                }
                onClick={() => {
                  openWorkspacePanel(panel.id);
                }}
              />
            );
          })}
        </div>
      </div>
      {serverMode && (
        <div className="toolbar-group toolbar-account">
          <ProjectActions />
          <OtherToolProjects />
          <BackToMine />
          <UserMenu />
        </div>
      )}
    </header>
  );
}
