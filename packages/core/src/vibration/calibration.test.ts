import { describe, expect, it } from 'vitest';
import {
  fitByZone,
  fitVibrationLaw,
  lawFromFit,
  parseSeismographCsv,
  recordDistance,
  studentT95,
  type SeismographRecord,
} from './calibration';

/** Mediciones sintéticas exactas de PPV = K · (R/√W)^−β. */
function synthetic(
  k: number,
  beta: number,
  zone = 'Norte',
  context: SeismographRecord['context'] = 'surface',
  noise: readonly number[] = [],
): SeismographRecord[] {
  const out: SeismographRecord[] = [];
  let i = 0;
  for (const w of [5, 20, 80])
    for (const r of [15, 40, 90, 200]) {
      const ppv =
        k * Math.pow(r / Math.sqrt(w), -beta) * Math.pow(10, noise[i % noise.length] ?? 0);
      out.push({
        id: `m${String(i++)}`,
        date: '2026-10-01',
        zone,
        context,
        charge: w,
        distance: r,
        ppv,
      });
    }
  return out;
}

describe('calibración de la ley de vibración (factor de terreno)', () => {
  it('recupera K y β conocidos con datos exactos (R² = 1)', () => {
    const fit = fitVibrationLaw(synthetic(1.14, 1.6), 'square-root');
    if (!fit) throw new Error('sin ajuste');
    expect(fit.k).toBeCloseTo(1.14, 9);
    expect(fit.beta).toBeCloseTo(1.6, 9);
    expect(fit.r2).toBeCloseTo(1, 12);
    expect(fit.n).toBe(12);
    expect(fit.stdError).toBeCloseTo(0, 9);
    expect(fit.k95).toBeCloseTo(fit.k, 9);
  });

  it('con dispersión: K95 = K50 · 10^(t·s) y K, β cerca de los verdaderos', () => {
    // Ruido simétrico de ±0,1 en log10 (media 0): el ajuste queda cerca.
    const noise = [0.1, -0.1, 0.05, -0.05, 0, 0.08, -0.08, 0.02, -0.02, 0.1, -0.1, 0];
    const fit = fitVibrationLaw(synthetic(0.8, 1.5, 'Sur', 'surface', noise), 'square-root');
    if (!fit) throw new Error('sin ajuste');
    expect(fit.beta).toBeGreaterThan(1.35);
    expect(fit.beta).toBeLessThan(1.65);
    expect(fit.k).toBeGreaterThan(0.5);
    expect(fit.k).toBeLessThan(1.3);
    expect(fit.r2).toBeGreaterThan(0.9);
    expect(fit.stdError).toBeGreaterThan(0);
    expect(fit.k95 / fit.k).toBeCloseTo(Math.pow(10, studentT95(10) * fit.stdError), 9);
    expect(studentT95(10)).toBe(1.812);
    expect(studentT95(100)).toBe(1.645);
  });

  it('raíz cúbica: recupera la ley con SD = R / W^⅓', () => {
    const recs = synthetic(1, 1).map((r) => ({
      ...r,
      ppv: 2.5 * Math.pow((r.distance ?? 0) / Math.cbrt(r.charge), -1.7),
    }));
    const fit = fitVibrationLaw(recs, 'cube-root');
    expect(fit?.k).toBeCloseTo(2.5, 9);
    expect(fit?.beta).toBeCloseTo(1.7, 9);
  });

  it('menos de 3 mediciones o sin dispersión en SD: sin ajuste', () => {
    expect(fitVibrationLaw(synthetic(1, 1.5).slice(0, 2), 'square-root')).toBeNull();
    const first = synthetic(1, 1.5)[0];
    if (!first) throw new Error('sin datos');
    const same = [0, 1, 2].map((i) => ({ ...first, id: String(i) }));
    expect(fitVibrationLaw(same, 'square-root')).toBeNull();
  });

  it('por zona y tipo: superficial y subterránea por separado; ley del proyecto', () => {
    const recs = [
      ...synthetic(1.14, 1.6, 'Norte'),
      ...synthetic(0.6, 1.3, 'Nivel 3370', 'underground'),
      ...synthetic(0.7, 1.35, 'Nivel 3420', 'underground'),
    ];
    const fits = fitByZone(recs);
    const key = fits.map((f) => `${f.context}:${f.zone}`);
    expect(key).toEqual([
      'surface:Norte',
      'underground:',
      'underground:Nivel 3370',
      'underground:Nivel 3420',
    ]);
    const n3370 = fits.find((f) => f.zone === 'Nivel 3370')?.squareRoot;
    if (!n3370) throw new Error('sin ajuste');
    expect(n3370.k).toBeCloseTo(0.6, 9);
    const law = lawFromFit(n3370, { zone: 'Nivel 3370', context: 'underground', level: 95 });
    expect(law).toMatchObject({ context: 'underground', beta: n3370.beta, confidence: 0.95 });
    expect(law.fit).toEqual({ zone: 'Nivel 3370', n: 12, r2: n3370.r2 });
  });

  it('CSV con punto y coma, coma decimal y coordenadas (distancia 3D)', () => {
    const csv = [
      'Fecha;Sector;Tipo;Carga (kg);Distancia (m);PPV (mm/s);Frecuencia (Hz)',
      '2026-09-01;Norte;Superficial;120,5;150;12,3;14',
      '2026-09-02;Nivel 3370;Subterránea;8;;45;80',
      '2026-09-03;Norte;tajo;0;100;3;',
    ].join('\n');
    const r = parseSeismographCsv(csv);
    expect(r.records).toHaveLength(1);
    expect(r.records[0]).toMatchObject({
      zone: 'Norte',
      context: 'surface',
      charge: 120.5,
      distance: 150,
      frequency: 14,
    });
    expect(r.records[0]?.ppv).toBeCloseTo(0.0123, 12);
    expect(r.errors.map((e) => e.line)).toEqual([3, 4]);

    const xyz = parseSeismographCsv(
      'zona,tipo,carga,ppv,voladura_x,voladura_y,voladura_z,geofono_x,geofono_y,geofono_z\nN3370,UG,10,50,0,0,-200,30,40,-200',
    );
    const rec = xyz.records[0];
    if (!rec) throw new Error('sin registro');
    expect(rec.context).toBe('underground');
    expect(recordDistance(rec)).toBeCloseTo(50, 12);
    expect(parseSeismographCsv('a,b\n1,2').errors[0]?.reason).toMatch(/columnas/);
  });
});
