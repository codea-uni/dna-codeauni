import { useT } from '../i18n';

/**
 * Ilustración del login: una malla de voladura en planta (tres bolillos, 5 filas × 9) con su cara
 * libre abajo, que se enciende una sola vez siguiendo su secuencia de disparo en V desde el centro
 * de la primera fila. Los tiempos son ilustrativos (17 ms entre taladros, 42 ms entre filas), no
 * un diseño recomendado. Con movimiento reducido se muestra directamente el estado final.
 */
const ROWS = 5;
const COLS = 9;
const BURDEN = 46;
const SPACING = 52;
const HOLE_MS = 17;
const ROW_MS = 42;
/** La animación dura ~2,6 s: cada ms de retardo se muestra como 7 ms reales. */
const SLOW_DOWN = 7;

interface Hole {
  x: number;
  y: number;
  ms: number;
}

const holes: Hole[] = [];
for (let r = 0; r < ROWS; r++)
  for (let c = 0; c < COLS; c++) {
    const stagger = r % 2 === 1 ? SPACING / 2 : 0;
    holes.push({
      x: 40 + c * SPACING + stagger,
      y: 300 - r * BURDEN,
      ms: r * ROW_MS + Math.abs(c - (COLS - 1) / 2) * HOLE_MS,
    });
  }
const width = 40 * 2 + (COLS - 1) * SPACING + SPACING / 2;
const lastMs = Math.max(...holes.map((h) => h.ms));

/** Color final según el tiempo de disparo: mezcla en OKLab del ámbar (primeros) al crisocola. */
function firedColor(ms: number): string {
  const late = Math.round((ms / lastMs) * 100);
  return `color-mix(in oklab, var(--accent) ${String(late)}%, var(--amber))`;
}

export function BlastSequence() {
  const t = useT();
  return (
    <svg
      className="blast-sequence"
      viewBox={`0 0 ${width} 360`}
      role="img"
      aria-label={t('auth.heroAlt')}
    >
      {/* Cara libre: cresta del banco hacia donde se desplaza el material */}
      <path className="free-face" d={`M 12 336 L ${width - 12} 336`} />
      <path className="free-face-hatch" d={hatch(width)} />
      {holes.map((h) => (
        <g
          key={`${h.x}-${h.y}`}
          className="hole"
          style={
            {
              animationDelay: `${String(Math.round(h.ms * SLOW_DOWN))}ms`,
              '--fired': firedColor(h.ms),
            } as React.CSSProperties
          }
          transform={`translate(${h.x} ${h.y})`}
        >
          <circle className="hole-ring" r={11} />
          <circle className="hole-core" r={6} />
          <text className="hole-ms" y={-15} textAnchor="middle">
            {Math.round(h.ms)}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Marcas cortas bajo la cara libre (convención de talud en planos). */
function hatch(w: number): string {
  let d = '';
  for (let x = 20; x < w - 12; x += 14) d += `M ${x} 336 L ${x - 6} 346 `;
  return d;
}
