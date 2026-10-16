import { describe, expect, it } from 'vitest';
import { costUsd, DailyCap, tokensOf } from './aiUsage';

describe('costo de la IA', () => {
  it('cobra el razonamiento como salida y lo cacheado al 10 %', () => {
    const t = tokensOf({
      promptTokenCount: 10_000,
      cachedContentTokenCount: 8_000,
      candidatesTokenCount: 100,
      thoughtsTokenCount: 400,
    });
    // 2k × 0,75 + 8k × 0,075 + 500 × 3,75 (USD por millón) en Flash.
    expect(costUsd('gemini-flash-latest', t)).toBeCloseTo(0.003975, 6);
    expect(costUsd('gemini-3.1-flash-lite', t)).toBeLessThan(costUsd('gemini-3.8-flash', t));
  });

  it('el tope diario corta por tarea y se reinicia al cambiar de día', () => {
    let now = Date.parse('2026-10-16T10:00:00Z');
    const cap = new DailyCap({ chat: 2 }, () => now);
    expect([cap.take('chat'), cap.take('chat'), cap.take('chat')]).toEqual([true, true, false]);
    expect(cap.take('speech')).toBe(true);
    now = Date.parse('2026-10-17T00:00:01Z');
    expect(cap.take('chat')).toBe(true);
  });
});
