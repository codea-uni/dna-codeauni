import type { FaceDesignResult, FaceHole, FaceHoleRole, UV } from '@cronos/core';
import type { ReactNode } from 'react';
import { useFormat, useT } from '../i18n';
import type { FaceComputation, RingComputation } from './model';

/**
 * Dibujos en el plano del frente y del anillo (SVG en metros, v hacia arriba → y = −v). Son la
 * vista previa del cálculo puro, no taladros del documento: el diseño en 3D lo dibuja el motor.
 */

export const ROLE_COLORS: Record<FaceHoleRole, string> = {
  relief: '#eef3f8',
  cut: '#ff6b6b',
  stoping: '#6f8cff',
  wall: '#72ad3a',
  roof: '#ffae00',
  contour: '#c792ff',
  lifter: '#2fc5d0',
};
export const ROLE_ORDER: readonly FaceHoleRole[] = [
  'relief',
  'cut',
  'stoping',
  'wall',
  'roof',
  'contour',
  'lifter',
];
const CHARGE_COLOR = '#ff8a4c';
const PROFILE_STROKE = '#8fa3b8';

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

const path = (pts: readonly UV[], close = true) =>
  pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.u.toFixed(4)},${(-p.v).toFixed(4)}`).join(' ') +
  (close ? ' Z' : '');

/** Barra de escala de 1, 2, 5 o 10 m según el ancho dibujado. */
function ScaleBar({ x, y, width, fs }: { x: number; y: number; width: number; fs: number }) {
  const t = useT();
  const n = [1, 2, 5, 10, 20].find((s) => s >= width / 6) ?? 20;
  return (
    <g className="ug-scale">
      <rect x={x} y={y} width={n / 2} height={fs * 0.35} fill={PROFILE_STROKE} />
      <rect
        x={x + n / 2}
        y={y}
        width={n / 2}
        height={fs * 0.35}
        fill="none"
        stroke={PROFILE_STROKE}
        vectorEffect="non-scaling-stroke"
      />
      <text x={x + n + fs * 0.4} y={y + fs * 0.4} fontSize={fs}>
        {t('ug.scale', { n })}
      </text>
    </g>
  );
}

function Svg({ box, label, children }: { box: Box; label: string; children: ReactNode }) {
  return (
    <svg
      className="ug-svg"
      role="img"
      aria-label={label}
      viewBox={`${box.minU.toFixed(3)} ${(-box.maxV).toFixed(3)} ${(box.maxU - box.minU).toFixed(3)} ${(box.maxV - box.minV).toFixed(3)}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {children}
    </svg>
  );
}

/** Polígono de cada sección del arranque (sus cuatro taladros en orden angular). */
function cutSquares(design: FaceDesignResult): UV[][] {
  const reliefs = design.holes.filter((h) => h.role === 'relief');
  const c = reliefs.length
    ? {
        u: reliefs.reduce((s, h) => s + h.collar.u, 0) / reliefs.length,
        v: reliefs.reduce((s, h) => s + h.collar.v, 0) / reliefs.length,
      }
    : { u: 0, v: 0 };
  return design.squares.map((sq) =>
    design.holes
      .filter((h) => h.role === 'cut' && h.square === sq.index)
      .map((h) => h.collar)
      .sort((a, b) => Math.atan2(a.v - c.v, a.u - c.u) - Math.atan2(b.v - c.v, b.u - c.u)),
  );
}

