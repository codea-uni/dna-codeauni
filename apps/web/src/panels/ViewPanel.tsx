import { turboCss } from '@blastlab/engine';
import { colorRange, sequenceTimes } from '../analysis/visualize';
import { getEngine } from '../session';
import { useAnalysisStore, type ColorBy, type LabelBy } from '../stores/analysisStore';

const SPEEDS = [
  { value: 0.02, label: '1/50×' },
  { value: 0.05, label: '1/20×' },
  { value: 0.1, label: '1/10×' },
  { value: 0.25, label: '1/4×' },
  { value: 1, label: '1×' },
];

function formatValue(v: number, mode: ColorBy): string {
  if (mode === 'time') return `${(v * 1000).toFixed(0)} ms`;
  if (mode === 'kg') return `${v.toFixed(0)} kg`;
  return `${v.toFixed(2)} kg/m³`;
}

/** Opciones de visualización del diseño y animación de la secuencia. */
export function ViewPanel() {
  const s = useAnalysisStore();
  const { analysis } = s;
  const range = analysis ? colorRange(analysis, s.colorBy) : null;
  const timing = analysis?.timing;
  const hasTimes = timing !== undefined && timing.initiated > 0;

  const play = () => {
    const engine = getEngine();
    if (!engine || !analysis) return;
    engine.playSequence(sequenceTimes(analysis), s.sequenceSpeed);
    s.set({ sequencePlaying: true });
  };
  const pause = () => {
    getEngine()?.pauseSequence();
    s.set({ sequencePlaying: false });
  };
  const stop = () => {
    getEngine()?.stopSequence();
    s.set({ sequencePlaying: false, sequenceTime: null });
  };

  return (
    <section className="panel">
      <h2>Visualización</h2>
      <label className="field">
        <span className="field-label">Color de taladros</span>
        <select
          value={s.colorBy}
          onChange={(e) => {
            s.set({ colorBy: e.target.value as ColorBy });
          }}
        >
          <option value="none">Estado</option>
          <option value="time">Tiempo de disparo</option>
          <option value="kg">kg por taladro</option>
          <option value="powderFactor">Factor de carga</option>
        </select>
      </label>
      {range && (
        <div className="legend">
          <div
            className="gradient"
            style={{
              background: `linear-gradient(to right, ${[0, 0.25, 0.5, 0.75, 1].map((t) => turboCss(t)).join(',')})`,
            }}
          />
          <div className="legend-labels">
            <span>{formatValue(range[0], s.colorBy)}</span>
            <span>{formatValue(range[1], s.colorBy)}</span>
          </div>
        </div>
      )}
      <label className="field">
        <span className="field-label">Etiquetas</span>
        <select
          value={s.labelBy}
          onChange={(e) => {
            s.set({ labelBy: e.target.value as LabelBy });
          }}
        >
          <option value="label">Nombre</option>
          <option value="time">Tiempo [ms]</option>
          <option value="kg">kg</option>
        </select>
      </label>
      <div className="checks">
        {(
          [
            ['connections', 'Amarres'],
            ['isochrones', 'Isócronas'],
            ['labels', 'Etiquetas'],
            ['traces', 'Trazas'],
          ] as const
        ).map(([layer, label]) => (
          <label key={layer} className="check">
            <input
              type="checkbox"
              checked={s.layers[layer]}
              onChange={(e) => {
                s.setLayer(layer, e.target.checked);
              }}
            />
            {label}
          </label>
        ))}
      </div>
      <label className="field">
        <span className="field-label">Intervalo isócronas</span>
        <span className="field-input">
          <input
            type="number"
            min={0}
            step={5}
            value={s.isochroneIntervalMs}
            title="0 = automático"
            onChange={(e) => {
              s.set({ isochroneIntervalMs: Math.max(0, Number(e.target.value)) });
            }}
          />
          <span className="field-unit">ms</span>
        </span>
      </label>
      <label className="field">
        <span className="field-label">Ventana coincidencia</span>
        <span className="field-input">
          <input
            type="number"
            min={1}
            step={1}
            value={s.coincidenceWindowMs}
            onChange={(e) => {
              s.set({ coincidenceWindowMs: Math.max(1, Number(e.target.value)) });
            }}
          />
          <span className="field-unit">ms</span>
        </span>
      </label>

      <h3>Secuencia</h3>
      {!hasTimes ? (
        <p className="hint">Sin tiempos: asigna detonadores y amarres (pestaña Tiempos).</p>
      ) : (
        <>
          <div className="row">
            {s.sequencePlaying ? (
              <button onClick={pause}>⏸ Pausa</button>
            ) : (
              <button onClick={play}>▶ Reproducir</button>
            )}
            <button onClick={stop} disabled={s.sequenceTime === null}>
              ⏹
            </button>
            <select
              value={s.sequenceSpeed}
              onChange={(e) => {
                const v = Number(e.target.value);
                s.set({ sequenceSpeed: v });
                getEngine()?.setSequenceSpeed(v);
              }}
            >
              {SPEEDS.map((sp) => (
                <option key={sp.value} value={sp.value}>
                  {sp.label}
                </option>
              ))}
            </select>
          </div>
          <input
            className="slider"
            type="range"
            min={(timing.firstTime - 0.02) * 1000}
            max={(timing.lastTime + 0.02) * 1000}
            step={1}
            value={(s.sequenceTime ?? timing.firstTime - 0.02) * 1000}
            onChange={(e) => {
              if (!analysis) return;
              getEngine()?.seekSequence(sequenceTimes(analysis), Number(e.target.value) / 1000);
              s.set({ sequencePlaying: false });
            }}
          />
          <p className="muted mono">
            t = {s.sequenceTime === null ? '—' : `${(s.sequenceTime * 1000).toFixed(0)} ms`}
          </p>
        </>
      )}
    </section>
  );
}
