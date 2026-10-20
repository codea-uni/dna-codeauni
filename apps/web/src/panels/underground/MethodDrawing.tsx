import type { MethodDesign, MethodHole, MethodHoleRole, MethodView, P3, UV } from '@cronos/core';
import { useFormat, useT } from '../../i18n';
import { ROLE_COLORS } from '../../underground/drawings';

/**
 * Dibujo de una plantilla por método de minado: cada vista (sección, planta o perfil) proyecta los
 * taladros del diseño en sus dos ejes. Un taladro que se ve de punta es un punto (alivio: círculo
 * hueco a escala); uno que se ve de lado es una línea con la carga en naranja. SVG en metros con
 * el eje vertical hacia arriba (y = −v).
 */

export const METHOD_ROLE_COLORS: Record<MethodHoleRole, string> = {
  ...ROLE_COLORS,
  longhole: '#6f8cff',
  ring: '#ffae00',
  slot: '#ff9f6b',
  crater: '#c792ff',
  breast: '#6f8cff',
  upper: '#72ad3a',
};

const CHARGE = '#ff8a4c';
const STROKE = '#8fa3b8';
const FREE_FACE = '#2fc5d0';

function project(view: MethodView, p: P3): UV {
  const [a, b] = view.axes;
  return { u: p[a], v: p[b] };
}

/** Tramos cargados de un taladro como fracciones [desde, hasta] medidas desde la boca. */
function chargeSpans(h: MethodHole): [number, number][] {
  const out: [number, number][] = [];
  let fromToe = 0;
  for (const d of h.decks) {
    if (d.kind === 'charge' && h.length > 0)
      out.push([1 - (fromToe + d.length) / h.length, 1 - fromToe / h.length]);
    fromToe += d.length;
  }
  return out;
}

interface Box {
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
}

function boxOf(points: readonly UV[]): Box {
  const b = { minU: Infinity, maxU: -Infinity, minV: Infinity, maxV: -Infinity };
  for (const p of points) {
    b.minU = Math.min(b.minU, p.u);
    b.maxU = Math.max(b.maxU, p.u);
    b.minV = Math.min(b.minV, p.v);
    b.maxV = Math.max(b.maxV, p.v);
  }
  return b;
}

