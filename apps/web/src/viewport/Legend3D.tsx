import { explosiveColorHex, hexCss, MATERIAL_COLORS, turboCss } from '@cronos/engine';
import { colorRange } from '../analysis/visualize';
import { useProject } from '../hooks/useDocument';
import { useAnalysisStore } from '../stores/analysisStore';
import { useUiStore } from '../stores/uiStore';
import { formatNumber, useT, type MessageKey } from '../i18n';

const OTHER: [keyof typeof MATERIAL_COLORS, MessageKey][] = [
  ['stemming', 'legend.stemming'],
  ['air', 'legend.air'],
  ['water', 'legend.water'],
  ['plug', 'legend.plug'],
  ['empty', 'legend.empty'],
];

const BY_LABEL = {
  time: 'legend.by.time',
  kg: 'legend.by.kg',
  powderFactor: 'legend.by.powderFactor',
  effectiveBurden: 'legend.by.effectiveBurden',
} as const satisfies Record<string, MessageKey>;

function fmt(v: number, mode: keyof typeof BY_LABEL): string {
  if (mode === 'time') return `${String(Math.round(v * 1000))} ms`;
  if (mode === 'kg') return `${String(Math.round(v))} kg`;
  if (mode === 'effectiveBurden') return `${formatNumber(v, 1)} m`;
  return `${formatNumber(v, 2)} kg/m³`;
}

/**
 * Leyenda de la vista 3D: se adapta a lo que muestra la columna explosiva
 * (materiales, color por tiempo/kg/FC o la animación de la secuencia).
 */
export function Legend3D() {
  const tr = useT();
  const mode = useUiStore((s) => s.viewMode);
  const explosives = useProject().library.explosives;
  const colorBy = useAnalysisStore((s) => s.colorBy);
  const analysis = useAnalysisStore((s) => s.analysis);
  const sequenceTime = useAnalysisStore((s) => s.sequenceTime);
  if (mode !== '3d') return null;
  const range = analysis && colorBy !== 'none' ? colorRange(analysis, colorBy) : null;

  return (
    <div className="overlay-3d">
      {sequenceTime !== null ? (
        <>
          <strong>{tr('legend.sequence', { ms: Math.round(sequenceTime * 1000) })}</strong>
          <ul>
            <li>
              <i style={{ background: '#2a3442' }} />
              {tr('legend.pending')}
            </li>
            <li>
              <i style={{ background: '#fff3b0' }} />
              {tr('legend.firing')}
            </li>
            <li>
              <i style={{ background: '#ff5a1f' }} />
              {tr('legend.fired')}
            </li>
          </ul>
        </>
      ) : range && colorBy !== 'none' && colorBy !== 'group' && colorBy !== 'sdob' ? (
        <>
          <strong>{tr('legend.columnBy', { what: tr(BY_LABEL[colorBy]) })}</strong>
          <div
            className="gradient"
            style={{
              background: `linear-gradient(to right, ${[0, 0.25, 0.5, 0.75, 1].map((t) => turboCss(t)).join(',')})`,
            }}
          />
          <div className="legend-labels">
            <span>{fmt(range[0], colorBy)}</span>
            <span>{fmt(range[1], colorBy)}</span>
          </div>
        </>
      ) : (
        <ul>
          {explosives.map((e, i) => (
            <li key={e.id}>
              <i style={{ background: hexCss(explosiveColorHex(i)) }} />
              {e.name}
            </li>
          ))}
        </ul>
      )}
      <ul>
        {OTHER.map(([k, label]) => (
          <li key={k}>
            <i style={{ background: hexCss(MATERIAL_COLORS[k]) }} />
            {tr(label)}
          </li>
        ))}
      </ul>
      <p>
        <kbd>{tr('legend.drag')}</kbd> {tr('legend.orbit')} · <kbd>Shift</kbd> {tr('legend.pan')} ·{' '}
        <kbd>{tr('legend.wheel')}</kbd> {tr('legend.zoom')} · <kbd>3</kbd> {tr('legend.plan')}
      </p>
    </div>
  );
}
