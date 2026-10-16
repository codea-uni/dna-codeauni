import type { XrLine } from '@cronos/engine';
import { create } from 'zustand';
import { formatNumber, t, type MessageKey } from '../i18n';

/**
 * Tarjetas de reporte del asistente (como las de FleetView): cada vez que el agente consulta o
 * aplica algo importante (condiciones, propuesta, malla, carga, secuencia, predicción, pila),
 * aparece una tarjeta con esos MISMOS datos, en la web (flotante, se arrastra) y en el visor (en
 * arco a la derecha, se toma con pellizco). Hasta `MAX_CARDS`; la nueva entra primero y la misma
 * consulta reemplaza su tarjeta.
 */

export type Tone = 'ok' | 'warn' | 'bad' | 'accent';

export interface CardMetric {
  label: string;
  value: string;
  tone?: Tone;
}

/** Barra contra un límite (PPV contra su admisible, P80 contra el objetivo). */
export interface CardBar {
  label: string;
  text: string;
  /** Fracción llena (0–1) y dónde cae el límite (0–1), si hay. */
  fill: number;
  limit?: number;
  tone: Tone;
}

/** Opción elegible de una tarjeta (presets, escenarios, «¿usamos esta topografía?»). */
export interface CardChoice {
  id: string;
  label: string;
  hint?: string;
}

export interface AgentCard {
  /** Clave: la misma consulta reemplaza su tarjeta. */
  id: string;
  title: string;
  sub: string;
  metrics: CardMetric[];
  bars: CardBar[];
  notes: { text: string; tone: Tone }[];
  /** Opciones para tocar (web) o señalar con el rayo (visor); al elegir, se avisa al asistente. */
  choices?: CardChoice[];
  /** Cuándo apareció [ms] (animación de entrada). */
  t0: number;
  /** Ficha compartida por web y VR, sin recortar los tramos ni los iniciadores. */
  detailRows?: XrLine[];
  hole?: { id: string; source: 'explicit' | 'proximity' };
}

export const MAX_CARDS = 3;

interface CardState {
  cards: AgentCard[];
}

export const useCardStore = create<CardState>(() => ({ cards: [] }));

export function pushCard(card: AgentCard): void {
  if (
    card.hole?.source === 'proximity' &&
    useCardStore.getState().cards.some((c) => c.hole?.source === 'explicit')
  )
    return;
  const rest = useCardStore.getState().cards.filter((c) => c.id !== card.id);
  const ordered = [card, ...rest];
  const kept = ordered.slice(0, MAX_CARDS);
  const explicit = ordered.find((c) => c.hole?.source === 'explicit');
  // Una ficha pedida sigue visible aunque lleguen otros reportes del asistente.
  if (explicit && !kept.includes(explicit)) kept[MAX_CARDS - 1] = explicit;
  useCardStore.setState({ cards: kept });
}

export function closeCard(id: string): void {
  useCardStore.setState({ cards: useCardStore.getState().cards.filter((c) => c.id !== id) });
}

export function closeAllCards(): void {
  useCardStore.setState({ cards: [] });
}

type ChoiceHandler = (card: AgentCard, choice: CardChoice) => void;
let choiceHandler: ChoiceHandler | null = null;

/** Quién atiende la opción elegida (el asistente: la aplica o la dice en la conversación). */
export function onCardChoice(fn: ChoiceHandler | null): void {
  choiceHandler = fn;
}

/** El usuario eligió una opción de una tarjeta (clic en la web, rayo o pellizco en el visor). */
export function chooseCardOption(cardId: string, choiceId: string): void {
  const card = useCardStore.getState().cards.find((c) => c.id === cardId);
  const choice = card?.choices?.find((c) => c.id === choiceId);
  if (!card || !choice) return;
  closeCard(cardId);
  choiceHandler?.(card, choice);
}

// ------------------------------------------------------------------ lectura segura del resultado

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const n = (v: number | null, d = 0, unit = ''): string =>
  v === null ? '—' : `${formatNumber(v, d)}${unit ? ` ${unit}` : ''}`;

const ENUM_KEYS: Record<string, MessageKey> = {
  massive: 'card.v.massive',
  fractured: 'card.v.fractured',
  very_fractured: 'card.v.very_fractured',
  dry: 'card.v.dry',
  wet: 'card.v.wet',
  flooded: 'card.v.flooded',
  yes: 'card.v.yes',
  no: 'card.v.no',
  suspected: 'card.v.suspected',
  ore: 'card.v.ore',
  waste: 'card.v.waste',
  mixed: 'card.v.mixed',
  staggered: 'card.v.staggered',
  square: 'card.v.square',
  rectangular: 'card.v.rectangular',
};

