import {
  DEFAULT_NEAR_FIELD,
  turboRgb,
  type EnergyResult,
  type Project,
  type VibrationResult,
} from '@cronos/core';
import type { XrLine } from '@cronos/engine';
import { formatNumber, t } from '../i18n';

/** Tramos de la escala de colores (turbo, como los mapas). */
const STEPS = 24;
/** Puntos de control que entran en el panel. */
const MAX_POINTS = 4;

const OK = '#22c55e';
const BAD = '#ef4444';

const css = (x: number) => {
  const [r, g, b] = turboRgb(x);
  return `rgb(${r}, ${g}, ${b})`;
};

/** Barra de la escala y sus extremos (con «escala log» al medio si corresponde). */
function scale(min: string, max: string, log: boolean): XrLine[] {
  return [
    {
      label: '',
      bar: Array.from({ length: STEPS }, (_, i) => ({
        fraction: 1 / STEPS,
        color: css((i + 0.5) / STEPS),
      })),
    },
    [{ label: min }, { label: log ? t('xr.legend.log') : '' }, { label: max }],
  ];
}

const pa2dB = (pa: number) => 20 * Math.log10(Math.max(pa, 1e-12) / 20e-6);

/** Vibración (PPV o sobrepresión): escala, ley del sitio, MIC y puntos de control. */
export function vibrationLegend(v: VibrationResult): XrLine[] {
  const ppv = v.metric === 'ppv';
  const show = (x: number) => (ppv ? formatNumber(x * 1000, 1) : formatNumber(pa2dB(x), 0));
  const unit = ppv ? 'mm/s' : 'dB';
  const lines: XrLine[] = [
    { label: t(ppv ? 'xr.legend.vibration' : 'xr.legend.airblast') },
    ...scale(`${show(v.colorMin)} ${unit}`, `${show(v.colorMax)} ${unit}`, true),
  ];
  if (v.law && ppv)
    lines.push({
      label: t('xr.legend.law', {
        k: formatNumber(v.law.k * 1000, 0),
        beta: formatNumber(v.law.beta, 2),
        scaling: t(v.law.scaling === 'cube-root' ? 'xr.legend.cubeRoot' : 'xr.legend.squareRoot'),
      }),
    });
  lines.push({ label: t('xr.legend.mic', { kg: formatNumber(v.mic, 1) }) });
  for (const r of v.receivers.slice(0, MAX_POINTS)) {
    const value = ppv
      ? `${formatNumber(r.ppv * 1000, 1)} mm/s`
      : `${formatNumber(r.airblastDb, 0)} dB`;
    const limit = ppv && r.limit ? ` / ${formatNumber(r.limit.ppvMax * 1000, 0)}` : '';
    lines.push({
      swatch: ppv && r.limit ? (r.exceeds ? BAD : OK) : '#94a3b8',
      label: `${r.name}: ${value}${limit}`,
    });
  }
  return lines;
}

/** Energía (PPV de campo cercano o densidad de carga): escala, parámetros, máximo y áreas. */
export function energyLegend(e: EnergyResult, project: Pick<Project, 'siteModels'>): XrLine[] {
  const ppv = e.metric === 'nearFieldPpv';
  const k = ppv ? 1000 : 1;
  const d = ppv ? 0 : 2;
  const unit = ppv ? 'mm/s' : 'kg/m³';
  const lines: XrLine[] = [
    { label: t(ppv ? 'xr.legend.energyPpv' : 'xr.legend.energyDensity') },
    ...scale(
      `${formatNumber(e.colorMin * k, d)} ${unit}`,
      `${formatNumber(e.colorMax * k, d)} ${unit}`,
      e.colorLog,
    ),
  ];
  if (ppv) {
    const nf = project.siteModels.nearField ?? DEFAULT_NEAR_FIELD;
    lines.push({
      label: t('xr.legend.nearField', {
        k: formatNumber(nf.k * 1000, 0),
        alpha: formatNumber(nf.alpha, 2),
        beta: formatNumber(nf.beta, 2),
      }),
    });
  }
  lines.push({ label: t('xr.legend.max', { value: formatNumber(e.max * k, d), unit }) });
  // Las dos curvas más altas: cuánta área queda por encima.
  const levels = e.contourLevels.map((level, i) => ({ level, area: e.areaAbove[i] ?? 0 }));
  for (const { level, area } of levels.slice(-2).reverse())
    lines.push({
      swatch: css(
        e.colorLog
          ? (Math.log(level) - Math.log(e.colorMin)) / (Math.log(e.colorMax) - Math.log(e.colorMin))
          : (level - e.colorMin) / (e.colorMax - e.colorMin || 1),
      ),
      label: t('xr.legend.area', {
        level: formatNumber(level * k, d),
        unit,
        area: formatNumber(area, 0),
      }),
    });
  return lines;
}
