import { explosiveColorHex, hexCss, MATERIAL_COLORS, turboCss } from '@blastlab/engine';
import { colorRange } from '../analysis/visualize';
import { useProject } from '../hooks/useDocument';
import { useAnalysisStore } from '../stores/analysisStore';
import { useUiStore } from '../stores/uiStore';

const OTHER: [keyof typeof MATERIAL_COLORS, string][] = [
  ['stemming', 'Taco'],
  ['air', 'Aire'],
  ['water', 'Agua'],
  ['plug', 'Tapón'],
  ['empty', 'Sin cargar'],
];

const BY_LABEL = {
  time: 'tiempo de disparo',
  kg: 'kg por taladro',
  powderFactor: 'factor de carga',
} as const;

function fmt(v: number, mode: keyof typeof BY_LABEL): string {
  if (mode === 'time') return `${Math.round(v * 1000)} ms`;
  if (mode === 'kg') return `${Math.round(v)} kg`;
  return `${v.toFixed(2)} kg/m³`;
}

/**
 * Leyenda de la vista 3D: se adapta a lo que muestra la columna explosiva
 * (materiales, color por tiempo/kg/FC o la animación de la secuencia).
 */
export function Legend3D() {
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
          <strong>Secuencia · t = {Math.round(sequenceTime * 1000)} ms</strong>
          <ul>
            <li>
              <i style={{ background: '#2a3442' }} />
              Pendiente
            </li>
            <li>
              <i style={{ background: '#fff3b0' }} />
              Disparando
            </li>
            <li>
              <i style={{ background: '#ff5a1f' }} />
              Detonado
            </li>
          </ul>
        </>
      ) : range && colorBy !== 'none' ? (
        <>
          <strong>Columna explosiva por {BY_LABEL[colorBy]}</strong>
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
            {label}
          </li>
        ))}
      </ul>
      <p>
        <kbd>arrastre</kbd> orbitar · <kbd>Shift</kbd> desplazar · <kbd>rueda</kbd> acercar ·{' '}
        <kbd>3</kbd> planta
      </p>
    </div>
  );
}