/** Valor traducido de un enumerado; sin traducción, el valor tal cual. */
function enumText(v: unknown): string {
  const s = str(v);
  if (!s) return '—';
  const key = ENUM_KEYS[s];
  return key ? t(key) : s;
}

function card(id: string, titleKey: MessageKey, sub: string): AgentCard {
  return { id, title: t(titleKey), sub, metrics: [], bars: [], notes: [], t0: performance.now() };
}

// ------------------------------------------------------------------ tarjetas por herramienta

function siteCard(res: Obj): AgentCard | null {
  const s = obj(res.saved);
  if (!s) return null;
  const c = card('site', 'card.site.title', t('card.site.sub'));
  c.metrics.push(
    { label: t('card.site.rock'), value: enumText(s.rockMass) },
    {
      label: t('card.site.water'),
      value: enumText(s.water),
      tone: s.water === 'dry' ? 'ok' : 'warn',
    },
    {
      label: t('card.site.reactive'),
      value: enumText(s.reactiveGround),
      tone: s.reactiveGround === 'yes' ? 'bad' : s.reactiveGround === 'suspected' ? 'warn' : 'ok',
    },
    { label: t('card.site.material'), value: enumText(s.material) },
    { label: t('card.site.p80'), value: n(num(s.targetP80Cm), 0, 'cm'), tone: 'accent' },
  );
  for (const k of ['water_note', 'reactive_note'] as const) {
    const text = str(res[k]);
    if (text) c.notes.push({ text, tone: 'warn' });
  }
  return c;
}

function designCard(res: Obj): AgentCard | null {
  const p = obj(res.proposal);
  if (!p) return null;
  const c = card(
    'design',
    'card.design.title',
    t('card.design.sub', { kind: enumText(p.kind), d: n(num(p.diameter_mm)) }),
  );
  c.metrics.push(
    {
      label: t('card.design.pattern'),
      value: `${n(num(p.burden_m), 1)} × ${n(num(p.spacing_m), 1)} m`,
      tone: 'accent',
    },
    { label: t('card.design.stemming'), value: n(num(p.stemming_m), 1, 'm') },
    { label: t('card.design.subdrill'), value: n(num(p.subdrill_m), 1, 'm') },
    { label: t('card.design.explosive'), value: str(p.column_explosive) ?? '—' },
    { label: t('card.design.kg'), value: n(num(p.kg_per_hole), 0, 'kg') },
    { label: t('card.design.pf'), value: n(num(p.powder_factor_kg_m3), 2, 'kg/m³') },
  );
  const p80 = num(p.predicted_p80_cm);
  const target = num(p.target_p80_cm);
  if (p80 !== null) c.bars.push(p80Bar(p80, target));
  for (const w of arr(res.explosive_warnings)) {
    const text = str(w);
    if (text) c.notes.push({ text, tone: 'warn' });
  }
  return c;
}

function p80Bar(p80: number, target: number | null): CardBar {
  const max = Math.max(p80, target ?? 0) * 1.3 || 1;
  const off = target !== null && p80 > target * 1.05;
  return {
    label: t('card.p80'),
    text:
      target !== null ? t('card.p80vs', { v: n(p80, 0), target: n(target, 0) }) : `${n(p80, 0)} cm`,
    fill: p80 / max,
    ...(target !== null ? { limit: target / max } : {}),
    tone: off ? 'bad' : 'ok',
  };
}

function predictCard(res: Obj): AgentCard | null {
  if (num(res.holes) === null) return null;
  const c = card('predict', 'card.predict.title', t('card.predict.sub', { n: n(num(res.holes)) }));
  c.metrics.push(
    { label: t('card.predict.kg'), value: n(num(res.total_explosive_kg), 0, 'kg') },
    { label: t('card.predict.pf'), value: n(num(res.powder_factor_kg_m3), 2, 'kg/m³') },
    { label: t('card.predict.span'), value: n(num(res.firing_span_ms), 0, 'ms') },
    { label: t('card.predict.per8'), value: n(num(res.max_charge_per_8ms_kg), 0, 'kg') },
  );
  const frag = obj(res.fragmentation);
  const p80 = num(frag?.p80_cm);
  if (p80 !== null) c.bars.push(p80Bar(p80, num(frag?.target_p80_cm)));
  const vib = obj(res.vibration);
  for (const p of arr(vib?.protected_points)) {
    const o = obj(p);
    const ppv = num(o?.ppv_mm_s);
    if (!o || ppv === null) continue;
    const limit = num(o.limit_mm_s);
    const max = Math.max(ppv, limit ?? 0) * 1.3 || 1;
    c.bars.push({
      label: t('card.predict.ppv', { name: str(o.name) ?? '' }),
      text:
        limit !== null
          ? t('card.predict.ppvVs', { v: n(ppv, 1), limit: n(limit, 1) })
          : `${n(ppv, 1)} mm/s`,
      fill: ppv / max,
      ...(limit !== null ? { limit: limit / max } : {}),
      tone: limit !== null && ppv > limit ? 'bad' : 'ok',
    });
  }
  const flyrock = num(vib?.flyrock_range_m);
  if (flyrock !== null)
    c.metrics.push({ label: t('card.predict.flyrock'), value: n(flyrock, 0, 'm') });
  const cut = num(obj(res.cutoff_risk)?.holes) ?? 0;
  c.metrics.push({
    label: t('card.predict.cutoff'),
    value: cut > 0 ? t('card.predict.cutoffHoles', { n: n(cut) }) : t('card.v.none'),
    tone: cut > 0 ? 'bad' : 'ok',
  });
  const fumes = obj(res.fumes);
  const nox = num(fumes?.nox_risk_count) ?? 0;
  c.metrics.push({
    label: t('card.predict.nox'),
    value: nox > 0 ? t('card.predict.cutoffHoles', { n: n(nox) }) : t('card.v.none'),
    tone: nox > 0 ? 'bad' : 'ok',
  });
  if (vib && arr(vib.protected_points).length === 0)
    c.notes.push({ text: t('card.predict.noPoints'), tone: 'warn' });
  for (const k of arr(res.checks).slice(0, 3)) {
    const o = obj(k);
    const title = str(o?.title);
    if (title) c.notes.push({ text: title, tone: o?.severity === 'error' ? 'bad' : 'warn' });
  }
  return c;
}

