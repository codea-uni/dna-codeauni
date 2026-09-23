import { turboRgb } from '@blastlab/core';
import { Color, SRGBColorSpace } from 'three';

/** Mapa turbo (ver core `turboRgb`), t ∈ [0, 1], como Color de Three (lineal). */
export function turbo(t: number, target = new Color()): Color {
  const [r, g, b] = turboRgb(t);
  return target.setRGB(r / 255, g / 255, b / 255, SRGBColorSpace);
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
