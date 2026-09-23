/**
 * Mapa de color "turbo" (Google; aproximación polinómica de Mikhailov, 2019) en sRGB 0–255.
 * Vive en core porque lo usan el render (engine) y los reportes, y los rasters se colorean en el worker.
 */
export function turboRgb(t: number): [number, number, number] {
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
  const c = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);
  return [c(r), c(g), c(b)];
}
