import { describe, expect, it } from 'vitest';
import type { Hole, HoleId } from '@cronos/core';
import { BuildReveal, drillOrder } from './BuildReveal';

const hole = (id: string, row?: number, col?: number): Hole =>
  ({ id: id as HoleId, label: id, ...(row !== undefined ? { row, col } : {}) }) as Hole;

describe('pintado en vivo', () => {
  it('orden de perforadora: fila por fila, en zigzag, y al final los sin fila', () => {
    const holes = [
      hole('x'),
      hole('b2', 2, 1),
      hole('a1', 1, 1),
      hole('a2', 1, 2),
      hole('b1', 2, 2),
    ];
    expect(drillOrder(holes).map((h) => h.label)).toEqual(['a1', 'a2', 'b1', 'b2', 'x']);
  });

  it('cada taladro empieza oculto, se perfora y termina completo', () => {
    const b = new BuildReveal();
    const a = 'a' as HoleId;
    const z = 'z' as HoleId;
    b.schedule(
      [
        { id: a, filled: true },
        { id: z, filled: false },
      ],
      'drill',
      1000,
    );
    expect(b.active).toBe(true);
    expect(b.hidden(z, 1000)).toBe(true);
    expect(b.reveal(a, 1000)).toMatchObject({ drill: 0, fill: 0, started: true });
    const mid = b.reveal(a, 1200);
    expect(mid.drill).toBeGreaterThan(0);
    expect(mid.drill).toBeLessThan(1);
    // Perforado y todavía sin carga; después se llena desde el fondo.
    expect(b.reveal(a, 1420)).toMatchObject({ drill: 1, fill: 0 });
    expect(b.reveal(a, 1700).fill).toBeGreaterThan(0);
    expect(b.advance(1000).started).toContain(a);
    expect(b.advance(1001).started).not.toContain(a);
    b.advance(20_000);
    expect(b.active).toBe(false);
    expect(b.reveal(a, 20_000)).toEqual({ drill: 1, fill: 1, flash: 0, started: true });
  });

  it('un lote nuevo espera al anterior y el amarre va al final', () => {
    const b = new BuildReveal();
    b.schedule([{ id: 'a' as HoleId, filled: false }], 'drill', 0);
    b.schedule([{ id: 'c' as HoleId, filled: true }], 'charge', 0);
    expect(b.hidden('c' as HoleId, 0)).toBe(false);
    expect(b.reveal('c' as HoleId, 0).fill).toBe(0);
    b.scheduleTie(10, 0);
    expect(b.tieProgress(0)).toBe(0);
    expect(b.tieProgress(100_000)).toBe(1);
  });

  it('el taladro que se dibuja ahora es el último que empezó', () => {
    const b = new BuildReveal();
    const ids = ['1', '2', '3'].map((x) => ({ id: x as HoleId, filled: false }));
    b.schedule(ids, 'drill', 0);
    expect(b.current(0)).toBe('1');
    expect(b.current(1e9)).toBe('3');
  });

  it('onda de tiempos: destella en orden de disparo sin ocultar el taladro', () => {
    const b = new BuildReveal();
    b.schedulePulse(
      [
        { id: 'tarde' as HoleId, at: 0.5 },
        { id: 'pronto' as HoleId, at: 0 },
      ],
      0,
    );
    expect(b.hidden('tarde' as HoleId, 0)).toBe(false);
    expect(b.reveal('pronto' as HoleId, 10).flash).toBeGreaterThan(0.9);
    expect(b.reveal('tarde' as HoleId, 10).flash).toBe(0);
    expect(b.advance(10).pulsed).toEqual(['pronto']);
    b.advance(1e6);
    expect(b.active).toBe(false);
  });

  it('un perímetro nuevo se traza antes que sus taladros', () => {
    const b = new BuildReveal();
    const square = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    b.scheduleTrace(square, 'add', 0);
    b.schedule([{ id: 'h' as HoleId, filled: false }], 'drill', 0);
    const [tr] = b.traces(100);
    expect(tr?.progress).toBeGreaterThan(0);
    expect(tr?.progress).toBeLessThan(1);
    expect(b.hidden('h' as HoleId, 100)).toBe(true);
    b.advance(1e6);
    expect(b.traces(1e6)).toHaveLength(0);
  });
});
