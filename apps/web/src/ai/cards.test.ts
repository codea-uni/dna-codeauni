import { describe, expect, it } from 'vitest';
import { cardFromTool, cardXrLines, closeCard, pushCard, useCardStore, MAX_CARDS } from './cards';

describe('tarjetas de reporte del asistente', () => {
  it('predicción: PPV contra su límite y P80 contra el objetivo, con avisos', () => {
    const card = cardFromTool(
      'predict_results',
      {},
      {
        holes: 140,
        total_explosive_kg: 35861,
        powder_factor_kg_m3: 0.598,
        firing_span_ms: 720,
        max_charge_per_8ms_kg: 1281,
        fragmentation: { p80_cm: 38.4, target_p80_cm: 20 },
        vibration: {
          protected_points: [{ name: 'Comunidad', ppv_mm_s: 7.2, limit_mm_s: 5 }],
          flyrock_range_m: 180,
        },
        cutoff_risk: { holes: 2 },
        fumes: { nox_risk_count: 0 },
        checks: [{ severity: 'warning', title: 'Taco corto en 1 taladro' }],
      },
    );
    expect(card?.id).toBe('predict');
    expect(card?.bars.map((b) => b.tone)).toEqual(['bad', 'bad']);
    expect(card?.metrics.find((m) => m.tone === 'bad')).toBeDefined();
    expect(card?.notes.map((n) => n.text)).toContain('Taco corto en 1 taladro');
    const lines = card ? cardXrLines(card) : [];
    expect(JSON.stringify(lines)).toContain('card:close:predict');
  });

  it('las herramientas sin tarjeta no muestran nada', () => {
    expect(cardFromTool('list_holes', {}, { holes: [] })).toBeNull();
    expect(cardFromTool('predict_results', {}, 'texto')).toBeNull();
  });

  it('la misma consulta reemplaza su tarjeta, la nueva va primero y hay un máximo', () => {
    useCardStore.setState({ cards: [] });
    const site = cardFromTool(
      'set_site_conditions',
      {},
      { saved: { rockMass: 'fractured', water: 'wet' } },
    );
    if (!site) throw new Error('sin tarjeta');
    for (const id of ['a', 'b', 'c']) pushCard({ ...site, id });
    pushCard(site);
    pushCard({ ...site, id: 'a' });
    const ids = useCardStore.getState().cards.map((c) => c.id);
    expect(ids).toEqual(['a', 'site', 'c']);
    expect(ids).toHaveLength(MAX_CARDS);
    closeCard('a');
    expect(useCardStore.getState().cards.map((c) => c.id)).toEqual(['site', 'c']);
  });
});