const path = (pts: readonly UV[], close: boolean) =>
  pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.u.toFixed(3)},${(-p.v).toFixed(3)}`).join(' ') +
  (close ? ' Z' : '');

/** Taladros que se dibujan en la vista: en el frente de un abanico, solo el primer anillo. */
function viewHoles(design: MethodDesign, view: MethodView): MethodHole[] {
  return design.ring && view.id === 'front'
    ? design.holes.filter((h) => h.group === 0)
    : design.holes;
}

export function MethodView2D({
  design,
  view,
  thumb = false,
}: {
  design: MethodDesign;
  view: MethodView;
  thumb?: boolean;
}) {
  const t = useT();
  const fmt = useFormat();
  const holes = viewHoles(design, view);
  const segs = holes.map((h) => ({ h, a: project(view, h.collar), b: project(view, h.toe) }));
  const all = [...view.outlines.flatMap((o) => o.points), ...segs.flatMap((s) => [s.a, s.b])];
  const pb = boxOf(all);
  const extent = Math.max(pb.maxU - pb.minU, pb.maxV - pb.minV, 0.5);
  const pad = extent * (thumb ? 0.06 : 0.08);
  const box = {
    minU: pb.minU - pad,
    maxU: pb.maxU + pad,
    minV: pb.minV - pad * (thumb ? 1 : 1.8),
    maxV: pb.maxV + pad,
  };
  const fs = extent / 30;
  const r = extent / (thumb ? 60 : 95);
  const labels = !thumb && holes.length <= 70;
  return (
    <svg
      className={thumb ? 'ugm-thumb-svg' : 'ug-svg ugm-svg'}
      role="img"
      aria-label={t(`ugm.view.${view.id}`)}
      viewBox={`${box.minU.toFixed(3)} ${(-box.maxV).toFixed(3)} ${(box.maxU - box.minU).toFixed(3)} ${(box.maxV - box.minV).toFixed(3)}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {view.outlines.map((o, i) => (
        <path
          key={`o${String(i)}`}
          d={path(o.points, o.closed)}
          fill={
            o.kind === 'excavation' || o.kind === 'drive'
              ? 'rgba(143,163,184,0.12)'
              : o.kind === 'stope'
                ? 'rgba(255,174,0,0.05)'
                : 'none'
          }
          stroke={o.kind === 'freeFace' ? FREE_FACE : o.kind === 'stope' ? '#ffae00' : STROKE}
          strokeDasharray={
            o.kind === 'stope'
              ? '6 4'
              : o.kind === 'freeFace'
                ? '3 3'
                : o.kind === 'lift'
                  ? '2 3'
                  : undefined
          }
          strokeWidth={o.kind === 'freeFace' ? 2 : 1.3}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {segs.map(({ h, a, b }) => {
        const len = Math.hypot(b.u - a.u, b.v - a.v);
        const color = METHOD_ROLE_COLORS[h.role];
        if (len < extent * 0.02) {
          return h.role === 'relief' ? (
            <circle
              key={h.index}
              cx={a.u}
              cy={-a.v}
              r={Math.max(h.diameter / 2, r * 1.6)}
              fill="none"
              stroke={color}
              strokeWidth={1.3}
              vectorEffect="non-scaling-stroke"
            />
          ) : (
            <circle key={h.index} cx={a.u} cy={-a.v} r={r} fill={color}>
              <title>{`#${String(h.index)} · ${fmt(h.mass, 1)} kg`}</title>
            </circle>
          );
        }
        const at = (f: number) => ({ u: a.u + (b.u - a.u) * f, v: a.v + (b.v - a.v) * f });
        return (
          <g key={h.index}>
            <line
              x1={a.u}
              y1={-a.v}
              x2={b.u}
              y2={-b.v}
              stroke={h.role === 'relief' ? color : STROKE}
              strokeOpacity={h.role === 'relief' ? 0.9 : 0.6}
              strokeWidth={h.role === 'relief' ? 2 : 1}
              vectorEffect="non-scaling-stroke"
            />
            {chargeSpans(h).map(([f0, f1], k) => {
              const p = at(f0);
              const q = at(f1);
              return (
                <line
                  key={k}
                  x1={p.u}
                  y1={-p.v}
                  x2={q.u}
                  y2={-q.v}
                  stroke={CHARGE}
                  strokeWidth={thumb ? 2 : 3}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                >
                  <title>{`#${String(h.index)} · ${fmt(h.length, 1)} m · ${fmt(h.mass, 1)} kg`}</title>
                </line>
              );
            })}
            <circle cx={a.u} cy={-a.v} r={r * 0.8} fill={color} />
          </g>
        );
      })}
      {labels &&
        segs.map(({ h, a, b }) => {
          if (h.delay === null) return null;
          const len = Math.hypot(b.u - a.u, b.v - a.v);
          const p = len < extent * 0.02 ? a : b;
          return (
            <text
              key={`l${String(h.index)}`}
              x={p.u + r * 1.1}
              y={-p.v - r * 1.1}
              fontSize={fs * 0.7}
              className="ug-delay"
            >
              {fmt(h.delay * 1000, 0)}
            </text>
          );
        })}
      {!thumb && (
        <text x={box.minU + pad * 0.5} y={-box.minV - pad * 0.5} fontSize={fs}>
          {`${t(`ugm.view.${view.id}`)} · ${fmt(pb.maxU - pb.minU, 1)} × ${fmt(pb.maxV - pb.minV, 1)} m`}
        </text>
      )}
    </svg>
  );
}

/** Todas las vistas del diseño, una al lado de la otra. */
export function MethodDrawing({ design }: { design: MethodDesign }) {
  return (
    <div className={`ugm-views n${String(design.views.length)}`}>
      {design.views.map((v) => (
        <div key={v.id} className="ug-drawing">
          <MethodView2D design={design} view={v} />
        </div>
      ))}
    </div>
  );
}