export function FaceDrawing({ face }: { face: FaceComputation }) {
  const t = useT();
  const fmt = useFormat();
  const { profile, design } = face;
  const pb = boxOf(profile.points);
  const extent = Math.max(pb.maxU - pb.minU, pb.maxV - pb.minV);
  const fs = extent / 34;
  const r = extent / 95;
  const box = {
    minU: pb.minU - extent * 0.12,
    maxU: pb.maxU + extent * 0.12,
    minV: pb.minV - extent * 0.2,
    maxV: pb.maxV + extent * 0.06,
  };
  const dimY = -pb.minV + extent * 0.07;
  const label = (h: FaceHole) =>
    h.delay === null ? null : (
      <text
        key={`l${String(h.index)}`}
        x={h.collar.u + r * 1.1}
        y={-h.collar.v - r * 1.1}
        fontSize={fs * 0.8}
        className="ug-delay"
      >
        {h.delay}
      </text>
    );
  return (
    <Svg box={box} label={t('ug.drawing.face')}>
      <path
        d={path(profile.points)}
        fill="rgba(143,163,184,0.07)"
        stroke={PROFILE_STROKE}
        strokeWidth={1.6}
        vectorEffect="non-scaling-stroke"
      />
      {cutSquares(design).map((sq, i) =>
        sq.length >= 3 ? (
          <path
            key={`sq${String(i)}`}
            d={path(sq)}
            fill="none"
            stroke={ROLE_COLORS.cut}
            strokeOpacity={0.55}
            strokeDasharray="4 3"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ) : null,
      )}
      {design.holes.map((h) =>
        h.role === 'relief' ? (
          <circle
            key={h.index}
            cx={h.collar.u}
            cy={-h.collar.v}
            r={Math.max(h.diameter / 2, r * 1.7)}
            fill="none"
            stroke={ROLE_COLORS.relief}
            strokeWidth={1.4}
            vectorEffect="non-scaling-stroke"
          />
        ) : (
          <g key={h.index}>
            {(h.toe.u !== h.collar.u || h.toe.v !== h.collar.v) && (
              <line
                x1={h.collar.u}
                y1={-h.collar.v}
                x2={h.toe.u}
                y2={-h.toe.v}
                stroke={ROLE_COLORS[h.role]}
                strokeOpacity={0.6}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            )}
            <circle cx={h.collar.u} cy={-h.collar.v} r={r} fill={ROLE_COLORS[h.role]}>
              <title>
                {`${t(`ug.role.${h.role}`)} · #${String(h.index)} · ${fmt(h.charge?.mass ?? 0, 2)} kg`}
              </title>
            </circle>
          </g>
        ),
      )}
      {design.holes.map(label)}
      <g className="ug-dim">
        <line
          x1={pb.minU}
          x2={pb.maxU}
          y1={dimY}
          y2={dimY}
          stroke={PROFILE_STROKE}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        <text x={(pb.minU + pb.maxU) / 2} y={dimY + fs * 1.3} fontSize={fs} textAnchor="middle">
          {`${fmt(profile.width, 2)} × ${fmt(profile.height, 2)} m · ${fmt(profile.area, 1)} m²`}
        </text>
      </g>
      <ScaleBar x={box.minU + extent * 0.04} y={-box.minV - fs * 1.2} width={extent} fs={fs} />
    </Svg>
  );
}

export function RingDrawing({ ring, ms }: { ring: RingComputation; ms: (s: number) => string }) {
  const t = useT();
  const { boundary, drive, pivot } = ring;
  const all = [...boundary, ...drive.points, ...ring.ring.holes.map((h) => h.toe)];
  const pb = boxOf(all);
  const extent = Math.max(pb.maxU - pb.minU, pb.maxV - pb.minV);
  const fs = extent / 42;
  const pad = extent * 0.07;
  const box = {
    minU: pb.minU - pad,
    maxU: pb.maxU + pad,
    minV: pb.minV - pad * 2,
    maxV: pb.maxV + pad,
  };
  return (
    <Svg box={box} label={t('ug.drawing.ring')}>
      <path
        d={path(boundary)}
        fill="rgba(255,174,0,0.05)"
        stroke={ROLE_COLORS.roof}
        strokeDasharray="6 4"
        strokeWidth={1.4}
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={path(drive.points)}
        fill="rgba(143,163,184,0.18)"
        stroke={PROFILE_STROKE}
        strokeWidth={1.4}
        vectorEffect="non-scaling-stroke"
      />
      {ring.ring.holes.map((h) => {
        const du = (h.toe.u - h.collar.u) / h.length;
        const dv = (h.toe.v - h.collar.v) / h.length;
        const start = {
          u: h.collar.u + du * h.unchargedCollar,
          v: h.collar.v + dv * h.unchargedCollar,
        };
        return (
          <g key={h.index}>
            <line
              x1={h.collar.u}
              y1={-h.collar.v}
              x2={start.u}
              y2={-start.v}
              stroke={PROFILE_STROKE}
              strokeOpacity={0.7}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1={start.u}
              y1={-start.v}
              x2={h.toe.u}
              y2={-h.toe.v}
              stroke={CHARGE_COLOR}
              strokeWidth={3}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            >
              <title>{`#${String(h.index)} · ${h.length.toFixed(1)} m`}</title>
            </line>
            <circle
              cx={h.toe.u}
              cy={-h.toe.v}
              r={fs * 0.25}
              fill={h.truncated ? '#ed8279' : '#eef3f8'}
            />
            <text
              x={h.toe.u + du * fs * 1.2}
              y={-(h.toe.v + dv * fs * 1.2)}
              fontSize={fs * 0.85}
              textAnchor="middle"
              dominantBaseline="middle"
              className="ug-delay"
            >
              {ms(h.delay)}
            </text>
          </g>
        );
      })}
      <g>
        <circle
          cx={pivot.u}
          cy={-pivot.v}
          r={fs * 0.35}
          fill="#08151f"
          stroke="#eef3f8"
          strokeWidth={1.2}
          vectorEffect="non-scaling-stroke"
        >
          <title>{t('ug.pivot')}</title>
        </circle>
      </g>
      <ScaleBar x={box.minU + pad} y={-box.minV - fs * 1.4} width={extent} fs={fs} />
    </Svg>
  );
}
