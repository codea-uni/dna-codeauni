import type { BlastAnalysis, Hole, Project } from '@cronos/core';
import { holeCardRows } from '../xr/holeCard';
import { getEngine, session } from '../session';
import { useAnalysisStore } from '../stores/analysisStore';
import { pushCard, useCardStore, type AgentCard } from './cards';

export const HOLE_DETAIL_CARD = 'hole-detail';

/** La tarjeta y el texto de voz salen de las mismas filas, con las unidades del proyecto. */
export function buildHoleDetail(hole: Hole, project: Project, analysis: BlastAnalysis | null) {
  const rows = holeCardRows(hole, project, analysis);
  return {
    hole_id: hole.id,
    resolved_label: hole.label,
    text: rows
      .flatMap((line) => ('label' in line ? [line] : [...line]))
      .map((row) => row.label)
      .filter(Boolean)
      .join('\n'),
    rows,
  };
}

/**
 * Foco sobre el taladro pedido (lo registra blastTools: dejar solo ese taladro a la vista, sin
 * topografía que lo tape). Así este módulo no depende de las herramientas.
 */
let focusHandler: ((hole: Hole) => Record<string, unknown>) | null = null;
export function setHoleFocusHandler(fn: (hole: Hole) => Record<string, unknown>): void {
  focusHandler = fn;
}

/** `focus`: además deja solo ese taladro a la vista (pedido por el usuario, no al refrescar). */
export function showHoleDetail(
  hole: Hole,
  source: 'explicit' | 'proximity' = 'explicit',
  focus = false,
) {
  const state = useAnalysisStore.getState();
  const detail = buildHoleDetail(
    hole,
    session.document.project,
    state.version === session.document.version ? state.analysis : null,
  );
  const previous = useCardStore.getState().cards.find((c) => c.id === HOLE_DETAIL_CARD);
  const card: AgentCard = {
    id: HOLE_DETAIL_CARD,
    title: `Taladro ${hole.label}`,
    sub: source === 'explicit' ? 'Detalle solicitado' : 'Taladro cercano',
    metrics: [],
    bars: [],
    notes: [],
    detailRows: detail.rows.slice(1),
    hole: { id: hole.id, source },
    t0:
      previous?.hole?.id === hole.id && previous.hole.source === source
        ? previous.t0
        : performance.now(),
  };
  pushCard(card);
  if (source === 'explicit') getEngine()?.setXrHole(hole.id);
  const focused = focus && source === 'explicit' && focusHandler ? focusHandler(hole) : {};
  return { resolved_label: hole.label, hole_detail: detail, ...focused };
}