function blocksCard(res: Obj): AgentCard | null {
  if (num(res.operating_blocks) === null) return null;
  const c = card(
    'blocks',
    'card.blocks.title',
    t('card.blocks.sub', { size: n(num(res.block_size_m)) }),
  );
  c.metrics.push(
    { label: t('card.blocks.count'), value: n(num(res.operating_blocks)) },
    {
      label: t('card.blocks.move'),
      value: t('card.blocks.moveValue', {
        mean: n(num(res.mean_block_displacement_m), 1),
        max: n(num(res.max_block_displacement_m), 1),
      }),
      tone: 'accent',
    },
    { label: t('card.blocks.dir'), value: n(num(res.direction_deg), 0, '°') },
    { label: t('card.blocks.swell'), value: `× ${n(num(res.swell_volume_ratio), 2)}` },
    { label: t('card.blocks.height'), value: n(num(res.max_pile_height_m), 1, 'm') },
  );
  const mixed = num(res.mixed_cells_pct);
  if (mixed !== null)
    c.metrics.push({
      label: t('card.blocks.mixed'),
      value: `${n(mixed)} %`,
      tone: mixed > 10 ? 'warn' : 'ok',
    });
  return c;
}

function patternCard(res: Obj): AgentCard | null {
  const holes = num(res.holes);
  if (holes === null) return null;
  const c = card('pattern', 'card.pattern.title', str(res.perimeter) ?? '');
  c.metrics.push(
    { label: t('card.pattern.holes'), value: n(holes), tone: 'accent' },
    { label: t('card.pattern.kind'), value: enumText(res.kind) },
    {
      label: t('card.design.pattern'),
      value: `${n(num(res.burden), 1)} × ${n(num(res.spacing), 1)} m`,
    },
  );
  const outside = num(res.holes_outside_topography) ?? 0;
  if (outside > 0)
    c.notes.push({ text: t('card.pattern.outside', { n: n(outside) }), tone: 'warn' });
  if (res.free_face === false) c.notes.push({ text: t('card.pattern.noFace'), tone: 'warn' });
  return c;
}

function chargeCard(res: Obj): AgentCard | null {
  const holes = num(res.charged_holes);
  if (holes === null) return null;
  const c = card('charge', 'card.charge.title', str(res.column) ?? '');
  c.metrics.push(
    { label: t('card.charge.holes'), value: n(holes), tone: 'accent' },
    { label: t('card.design.explosive'), value: str(res.column) ?? '—' },
    { label: t('card.design.stemming'), value: n(num(res.stemming_m), 1, 'm') },
  );
  const bottom = str(res.bottom);
  if (bottom) c.metrics.push({ label: t('card.charge.bottom'), value: bottom });
  const noDet = num(res.holes_without_detonator) ?? 0;
  if (noDet > 0) c.notes.push({ text: t('card.charge.noDet', { n: n(noDet) }), tone: 'warn' });
  return c;
}

