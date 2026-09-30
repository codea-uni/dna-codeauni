import { describe, expect, it } from 'vitest';
import { applyLocalGrid, fitLocalGrid, reprojectXyz } from './reproject';

describe('reproyección', () => {
  it('UTM 18S: el meridiano central (75° O) en el ecuador es E 500 000, N 10 000 000', () => {
    // Definición de UTM (NGA.SIG.0012_2.0.0_UTMUPS §2): falso Este 500 000 m y falso Norte
    // 10 000 000 m en el hemisferio sur; el origen de la zona 18 está en λ0 = −75°.
    const p = [-75, 0, 4250];
    reprojectXyz(p, 4326, 32718);
    expect(p[0]).toBeCloseTo(500_000, 3);
    expect(p[1]).toBeCloseTo(10_000_000, 3);
    expect(p[2]).toBe(4250); // la cota no se toca
  });

  it('UTM es simétrica respecto del meridiano central', () => {
    const p = [-75 - 1.2, -12, 0, -75 + 1.2, -12, 0];
    reprojectXyz(p, 4326, 32718);
    expect((p[0] ?? 0) + (p[3] ?? 0)).toBeCloseTo(1_000_000, 3);
    expect(p[1]).toBeCloseTo(p[4] ?? 0, 3);
  });

  it('PSAD56 ↔ WGS 84 (UTM 18S): ida y vuelta al centímetro y un corrimiento de datum de cientos de metros', () => {
    const orig = [345_678.25, 8_512_345.5, 4250];
    const p = [...orig];
    reprojectXyz(p, 24878, 32718);
    const shift = Math.hypot((p[0] ?? 0) - 345_678.25, (p[1] ?? 0) - 8_512_345.5);
    // El valor exacto se validará con un punto de control publicado (QUESTIONS §2, S-16).
    expect(shift).toBeGreaterThan(100);
    expect(shift).toBeLessThan(1000);
    reprojectXyz(p, 32718, 24878);
    // proj4 invierte el cambio de datum por iteración: el error de ida y vuelta es de milímetros.
    expect(Math.abs((p[0] ?? 0) - 345_678.25)).toBeLessThan(0.01);
    expect(Math.abs((p[1] ?? 0) - 8_512_345.5)).toBeLessThan(0.01);
  });

  it('un EPSG no cargado lanza', () => {
    expect(() => {
      reprojectXyz([0, 0, 0], 2000, 32718);
    }).toThrow(/no soportado/);
  });
});

describe('grilla local de mina (Helmert 2D + cota)', () => {
  // Transformación definida por el test: escala 1,0002, giro 30°, traslación y +3 m de cota.
  const s = 1.0002;
  const th = Math.PI / 6;
  const known = { a: s * Math.cos(th), b: s * Math.sin(th), tx: 345_000, ty: 8_512_000, dz: 3 };
  const toTarget = (x: number, y: number, z: number): [number, number, number] => [
    known.a * x - known.b * y + known.tx,
    known.b * x + known.a * y + known.ty,
    z + known.dz,
  ];
  const local: [number, number, number][] = [
    [0, 0, 100],
    [500, 0, 101],
    [500, 800, 99],
    [0, 800, 100],
  ];

  it('recupera la transformación con residuo nulo y la aplica', () => {
    const t = fitLocalGrid(local.map((l) => ({ local: l, target: toTarget(...l) })));
    expect(t.a).toBeCloseTo(known.a, 12);
    expect(t.b).toBeCloseTo(known.b, 12);
    expect(t.tx).toBeCloseTo(known.tx, 6);
    expect(t.ty).toBeCloseTo(known.ty, 6);
    expect(t.dz).toBeCloseTo(3, 12);
    expect(t.maxResidual).toBeLessThan(1e-6);
    const p = [250, 400, 50];
    applyLocalGrid(p, t);
    const [ex, ey, ez] = toTarget(250, 400, 50);
    expect(p[0]).toBeCloseTo(ex, 6);
    expect(p[1]).toBeCloseTo(ey, 6);
    expect(p[2]).toBeCloseTo(ez, 9);
  });

  it('con un punto de control desplazado reporta el residuo', () => {
    const pts = local.map((l) => ({ local: l, target: toTarget(...l) }));
    const first = pts[0];
    if (first) first.target = [first.target[0] + 0.4, first.target[1], first.target[2]];
    expect(fitLocalGrid(pts).maxResidual).toBeGreaterThan(0.1);
  });

  it('necesita dos puntos distintos', () => {
    expect(() => fitLocalGrid([{ local: [0, 0, 0], target: [1, 1, 1] }])).toThrow();
    expect(() =>
      fitLocalGrid([
        { local: [0, 0, 0], target: [1, 1, 1] },
        { local: [0, 0, 5], target: [2, 2, 2] },
      ]),
    ).toThrow();
  });
});
