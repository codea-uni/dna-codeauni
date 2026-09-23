import { Color } from 'three';

/**
 * Mapa de color "turbo" (Google, aproximación polinómica de Mikhailov 2019), t ∈ [0, 1].
 * Perceptualmente ordenado y legible sobre fondo oscuro.
 */
export function turbo(t: number, target = new Color()): Color {
  const x = Math.min(1, Math.max(0, t));
  const r =
    0.13572138 +
    x *
      (4.6153926 + x * (-42.66032258 + x * (132.13108234 + x * (-152.94239396 + x * 59.28637943))));
  const g =
    0.09140261 +
    x * (2.19418839 + x * (4.84296658 + x * (-14.18503333 + x * (4.27729857 + x * 2.82956604))));
  const b =
    0.1066733 +
    x *
      (12.64194608 +
        x * (-60.58204836 + x * (110.36276771 + x * (-89.90310912 + x * 27.34824973))));
  // Los coeficientes están en sRGB; Three trabaja en lineal.
  return target.setRGB(
    Math.min(1, Math.max(0, r)),
    Math.min(1, Math.max(0, g)),
    Math.min(1, Math.max(0, b)),
    'srgb',
  );
}

/** Color CSS (sRGB) del mapa turbo, para leyendas en la UI. */
export function turboCss(t: number): string {
  return `#${turbo(t).getHexString()}`;
}

/** Colores fijos por retardo de conector de superficie (convención visual habitual). */
const CONNECTOR_STEPS: [number, number][] = [
  [0.0095, 0x39c5cf], // ≤ 9 ms
  [0.0175, 0x3fb950], // 17 ms
  [0.0255, 0xd2e04a], // 25 ms
  [0.0425, 0xffa94d], // 42 ms
  [0.0675, 0xff6b6b], // 65–67 ms
  [0.1005, 0xe05ce6], // 100 ms
];

export function connectorColorHex(delay: number): number {
  for (const [limit, hex] of CONNECTOR_STEPS) if (delay <= limit) return hex;
  return 0xa371f7;
}

export function connectorColorCss(delay: number): string {
  return `#${connectorColorHex(delay).toString(16).padStart(6, '0')}`;
}
