import {
  deckIntervals,
  diameterToDisplay,
  holeCharge,
  indexLibrary,
  lengthToDisplay,
  type BlastAnalysis,
  type Hole,
  type Project,
} from '@cronos/core';
import type { XrLine } from '@cronos/engine';
import { formatNumber, t } from '../i18n';
import { deckName, KIND_COLOR } from '../panels/DeckEditor';

/** Tramo vacío en la boca (sin deck) en la barra de la columna. */
const EMPTY = '#334155';

/**
 * Ficha del taladro en el visor (D-19): la columna de carga de boca a fondo como barra apilada, una
 * leyenda por tramo con producto, largo y kg, los iniciadores y el resumen del análisis. Todo sale
 * de `holeCharge` y del análisis ya hecho: ningún cálculo nuevo.
 */
export function holeCardRows(
  hole: Hole,
  project: Pick<Project, 'library' | 'displayUnits'>,
  analysis: BlastAnalysis | null,
): XrLine[] {
  const { library: lib, displayUnits: units } = project;
  const index = indexLibrary(lib);
  const charge = holeCharge(hole, index);
  const len = (m: number) => `${formatNumber(lengthToDisplay(m, units.length), 1)} ${units.length}`;

  // De boca a fondo (los decks vienen de fondo a boca).
  const intervals = deckIntervals(hole)
    .map((iv, i) => ({ ...iv, mass: charge.deckMasses[i] ?? 0 }))
    .sort((a, b) => a.top - b.top);
  const total = Math.max(hole.length, 1e-9);
  const empty = intervals.length > 0 ? Math.max(0, intervals[0]?.top ?? 0) : hole.length;
  const bar = [
    ...(empty > 0 ? [{ fraction: empty / total, color: EMPTY }] : []),
    ...intervals.map((iv) => ({
      fraction: (iv.bottom - iv.top) / total,
      color: KIND_COLOR[iv.deck.kind],
    })),
  ];

  const lines: XrLine[] = [
    { label: t('xr.info.title', { label: hole.label }) },
    { label: '', bar },
  ];
  for (const iv of intervals) {
    const name = deckName(iv.deck, lib, t);
    const length = len(iv.bottom - iv.top);
    lines.push({
      swatch: KIND_COLOR[iv.deck.kind],
      label:
        iv.deck.kind === 'explosive'
          ? t('xr.info.deckCharged', { name, length, kg: formatNumber(iv.mass, 1) })
          : t('xr.info.deck', { name, length }),
    });
  }
  for (const ini of hole.initiators) {
    const det = index.detonators.get(ini.detonatorId)?.name ?? '—';
    const primer = ini.primerId ? index.primers.get(ini.primerId)?.name : undefined;
    lines.push({
      label: t('xr.info.initiator', {
        name: primer ? `${det} + ${primer}` : det,
        depth: len(ini.depth),
      }),
    });
  }

  const i = analysis ? analysis.charge.holeIds.indexOf(hole.id) : -1;
  const kg = analysis?.charge.perHole[i];
  const fire = analysis?.timing.fireTime[i];
  const lf = analysis?.charge.loadingFactorPerHole[i];
  const summary = [
    {
      label: t('xr.info.charge', { kg: formatNumber(kg ?? charge.explosive + charge.primers, 1) }),
    },
  ];
  // Tiempo relativo al primer taladro, como las etiquetas de tiempo (H-502).
  if (analysis && fire !== undefined && Number.isFinite(fire))
    summary.push({
      label: t('xr.info.delay', {
        ms: formatNumber((fire - analysis.timing.firstTime) * 1000),
      }),
    });
  lines.push(summary, [
    { label: t('xr.info.length', { value: len(hole.length) }) },
    {
      label: t('xr.info.diameter', {
        value: formatNumber(diameterToDisplay(hole.diameter, units.diameter)),
        unit: units.diameter,
      }),
    },
  ]);
  if (lf !== undefined && lf > 0)
    lines.push({ label: t('xr.info.loadingFactor', { value: formatNumber(lf, 3) }) });
  return lines;
}
