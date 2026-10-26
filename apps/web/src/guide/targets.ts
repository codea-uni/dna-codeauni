import { WORKSPACE_PANELS } from '../components/WorkspaceWindows';
import { t, type MessageKey } from '../i18n';
import type { UiState } from '../stores/uiStore';

/**
 * Catálogo de lo que el agente guía sabe señalar: cada control lleva `data-guide="<id>"` en la
 * interfaz y aquí dice qué es y cómo dejarlo a la vista (pestaña de la cinta, ventana, menú). Con
 * esto el asistente nunca inventa dónde está algo: elige un id y la guía lo encuentra.
 */

export type RibbonTab = UiState['ribbonTab'];

/** Cómo dejar un control a la vista, en orden. */
export type Reveal =
  | { ribbon: RibbonTab }
  /** Abre la ventana de trabajo `id` (WORKSPACE_PANELS). */
  | { window: string }
  /** Pulsa el control `data-guide` si está cerrado (menús, desplegables). */
  | { open: string }
  /** Pasa a la vista indicada. */
  | { view: 'plan' | '3d' };

export interface GuideTarget {
  id: string;
  /** Nombre como se ve en pantalla. */
  name: () => string;
  /** Para qué sirve (lo lee el asistente). */
  what: string;
  /** Solo en esa herramienta (Open Pit = surface, Underground = underground). */
  kind?: 'surface' | 'underground';
  reveal: Reveal[];
}

const SECTION_OF: Record<string, RibbonTab> = {
  home: 'home',
  tools: 'tools',
  charge: 'charge',
  timing: 'timing',
  analysis: 'analysis',
  library: 'library',
  ai: 'ai',
};

const RIBBON: [RibbonTab, MessageKey, string][] = [
  ['home', 'toolbar.home', 'Project: import, export, settings, demo, examples.'],
  [
    'tools',
    'app.tab.design',
    'Design tools: draw perimeter, free face, holes, pattern, topography, underground.',
  ],
  ['charge', 'app.tab.charge', 'Charging of the holes (explosive, stemming, primer).'],
  ['timing', 'app.tab.timing', 'Tie-up and firing times.'],
  [
    'analysis',
    'toolbar.analysis',
    'Results: energy, fragmentation, vibration, muckpile, scenarios, drill deviation.',
  ],
  ['view', 'toolbar.view', 'Plan / 3D view, snapping, VR.'],
  ['library', 'app.tab.library', 'Product library (explosives, detonators, connectors).'],
  ['ai', 'toolbar.ai', 'The AI assistant (text and voice).'],
];

/** Para qué sirve cada ventana (inglés para el modelo, con las palabras en español que se buscan). */
const PANEL_WHAT: Record<string, string> = {
  ai: 'Asistente IA: AI assistant conversation (text or voice).',
  documentation: 'Manual / documentación: functions of the program, models and formulas.',
  blast: 'Voladura / polígonos: bench, perimeters, free faces.',
  topography:
    'Topografía / levantamientos / labores: import surveys, point clouds, block models, underground workings; move/rotate surveys.',
  underground:
    'Subterránea (frente, abanicos, tajeo, método de minado): tunnel face (Swedish method), stope rings, underground analysis; location on a working and «Llevar al diseño 3D».',
  pattern:
    'Malla de perforación: generate the drill pattern inside the perimeter (burden, spacing, diameter, kind).',
  groups: 'Grupos de taladros: production, presplit, buffer.',
  drillSurvey:
    'Perforación real / desviación: import hole deviation (Boretrak .phd / CSV) and compare with the design.',
  design: 'Primeros pasos: first steps checklist of the design.',
  charge:
    'Carga / carguío / explosivo / taco: charge rule, primer, decks; apply to selection or all holes; rock mass.',
  timing:
    'Tiempos / amarre / secuencia / retardos: downhole delays, automatic tie-up (nonel) or electronic times, manual tie-up.',
  energy: 'Energía / daño: near-field damage (Holmberg–Persson, NIOSH).',
  fragmentation: 'Fragmentación / P80: Kuz-Ram / Swebrec.',
  vibration:
    'Vibración / PPV: PPV at protected points, vibration law and calibration with seismographs.',
  muckpile: 'Pila / material / desplazamiento: throw and swell of the material.',
  scenarios: 'Escenarios: compare design alternatives.',
  library: 'Librería de productos: explosives, detonators, connectors.',
};

/**
 * Herramientas del mapa como están en la cinta (`TOOLS` de Toolbar; la prueba lo verifica): el
 * grupo 2 va en la pestaña Tiempos, el resto en Diseño. No se importa Toolbar para no arrastrar
 * la cinta entera al registro de herramientas del asistente.
 */
