/**
 * Curvas de nivel decorativas del login: anillos concéntricos deformados como un cerro visto en
 * planta. Se generan una vez (sin imagen) y son `aria-hidden`: no aportan información.
 */
const RINGS = 9;
const STEPS = 72;

function ring(r: number, k: number): string {
  const pts: string[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const a = (i / STEPS) * Math.PI * 2;
    // Deformación suave y distinta por anillo: lóbulos de 3 y 5 que giran con la altura.
    const rr = r * (1 + 0.13 * Math.sin(3 * a + k * 0.55) + 0.06 * Math.sin(5 * a - k * 0.9));
    pts.push(
      `${(500 + rr * Math.cos(a)).toFixed(1)} ${(500 + rr * 0.78 * Math.sin(a)).toFixed(1)}`,
    );
  }
  return `M${pts.join('L')}Z`;
}

const PATHS = Array.from({ length: RINGS }, (_, i) => ring(60 + i * 52, i));

export function Contours() {
  return (
    <svg className="auth-contours" viewBox="0 0 1000 1000" aria-hidden focusable="false">
      {PATHS.map((d, i) => (
        <path key={d} d={d} style={{ opacity: 0.55 - i * 0.05 }} />
      ))}
    </svg>
  );
}
