/**
 * Rotación (grados CSS, horario) de la aguja Norte en pantalla.
 * Planta: Norte arriba (0°). 3D: la cámara mira con rumbo yaw + π, así que el Norte gira −(yaw + π).
 */
export function compassRotationDeg(mode: 'plan' | '3d', yaw: number): number {
  if (mode === 'plan') return 0;
  const deg = (-(yaw + Math.PI) * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}
