/* eslint-disable @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unsafe-assignment -- datos de prueba fijos */
import { analyzeBlast, buildExample, EXAMPLE_SPECS } from '@cronos/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { session } from '../session';
import { useAnalysisStore } from '../stores/analysisStore';
import { cardXrLines, closeAllCards, closeCard, pushCard, useCardStore } from './cards';
import { buildHoleDetail, HOLE_DETAIL_CARD, showHoleDetail } from './holeDetail';
import { runTool } from './tools';

const engine = vi.hoisted(() => ({
  xrMode: null as string | null,
  beginBuild: vi.fn(),
  endBuild: vi.fn(),
  setXrHole: vi.fn(),
  focusXr: vi.fn(),
  setHoleFocus: vi.fn(),
  flyCamera: vi.fn(),
  xrState: () => ({ view: 'walk', groundZ: 0 }),
  goToXr: vi.fn(() => ({ eye: { x: 0, y: 0, z: 1.7 }, yawDeg: 0 })),
}));
vi.mock('../session', async () => {
  const { createEditorSession } = await import('@cronos/core');
  return { session: createEditorSession(), getEngine: () => engine, APP_VERSION: 'test' };
});
vi.mock('../topography/session', () => ({ topographyElevation: () => null }));
vi.mock('../demo/runtime', () => ({ analysisReady: () => Promise.resolve() }));

beforeEach(() => {
  vi.clearAllMocks();
  engine.xrMode = null;
  const project = buildExample(EXAMPLE_SPECS.production);
  for (const blast of project.blasts)
    blast.holes = blast.holes.map((h, i) => ({ ...h, label: String(1672 + i) }));
  session.document.load(project);
  const blast = project.blasts[0]!;
  useAnalysisStore.setState({
    analysis: analyzeBlast(project, blast.id),
    version: session.document.version,
  });
  closeAllCards();
});

const first = () => session.document.project.blasts[0]!.holes[0]!;

describe('ficha pedida al asistente', () => {
  it('incluye columna, kg, retardo, disparo y geometría en las mismas filas y texto', () => {
    const h = first();
    const data = buildHoleDetail(h, session.document.project, useAnalysisStore.getState().analysis);
    expect(data.text).toContain('1672');
    expect(data.text).toContain('kg');
    expect(data.text).toContain('Retardo del detonador');
    expect(data.text).toContain('Taco');
    expect(data.text).toContain('Tiempo de disparo:');
    expect(data.text).toContain('ms');
    expect(data.text).toContain('Burden:');
    expect(data.text).toContain('Espaciamiento:');
    expect(data.text).toContain('Longitud');
    expect(data.rows.some((r) => 'bar' in r)).toBe(true);
  });
  it('hole_detail abre la tarjeta web sin visor e informa el uso de posición', async () => {
    const out = await runTool('hole_detail', { hole: '1' });
    expect(out).toMatchObject({
      ok: true,
      result: {
        resolved_label: '1672',
        resolution_note: expect.stringContaining('posición 1'),
        hole_detail: { text: expect.stringContaining('kg') },
      },
    });
    expect(useCardStore.getState().cards[0]).toMatchObject({
      id: HOLE_DETAIL_CARD,
      hole: { id: first().id, source: 'explicit' },
    });
  });
  it.each([
    { action: 'focus_hole', hole: '1' },
    { action: 'go_to', target: 'hole', hole: '1' },
  ])('VR %o devuelve la ficha y la muestra en las tarjetas', async (args) => {
    engine.xrMode = 'vr';
    const out = await runTool('vr_view', args);
    expect(out).toMatchObject({
      ok: true,
      result: { resolved_label: '1672', hole_detail: { text: expect.stringContaining('Burden:') } },
    });
    const card = useCardStore.getState().cards[0]!;
    expect(JSON.stringify(cardXrLines(card))).toContain(`card:close:${HOLE_DETAIL_CARD}`);
    expect(JSON.stringify(cardXrLines(card))).toContain('Retardo del detonador');
  });
  it('cámara web y spotlight usan la misma resolución', async () => {
    expect(await runTool('set_camera', { target: 'hole', hole: '1' })).toMatchObject({
      ok: true,
      result: { resolved_label: '1672', hole_detail: { hole_id: first().id } },
    });
    expect(await runTool('spotlight', { holes: { labels: ['1'] } })).toMatchObject({
      ok: true,
      result: { resolved_label: '1672', labels: '1672' },
    });
    await runTool('spotlight', { restore: true });
  });
  it('un error no mueve al usuario ni sustituye la ficha anterior', async () => {
    engine.xrMode = 'vr';
    showHoleDetail(first());
    const previous = useCardStore.getState().cards[0];
    const out = await runTool('vr_view', { action: 'focus_hole', hole: '999999' });
    expect(out).toMatchObject({ ok: false, error: expect.stringContaining('1672') });
    expect(engine.goToXr).not.toHaveBeenCalled();
    expect(useCardStore.getState().cards[0]).toBe(previous);
  });
  it('persiste entre reportes, otro taladro la sustituye y se puede cerrar', () => {
    showHoleDetail(first());
    const card = useCardStore.getState().cards[0]!;
    for (const id of ['a', 'b', 'c', 'd'])
      pushCard({ id, title: id, sub: '', metrics: [], bars: [], notes: [], t0: 0 });
    expect(useCardStore.getState().cards).toContain(card);
    const other = session.document.project.blasts[0]!.holes[1]!;
    showHoleDetail(other);
    expect(useCardStore.getState().cards.filter((c) => c.hole)).toHaveLength(1);
    expect(useCardStore.getState().cards[0]?.hole?.id).toBe(other.id);
    closeCard(HOLE_DETAIL_CARD);
    expect(useCardStore.getState().cards.some((c) => c.hole)).toBe(false);
  });
  it('la proximidad nunca sustituye la ficha explícita', () => {
    showHoleDetail(first());
    const card = useCardStore.getState().cards[0];
    showHoleDetail(session.document.project.blasts[0]!.holes[1]!, 'proximity');
    expect(useCardStore.getState().cards[0]).toBe(card);
  });
  it('no lee un análisis antiguo como tiempo actual', () => {
    useAnalysisStore.setState({ version: -1 });
    expect(showHoleDetail(first()).hole_detail.text).toContain('análisis pendiente');
  });
});
