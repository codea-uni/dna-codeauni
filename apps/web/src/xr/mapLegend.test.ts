import type { EnergyResult, VibrationResult } from '@cronos/core';
import type { XrLine, XrRow } from '@cronos/engine';
import { describe, expect, it } from 'vitest';
import { energyLegend, vibrationLegend } from './mapLegend';

const cells = (lines: XrLine[]): XrRow[] => lines.flatMap((l) => ('label' in l ? [l] : [...l]));

/** Resultado de vibración mínimo: solo lo que lee la leyenda (unidades SI, PPV en m/s). */
const vibration = {
  metric: 'ppv',
  law: { k: 1.14, beta: 1.6, scaling: 'square-root' },
  colorMin: 0.001,
  colorMax: 0.2,
  mic: 432.9,
  receivers: [
    { name: 'Planta', ppv: 0.0312, exceeds: true, limit: { ppvMax: 0.025 }, airblastDb: 120 },
    { name: 'Taller', ppv: 0.004, exceeds: false, limit: { ppvMax: 0.025 }, airblastDb: 110 },
  ],
} as unknown as VibrationResult;

describe('leyenda de los mapas en el visor', () => {
  it('vibración: escala en mm/s, ley del sitio, MIC y puntos con su límite', () => {
    const rows = cells(vibrationLegend(vibration));
    const labels = rows.map((r) => r.label);
    expect(rows.find((r) => r.bar)?.bar).toHaveLength(24);
    expect(labels).toContain('1,0 mm/s');
    expect(labels).toContain('200,0 mm/s');
    expect(labels).toContain('Ley del sitio: K = 1.140 mm/s · β = 1,60 · raíz cuadrada');
    expect(labels).toContain('Carga máx. por retardo: 432,9 kg');
    const planta = rows.find((r) => r.label.startsWith('Planta'));
    expect(planta?.label).toBe('Planta: 31,2 mm/s / 25');
    expect(planta?.swatch).toBe('#ef4444');
    expect(rows.find((r) => r.label.startsWith('Taller'))?.swatch).toBe('#22c55e');
  });

  it('energía: PPV de campo cercano con sus parámetros, máximo y área sobre las curvas', () => {
    const energy = {
      metric: 'nearFieldPpv',
      colorMin: 0.1,
      colorMax: 2,
      colorLog: true,
      max: 3.5,
      contourLevels: [0.25, 0.7, 1],
      areaAbove: [5000, 1200, 300],
    } as unknown as EnergyResult;
    const labels = cells(
      energyLegend(energy, {
        siteModels: { nearField: { k: 0.7, alpha: 0.7, beta: 1.5 } },
      } as never),
    ).map((r) => r.label);
    expect(labels).toContain('Holmberg–Persson: K = 700 mm/s · α = 0,70 · β = 1,50');
    expect(labels).toContain('Máximo: 3.500 mm/s');
    expect(labels).toContain('≥ 1.000 mm/s: 300 m²');
    expect(labels).toContain('≥ 700 mm/s: 1.200 m²');
  });
});
