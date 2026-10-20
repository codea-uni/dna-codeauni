import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  fragmentation,
  fragmentationHeadline,
  kuzRam,
  type KuzRamInputs,
} from '../fragmentation/fragmentation';
import { undergroundKuzRam } from '../underground/fragmentation';
import { fitVibrationLaw, scaledDistance, type SeismographRecord } from '../vibration/calibration';
import { admissibleCharge, distanceForPpv, ppvAt } from '../vibration/vibration';
import {
  choiceModel,
  METHOD_CHOICES,
  METHOD_MODELS,
  METHOD_TOPICS,
  methodModel,
  plannedAlternatives,
  topicModels,
} from './catalog';

const rules = readFileSync(new URL('../../../../docs/RULES.md', import.meta.url), 'utf8');

describe('catálogo de modelos', () => {
  it('ids únicos y cada modelo con nombre, fórmula, referencia y confianza', () => {
    const ids = METHOD_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of METHOD_MODELS) {
      expect(m.name.es && m.name.en, m.id).toBeTruthy();
      expect(m.formulas.length, m.id).toBeGreaterThan(0);
      expect(m.reference, m.id).not.toBe('');
      expect(m.confidence, m.id).not.toBe('');
      expect(m.assumptions.length, m.id).toBeGreaterThan(0);
    }
  });

  it('cada ID de regla citado existe en docs/RULES.md', () => {
    for (const m of METHOD_MODELS)
      for (const id of m.rules) expect(rules, `${m.id} → ${id}`).toContain(`| ${id} `);
  });

  it('cada tema tiene modelos y cada modelo un tema', () => {
    const topics = new Set(METHOD_TOPICS.map((tp) => tp.id));
    for (const m of METHOD_MODELS) expect(topics.has(m.topic), m.id).toBe(true);
    for (const tp of METHOD_TOPICS) expect(topicModels(tp.id).length, tp.id).toBeGreaterThan(0);
  });

  it('las opciones de los selectores son modelos implementados', () => {
    for (const options of Object.values(METHOD_CHOICES))
      for (const o of options) expect(methodModel(o.model).status).toBe('implemented');
    expect(choiceModel('vibrationLaw', 'cube-root')).toBe('vibration.ambraseys');
    expect(choiceModel('vibrationLaw', 'desconocida')).toBe('vibration.usbm');
    expect(plannedAlternatives('vibration.usbm').map((m) => m.id)).toEqual(['vibration.ghosh']);
  });
});

describe('selector de ley de vibración', () => {
  const base = { k: 1.14, beta: 1.6 };
  it('cada escalamiento da un PPV distinto con la misma K, β, R y Q', () => {
    const values = (['square-root', 'cube-root', 'langefors'] as const).map((scaling) =>
      ppvAt({ ...base, scaling }, 100, 50),
    );
    expect(new Set(values.map((x) => x.toFixed(6))).size).toBe(3);
  });

  it('Langefors-Kihlström: con β = 1 es K·√(Q/R^1,5)', () => {
    const k = 0.5;
    expect(ppvAt({ k, beta: 1, scaling: 'langefors' }, 80, 30)).toBeCloseTo(
      k * Math.sqrt(30 / Math.pow(80, 1.5)),
      12,
    );
  });

  it('Langefors-Kihlström: distancia y carga admisible son las inversas', () => {
    const law = { k: 0.7, beta: 1.4, scaling: 'langefors' as const };
    const ppv = ppvAt(law, 120, 40);
    expect(distanceForPpv(law, ppv, 40)).toBeCloseTo(120, 8);
    expect(admissibleCharge(law, 120, ppv)).toBeCloseTo(40, 8);
  });

  it('la calibración recupera K y β con la distancia escalada de Langefors', () => {
    const records: SeismographRecord[] = [];
    let i = 0;
    for (const r of [30, 60, 120, 250])
      for (const q of [10, 40, 90]) {
        const sd = scaledDistance(r, q, 'langefors');
        records.push({
          id: String(i++),
          date: '2026-10-20',
          zone: '',
          context: 'surface',
          charge: q,
          distance: r,
          ppv: 0.9 * Math.pow(sd, -1.3),
        });
      }
    const fit = fitVibrationLaw(records, 'langefors');
    expect(fit?.k).toBeCloseTo(0.9, 6);
    expect(fit?.beta).toBeCloseTo(1.3, 6);
  });
});

describe('selector de fragmentación', () => {
  const inputs: KuzRamInputs = {
    rockFactor: 7,
    loadingFactor: 0.45,
    chargePerHole: 300,
    rws: 1.3,
    burden: 5,
    spacing: 6,
    diameter: 0.165,
    drillDeviation: 0.2,
    chargeLength: 9,
    bottomChargeLength: 9,
    columnChargeLength: 0,
    benchHeight: 12,
    patternFactor: 1,
  };

  it('Cunningham 1987 es el de siempre y 2005 cambia X50 y n', () => {
    const r87 = kuzRam(inputs);
    expect(kuzRam({ ...inputs, variant: 'cunningham1987' })).toEqual(r87);
    const r05 = kuzRam({ ...inputs, variant: 'cunningham2005' });
    // RWS > 100: el exponente 19/20 baja X50.
    expect(r05.x50).toBeLessThan(r87.x50);
    expect(r05.n).not.toBeCloseTo(r87.n, 3);
  });

  it('banco con 2005 coincide con la fórmula de subterránea (n_s = 1, C = 1, L/H ≤ 1)', () => {
    const r05 = kuzRam({ ...inputs, variant: 'cunningham2005' });
    const ug = undergroundKuzRam(
      {
        zone: 'bench',
        mass: 300,
        loadingFactor: inputs.loadingFactor,
        chargePerHole: inputs.chargePerHole,
        burden: inputs.burden,
        spacing: inputs.spacing,
        diameter: inputs.diameter,
        chargeLength: inputs.chargeLength,
        holeLength: inputs.benchHeight,
        bottomChargeLength: inputs.bottomChargeLength,
        columnChargeLength: inputs.columnChargeLength,
      },
      inputs.rockFactor,
      { rws: inputs.rws, drillDeviation: inputs.drillDeviation, variant: 'cunningham2005' },
    );
    expect(r05.x50).toBeCloseTo(ug.x50, 10);
    expect(r05.n).toBeCloseTo(ug.n, 10);
  });

  it('la curva elegida cambia los percentiles informados', () => {
    const r = fragmentation(inputs, { oversizeSize: 1, finesSize: 0.01 });
    const sw = fragmentationHeadline(r, 'swebrec');
    const rr = fragmentationHeadline(r, 'rosinRammler');
    expect(sw.p80).toBe(r.p80.swebrec);
    expect(rr.p80).toBe(r.p80.rosinRammler);
    expect(sw.p80).not.toBeCloseTo(rr.p80, 4);
    expect(rr.fines).toBe(r.fines.rosinRammler);
  });
});