export const MAP_TOOLS: readonly (readonly [name: string, label: MessageKey, group: number])[] = [
  ['select', 'tools.select', 0],
  ['lasso', 'tools.lasso', 0],
  ['add', 'tools.add', 1],
  ['boundary', 'tools.boundary', 1],
  ['freeFace', 'tools.freeFace', 1],
  ['tie', 'tools.tie', 2],
  ['initiate', 'tools.initiate', 2],
  ['monitor', 'tools.monitor', 3],
  ['measure', 'tools.measure', 4],
  ['pan', 'tools.pan', 4],
];

const TOOL_WHAT: Record<string, string> = {
  select: 'Select holes or objects on the map.',
  lasso: 'Select holes with a lasso.',
  add: 'Add individual holes by clicking.',
  boundary: 'Draw the blast perimeter (polígono): click per vertex, double-click to close.',
  freeFace: 'Mark the free face: click the perimeter edge facing the bench face.',
  tie: 'Draw surface connections between holes by hand.',
  initiate: 'Set the initiation point of the tie-up.',
  monitor: 'Place a monitoring / protected point (house, slope, working) for vibration.',
  measure: 'Measure distances on the map.',
  pan: 'Pan the map.',
};

/** Controles dentro de ventanas y barras (marcados a mano con `data-guide`). */
const MANUAL: GuideTarget[] = [
  {
    id: 'menu.import',
    name: () => t('toolbar.import'),
    what: 'Import menu: topography, underground workings, 3D models, holes, deviation, perimeters, seismographs.',
    reveal: [{ ribbon: 'home' }],
  },
  {
    id: 'menu.export',
    name: () => t('toolbar.export'),
    what: 'Export menu: CSV, DXF, GeoJSON, PNG, PDF report, copy table.',
    reveal: [{ ribbon: 'home' }],
  },
  ...(
    [
      [
        'workings',
        'import.menu.workings',
        'Import underground workings (DXF/Surpac tunnels, drives, stopes).',
      ],
      [
        'topography',
        'import.menu.topography',
        'Import a topography / survey (DXF, mesh, point cloud, grid).',
      ],
      ['model3d', 'import.menu.model3d', 'Import a point cloud or block model.'],
      ['holes', 'import.menu.holes', 'Import holes from a file (CSV).'],
      ['drillSurvey', 'import.menu.drillSurvey', 'Import measured hole deviation (needs holes).'],
      ['boundaries', 'import.menu.boundariesCsv', 'Import perimeters from CSV.'],
      ['geoJson', 'import.menu.geoJson', 'Import GeoJSON.'],
      [
        'seismographs',
        'import.menu.seismographs',
        'Load seismograph records (needs charged holes).',
      ],
    ] as const
  ).map(([id, label, what]): GuideTarget => ({
    id: `import.${id}`,
    name: () => t(label),
    what,
    reveal: [{ ribbon: 'home' }, { open: 'menu.import' }],
  })),
  ...(
    [
      ['pdf', 'toolbar.exportPdf', 'Download the PDF report of the blast.'],
      ['csv', 'toolbar.exportCsv', 'Export the hole table as CSV.'],
      ['dxf', 'toolbar.exportDxf', 'Export the design as DXF.'],
      ['png', 'toolbar.exportPng', 'Save an image of the view.'],
    ] as const
  ).map(([id, label, what]): GuideTarget => ({
    id: `export.${id}`,
    name: () => t(label),
    what,
    reveal: [{ ribbon: 'home' }, { open: 'menu.export' }],
  })),
  {
    id: 'documentation',
    name: () => t('toolbar.documentation'),
    what: 'Opens the manual and the functions of the program.',
    reveal: [],
  },
  {
    id: 'save.version',
    name: () => t('save.version'),
    what: 'Publish / save a version of the project in the mine (top right, only when there are unpublished changes).',
    reveal: [],
  },
  {
    id: 'quick.bar',
    name: () => t('quick.bar'),
    what: 'Quick actions bar over the view: plan/3D, simulate, layers, fit, search.',
    reveal: [],
  },
  {
    id: 'quick.plan',
    name: () => t('quick.plan'),
    what: 'Switch to plan view (2D, for editing).',
    reveal: [],
  },
  { id: 'quick.3d', name: () => t('quick.3d'), what: 'Switch to the 3D view.', reveal: [] },
  {
    id: 'quick.simulate',
    name: () => t('quick.simulate'),
    what: 'Simulate the blast: firing sequence and material movement in 3D (needs tie-up / times).',
    reveal: [],
  },
  {
    id: 'quick.fit',
    name: () => t('quick.fit'),
    what: 'Frame everything (or the selection).',
    reveal: [],
  },
  {
    id: 'quick.search',
    name: () => t('quick.search'),
    what: 'Command search (Ctrl+K): type an action and run it.',
    reveal: [],
  },
  {
    id: 'pattern.generate',
    name: () => t('pattern.generate'),
    what: 'Button that generates the drill pattern with the values of the window.',
    kind: 'surface',
    reveal: [{ window: 'pattern' }],
  },
  {
    id: 'charge.applyAll',
    name: () => t('charge.applyAllN', { n: '' }).replace(/\s*\(\)\s*$/, ''),
    what: 'Apply the charge rule to all holes.',
    reveal: [{ window: 'charge' }],
  },
  {
    id: 'charge.applySelection',
    name: () => t('charge.applyOne'),
    what: 'Apply the charge rule only to the selected holes.',
    reveal: [{ window: 'charge' }],
  },
  {
    id: 'timing.applyNonel',
    name: () => t('timing.generate'),
    what: 'Generate the automatic surface tie-up (nonel) with the chosen delays.',
    kind: 'surface',
    reveal: [{ window: 'timing' }],
  },
  {
    id: 'timing.applyElectronic',
    name: () => t('timing.electronic'),
    what: 'Assign electronic detonator times hole by hole.',
    reveal: [{ window: 'timing' }],
  },
  {
    id: 'topo.import',
    name: () => t('topo.panel.import'),
    what: 'Import a topography file inside the Topography window.',
    reveal: [{ window: 'topography' }],
  },
  {
    id: 'workings.choose',
    name: () => t('topo.workings.choose'),
    what: 'Choose the DXF/Surpac file of underground workings (after Import → Underground workings).',
    reveal: [],
  },
  ...(
    [
      ['methods', 'ugm.tab', 'Mining method templates (drift, ramp, raise, stopes, SLC…).'],
      [
        'face',
        'ug.tab.face',
        'Tunnel face design (Swedish method): section, cut, charges, delays.',
      ],
      ['ring', 'ug.tab.ring', 'Stope ring (fan) design with long holes.'],
      [
        'analysis',
        'uga.tab',
        'Underground analysis: damage halos, coupling, fragmentation, volume.',
      ],
    ] as const
  ).map(([id, label, what]): GuideTarget => ({
    id: `ug.tab.${id}`,
    name: () => t(label),
    what,
    kind: 'underground',
    reveal: [{ window: 'underground' }],
  })),
  {
    id: 'ug.location',
    name: () => t('ug.loc.title'),
    what: 'Pick the working (labor) where the face / rings go, and the chainage.',
    kind: 'underground',
    reveal: [{ window: 'underground' }],
  },
  {
    id: 'ug.send',
    name: () => t('ug.send'),
    what: 'Put the designed face / rings as holes in the 3D mine.',
    kind: 'underground',
    reveal: [{ window: 'underground' }],
  },
];

