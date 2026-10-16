import type { Blast } from '@cronos/core';
import { describe, expect, it } from 'vitest';
import { clearRecordedSteps, recordedSteps, recordStep } from './steps';
import { expandLabels, findByName, normName, orderToolCalls } from './tools';

const blast = {
  holes: ['8', '153', '154', '160', '166', '170'].map((label) => ({ label })),
} as unknown as Blast;

describe('lo que se dice por voz llega a los objetos correctos', () => {
  it('rangos y prefijos de etiquetas', () => {
    expect([...expandLabels(blast, ['153–166']).found]).toEqual(['153', '154', '160', '166']);
    expect([...expandLabels(blast, ['153 a 160', 'B8']).found]).toEqual(['153', '154', '160', '8']);
    expect(expandLabels(blast, ['900-910']).missing).toEqual(['900-910']);
  });

  it('nombres sin tildes, mayúsculas ni signos, y parciales únicos', () => {
    const list = [
      { id: 'a', name: 'Perímetro 1' },
      { id: 'b', name: 'Perímetro 2 · desmonte' },
      { id: 'c', name: 'Perímetro 2 · mineral' },
    ];
    expect(normName('Perímetro 2 · desmonte')).toBe('perimetro 2 desmonte');
    expect(findByName(list, 'Perímetro 2 . desmonte')?.id).toBe('b');
    expect(findByName(list, 'mineral')?.id).toBe('c');
    // «Perímetro 2» es ambiguo: no adivina.
    expect(findByName(list, 'perimetro 2')).toBeUndefined();
  });

  it('ejecuta la malla antes que la carga y el amarre aunque el modelo los pida al revés', () => {
    const calls = [
      'predict_results',
      'set_charge',
      'set_electronic_timing',
      'generate_pattern',
      'create_perimeter',
    ].map((name) => ({ name }));
    expect(orderToolCalls(calls).map((c) => c.name)).toEqual([
      'create_perimeter',
      'generate_pattern',
      'set_charge',
      'set_electronic_timing',
      'predict_results',
    ]);
  });
});

describe('pasos para un preset', () => {
  it('guarda lo último sin perímetro ni taladros puntuales; una malla nueva descarta la carga vieja', () => {
    clearRecordedSteps();
    recordStep('set_charge', { target: { labels: ['1'] }, column_explosive: 'ANFO' });
    recordStep('generate_pattern', { perimeter: 'Perímetro 1', burden: 5, spacing: 6 });
    recordStep('set_charge', {
      target: { perimeter: 'Perímetro 1', all: true },
      column_explosive: 'Emulsión',
    });
    recordStep('set_charge', { target: { group: 'precorte' }, column_explosive: 'Emulsión' });
    recordStep('set_tie_up', { mode: 'v', perimeter: 'Perímetro 1' });
    recordStep('set_electronic_timing', { inter_hole_ms: 17, inter_row_ms: 42 });
    recordStep('get_design', {});
    expect(recordedSteps()).toEqual([
      { tool: 'generate_pattern', args: { burden: 5, spacing: 6 } },
      { tool: 'set_charge', args: { target: { all: true }, column_explosive: 'Emulsión' } },
      { tool: 'set_charge', args: { target: { group: 'precorte' }, column_explosive: 'Emulsión' } },
      { tool: 'set_electronic_timing', args: { inter_hole_ms: 17, inter_row_ms: 42 } },
    ]);
  });
});
