/* eslint-disable @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unsafe-assignment -- datos de prueba fijos */
import { createHole, DEFAULT_BENCH, DEFAULT_HOLE_TEMPLATE } from '@cronos/core';
import { describe, expect, it } from 'vitest';
import { resolveHole, resolveHoleArguments, resolveHoleLabels } from './holeResolution';

const holes = Array.from({ length: 725 }, (_, i) =>
  createHole({
    position: { x: i, y: 0 },
    template: DEFAULT_HOLE_TEMPLATE,
    bench: DEFAULT_BENCH,
    label: String(1672 + i),
  }),
);

describe('resolución compartida de etiquetas', () => {
  it('resuelve el caso del visor: posición 500 de 725, etiqueta 2171', () => {
    expect(resolveHole(holes, '500')).toMatchObject({
      hole: holes[499],
      resolved_label: '2171',
      resolution_note: expect.stringContaining('posición 500'),
    });
  });
  it('prioriza la etiqueta exacta sobre la posición, incluso alfanumérica', () => {
    const list = [
      { ...holes[0]!, label: '2' },
      { ...holes[1]!, label: 'B2' },
    ];
    expect(resolveHole(list, '2').hole).toBe(list[0]);
    expect(resolveHole(list, 'B2').hole).toBe(list[1]);
    expect(resolveHole(list, 'taladro 2').hole).toBe(list[0]);
    expect(resolveHole(holes, '1672').resolution_note).toBeUndefined();
  });
  it('no ordena la malla por etiqueta para resolver posiciones', () => {
    expect(resolveHole([holes[9]!, holes[0]!], '2').hole).toBe(holes[0]);
  });
  it.each(['0', '-1', '726', '500.5', '', 'inexistente'])(
    'rechaza %s e informa el rango real',
    (label) => {
      expect(() => resolveHole(holes, label)).toThrow('1672 a 2396');
    },
  );
  it('informa una malla vacía', () => {
    expect(() => resolveHole([], '1')).toThrow('No hay taladros');
  });
  it('resuelve rangos y conserva huecos, sin bucles proporcionales al número solicitado', () => {
    expect([...resolveHoleLabels(holes, ['1–3']).found]).toEqual(['1672', '1673', '1674']);
    expect([...resolveHoleLabels([holes[0]!, holes[2]!], ['1672–1674']).found]).toEqual([
      '1672',
      '1674',
    ]);
    expect(resolveHoleLabels(holes, ['999999999-99999999999']).missing).toHaveLength(1);
  });
  it('focus, cámara, inicio, filtros y retardos devuelven la misma etiqueta y nota', () => {
    for (const args of [
      { hole: '500' },
      { start_label: '500' },
      { holes: { labels: ['500'] } },
      { target: { labels: ['500'] } },
      { delays: [{ label: '500', delay_ms: 42 }] },
    ]) {
      expect(resolveHoleArguments(holes, args).metadata).toMatchObject({
        resolved_label: '2171',
        resolution_note: expect.stringContaining('posición 500'),
      });
    }
  });
});