let cache: GuideTarget[] | null = null;

/** Todo el catálogo (se arma una vez: los nombres se traducen al pedirlos). */
export function guideTargets(): GuideTarget[] {
  if (cache) return cache;
  const out: GuideTarget[] = [];
  for (const [id, label, what] of RIBBON)
    out.push({ id: `ribbon.${id}`, name: () => t(label), what: `Ribbon tab. ${what}`, reveal: [] });
  for (const panel of WORKSPACE_PANELS) {
    const section = SECTION_OF[panel.section];
    const what = PANEL_WHAT[panel.id] ?? '';
    const kind =
      panel.id === 'underground' ? 'underground' : panel.id === 'pattern' ? 'surface' : undefined;
    out.push({
      id: `panel.${panel.id}`,
      name: () => t(panel.label),
      what: `Ribbon button that opens the window. ${what}`,
      ...(kind ? { kind } : {}),
      reveal: section ? [{ ribbon: section }] : [],
    });
    out.push({
      id: `window.${panel.id}`,
      name: () => t(panel.label),
      what: `The open window. ${what}`,
      ...(kind ? { kind } : {}),
      reveal: [{ window: panel.id }],
    });
  }
  for (const [name, label, group] of MAP_TOOLS)
    out.push({
      id: `tool.${name}`,
      name: () => t(label),
      what: `Map tool (plan view). ${TOOL_WHAT[name] ?? ''}`,
      reveal: [{ ribbon: group === 2 ? 'timing' : 'tools' }, { view: 'plan' }],
    });
  out.push(...MANUAL);
  cache = out;
  return out;
}

export function findGuideTarget(id: string): GuideTarget | undefined {
  return guideTargets().find((x) => x.id === id);
}

/** Texto comparable: minúsculas y sin tildes. */
export const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').trim();

/** Busca en el catálogo por palabras (nombre, id o para qué sirve). */
export function searchGuideTargets(
  query: string,
  kind: 'surface' | 'underground',
): { id: string; name: string; what: string }[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return guideTargets()
    .filter((x) => !x.kind || x.kind === kind)
    .map((x) => ({ x, name: x.name() }))
    .map(({ x, name }) => {
      const hay = fold(`${name} ${x.id} ${x.what}`);
      const score = words.reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0);
      return { id: x.id, name, what: x.what, score };
    })
    .filter((x) => words.length === 0 || x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 25)
    .map(({ id, name, what }) => ({ id, name, what }));
}