function timingCard(res: Obj, args: Obj): AgentCard | null {
  const holes = num(res.programmed_holes);
  if (holes === null) return null;
  const c = card('timing', 'card.timing.title', str(res.pattern) ?? '');
  c.metrics.push(
    { label: t('card.timing.holes'), value: n(holes), tone: 'accent' },
    { label: t('card.timing.detonator'), value: str(res.detonator) ?? '—' },
  );
  const ih = num(args.inter_hole_ms);
  const ir = num(args.inter_row_ms);
  if (ih !== null) c.metrics.push({ label: t('card.timing.hole'), value: n(ih, 0, 'ms') });
  if (ir !== null) c.metrics.push({ label: t('card.timing.row'), value: n(ir, 0, 'ms') });
  const start = str(res.start_hole);
  if (start) c.metrics.push({ label: t('card.timing.start'), value: start });
  return c;
}

function pointCard(res: Obj): AgentCard | null {
  const name = str(res.point);
  if (!name) return null;
  const c = card(`point:${name}`, 'card.point.title', name);
  const limit = num(res.ppv_limit_mm_s);
  c.metrics.push(
    { label: t('card.point.distance'), value: n(num(res.distance_m), 0, 'm'), tone: 'accent' },
    { label: t('card.point.limit'), value: limit !== null ? n(limit, 1, 'mm/s') : '—' },
  );
  return c;
}

function reportCard(res: Obj): AgentCard | null {
  const holes = num(res.holes);
  if (holes === null) return null;
  const c = card('report', 'card.report.title', t('card.predict.sub', { n: n(holes) }));
  c.metrics.push(
    { label: t('card.predict.kg'), value: n(num(res.total_explosive_kg), 0, 'kg'), tone: 'accent' },
    { label: t('card.predict.pf'), value: n(num(res.loading_factor_kg_m3), 3, 'kg/m³') },
    { label: t('card.report.pft'), value: n(num(res.powder_factor_kg_t), 3, 'kg/t') },
    { label: t('card.report.volume'), value: n(num(res.volume_m3), 0, 'm³') },
    { label: t('card.report.tonnage'), value: n(num(res.tonnage_t), 0, 't') },
    { label: t('card.report.drilled'), value: n(num(res.drilled_m), 0, 'm') },
  );
  return c;
}

/** Tarjeta para el resultado de una herramienta (null = esta herramienta no muestra tarjeta). */
export function cardFromTool(name: string, args: unknown, result: unknown): AgentCard | null {
  const res = obj(result);
  if (!res) return null;
  switch (name) {
    case 'set_site_conditions':
      return siteCard(res);
    case 'recommend_design':
      return designCard(res);
    case 'predict_results':
      return predictCard(res);
    case 'track_blocks':
      return blocksCard(res);
    case 'get_analysis':
      return reportCard(res);
    case 'generate_pattern':
      return patternCard(res);
    case 'set_charge':
      return chargeCard(res);
    case 'set_electronic_timing':
      return timingCard(res, obj(args) ?? {});
    case 'add_protected_point':
      return pointCard(res);
    default:
      return null;
  }
}

// ------------------------------------------------------------------ visor

export const TONE_COLOR: Record<Tone, string> = {
  ok: '#72ad3a',
  warn: '#ffae00',
  bad: '#ff4d5e',
  accent: '#5b7aff',
};

/** Filas del panel del visor para una tarjeta. */
export function cardXrLines(c: AgentCard): XrLine[] {
  const lines: XrLine[] = [
    { label: t('card.live'), body: true },
    { label: c.title, heading: true, swatch: TONE_COLOR.accent },
  ];
  if (c.sub) lines.push({ label: c.sub, body: true });
  // Cada dato ocupa todo el ancho: el tiempo y los productos no se comprimen en media celda.
  for (const row of (c.detailRows ?? []).flatMap((line) => ('label' in line ? [line] : [...line])))
    lines.push(row.bar ? row : { ...row, body: true });
  for (const m of c.metrics)
    lines.push({
      label: `${m.label}:  ${m.value}`,
      body: true,
      ...(m.tone ? { swatch: TONE_COLOR[m.tone] } : {}),
    });
  for (const b of c.bars) {
    lines.push({ label: `${b.label}:  ${b.text}`, body: true, swatch: TONE_COLOR[b.tone] });
    lines.push({
      label: '',
      bar: [
        { fraction: Math.min(1, b.fill), color: TONE_COLOR[b.tone] },
        { fraction: Math.max(0, 1 - Math.min(1, b.fill)), color: '#20405a' },
      ],
    });
  }
  for (const note of c.notes.slice(0, 3))
    lines.push({ label: `• ${note.text}`, body: true, swatch: TONE_COLOR[note.tone] });
  // Opciones elegibles: una por fila, grandes para el rayo del mando o el pellizco.
  for (const ch of (c.choices ?? []).slice(0, 8))
    lines.push({
      id: `card:choice:${c.id}:${ch.id}`,
      label: ch.hint ? `${ch.label} · ${ch.hint}` : ch.label,
    });
  lines.push([{ id: `card:close:${c.id}`, label: t('card.close') }]);
  return lines;
}
