import { commands, type VibrationMetric } from '@blastlab/core';
import { turboCss } from '@blastlab/engine';
import { MapPin, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { TextCell } from '../components/CellInput';
import { NumberField } from '../components/NumberField';
import { useProject } from '../hooks/useDocument';
import { session } from '../session';
import { useAnalysisStore } from '../stores/analysisStore';
import { useUiStore } from '../stores/uiStore';

const fmt = (v: number, d = 0) =>
  v.toLocaleString('es', { minimumFractionDigits: d, maximumFractionDigits: d });
const dB = (pa: number) => (pa > 0 ? 20 * Math.log10(pa / 20e-6) : 0);

/** Vibración (PPV), sobrepresión y flyrock (Lundborg). */
export function VibrationPanel() {
  const project = useProject();
  const s = useAnalysisStore();
  const setTool = useUiStore((st) => st.setTool);
  const tool = useUiStore((st) => st.tool);
  const site = project.siteModels;
  const law = site.vibrationLaws.find((l) => l.id === s.vibLawId) ?? site.vibrationLaws[0];
  const isPpv = s.vibMetric === 'ppv';
  const v = s.vibration;
  const [levelsText, setLevelsText] = useState(s.vibLevels.join('; '));
  const unit = isPpv ? 'mm/s' : 'dB';
  const toUi = (x: number) => (isPpv ? x * 1000 : dB(x));

  const setSite = (patch: Partial<typeof site>, label: string) => {
    session.document.dispatch(commands.setSiteModels({ ...site, ...patch }), label);
  };
  const setLaw = (patch: Partial<NonNullable<typeof law>>) => {
    if (!law) return;
    setSite(
      { vibrationLaws: site.vibrationLaws.map((l) => (l.id === law.id ? { ...l, ...patch } : l)) },
      'Ley de vibración',
    );
  };
  const commitLevels = () => {
    const levels = levelsText
      .split(/[;\s]+/)
      .map((t) => Number(t.replace(',', '.')))
      .filter((x) => Number.isFinite(x) && x > 0)
      .sort((a, b) => a - b);
    s.set({ vibLevels: levels });
    setLevelsText(levels.join('; '));
  };

  return (
    <>
      <section className="panel">
        <h2>Vibración y sobrepresión</h2>
        <label className="check">
          <input
            type="checkbox"
            checked={s.vibEnabled}
            onChange={(e) => {
              s.set({ vibEnabled: e.target.checked });
            }}
          />
          Calcular y mostrar
        </label>
        <div className="segmented" role="radiogroup" aria-label="Métrica">
          {(
            [
              ['ppv', 'PPV'],
              ['airblast', 'Sobrepresión'],
            ] as [VibrationMetric, string][]
          ).map(([m, label]) => (
            <button
              key={m}
              role="radio"
              aria-checked={s.vibMetric === m}
              className={s.vibMetric === m ? 'active' : ''}
              onClick={() => {
                s.set({ vibMetric: m, vibLevels: [] });
                setLevelsText('');
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {v && v.nx > 0 && (
          <>
            <div className="legend">
              <div
                className="gradient"
                style={{
                  background: `linear-gradient(to right, ${[0, 0.25, 0.5, 0.75, 1].map((t) => turboCss(t)).join(',')})`,
                }}
              />
              <div className="legend-labels">
                <span>
                  {fmt(toUi(v.colorMin), isPpv ? 0 : 0)} {unit}
                </span>
                <span>
                  {fmt(toUi(v.colorMax), 0)} {unit}
                </span>
              </div>
            </div>
            <table className="kv">
              <tbody>
                <tr>
                  <td title="Máxima carga por retardo (ventana de coincidencia)">
                    Carga máx. por retardo
                  </td>
                  <td className="num">{fmt(v.mic)} kg</td>
                </tr>
                {v.notInitiated > 0 && (
                  <tr className="warn">
                    <td>Sin tiempo (carga individual)</td>
                    <td className="num">{v.notInitiated}</td>
                  </tr>
                )}
                <tr>
                  <td>Alcance flyrock (Lundborg)</td>
                  <td className="num">{fmt(v.flyrock.range)} m</td>
                </tr>
              </tbody>
            </table>
            <table className="grid-table compact">
              <thead>
                <tr>
                  <th>{unit}</th>
                  <th>distancia con la MIC</th>
                </tr>
              </thead>
              <tbody>
                {v.levels.map((l, i) => (
                  <tr key={l}>
                    <td>{fmt(toUi(l), isPpv ? 0 : 0)}</td>
                    <td className="num">{fmt(v.distanceForLevel[i] ?? 0)} m</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        {s.vibComputing && <p className="muted small">calculando…</p>}
      </section>

      <section className="panel">
        <h2 className="row-title">
          Puntos de control
          <button
            className={`icon-btn${tool === 'monitor' ? ' active' : ''}`}
            title="Agregar puntos de control (M)"
            onClick={() => {
              setTool('monitor');
            }}
          >
            <MapPin size={15} aria-hidden />
            <kbd>M</kbd>
          </button>
        </h2>
        {(project.monitoringPoints ?? []).length === 0 ? (
          <p className="hint">Herramienta M: clic en el plano para agregar.</p>
        ) : (
          <table className="grid-table compact">
            <thead>
              <tr>
                <th>Punto</th>
                <th>R [m]</th>
                <th>mm/s</th>
                <th>dB</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(project.monitoringPoints ?? []).map((p) => {
                const rec = v?.receivers.find((x) => x.id === p.id);
                return (
                  <tr key={p.id}>
                    <td>
                      <TextCell
                        value={p.name}
                        onCommit={(name) => {
                          session.document.dispatch(
                            commands.updateMonitoringPoint(session.document, p.id, { name }),
                            'Renombrar punto',
                          );
                        }}
                      />
                    </td>
                    <td className="num">{rec ? fmt(rec.distance) : '—'}</td>
                    <td className="num">{rec ? fmt(rec.ppv * 1000, 1) : '—'}</td>
                    <td className="num">{rec ? fmt(rec.airblastDb, 0) : '—'}</td>
                    <td>
                      <button
                        className="icon danger"
                        title="Borrar punto"
                        onClick={() => {
                          session.document.dispatch(
                            commands.removeMonitoringPoint(session.document, p.id),
                            `Borrar ${p.name}`,
                          );
                        }}
                      >
                        <Trash2 size={13} aria-hidden />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!s.vibEnabled && (project.monitoringPoints ?? []).length > 0 && (
          <p className="hint">Activa "Calcular y mostrar" para ver los valores.</p>
        )}
      </section>

      <section className="panel">
        <h2>Constantes de sitio</h2>
        {law && (
          <>
            {site.vibrationLaws.length > 1 && (
              <label className="field">
                <span className="field-label">Ley</span>
                <select
                  value={law.id}
                  onChange={(e) => {
                    s.set({ vibLawId: e.target.value });
                  }}
                >
                  {site.vibrationLaws.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p className="hint">PPV = K · (R / W^{law.scaling === 'square-root' ? '½' : '⅓'})^−β</p>
            <NumberField
              label="K"
              unit="mm/s"
              decimals={0}
              min={1}
              value={law.k * 1000}
              onCommit={(x) => {
                setLaw({ k: x / 1000 });
              }}
            />
            <NumberField
              label="β"
              decimals={3}
              min={0.01}
              value={law.beta}
              onCommit={(x) => {
                setLaw({ beta: x });
              }}
            />
            <label className="field">
              <span className="field-label">Distancia escalada</span>
              <select
                value={law.scaling}
                onChange={(e) => {
                  setLaw({ scaling: e.target.value as typeof law.scaling });
                }}
              >
                <option value="square-root">raíz cuadrada</option>
                <option value="cube-root">raíz cúbica</option>
              </select>
            </label>
          </>
        )}
        <h3>Sobrepresión · P = K · (R / W^⅓)^−β</h3>
        <NumberField
          label="K"
          unit="kPa"
          decimals={0}
          min={1}
          value={site.airblast.k / 1000}
          onCommit={(x) => {
            setSite({ airblast: { ...site.airblast, k: x * 1000 } }, 'Sobrepresión');
          }}
        />
        <NumberField
          label="β"
          decimals={3}
          min={0.01}
          value={site.airblast.beta}
          onCommit={(x) => {
            setSite({ airblast: { ...site.airblast, beta: x } }, 'Sobrepresión');
          }}
        />
        <h3>Flyrock (Lundborg)</h3>
        <NumberField
          label="Factor de seguridad"
          decimals={2}
          min={0.1}
          value={site.flyrock.safetyFactor}
          onCommit={(x) => {
            setSite({ flyrock: { ...site.flyrock, safetyFactor: x } }, 'Flyrock');
          }}
        />
        <h3>Mapa</h3>
        <label className="field">
          <span className="field-label">Contornos [{unit}]</span>
          <input
            value={levelsText}
            placeholder={isPpv ? '2; 5; 10; 25; 50; 100' : '115; 120; 125; 130; 134'}
            onChange={(e) => {
              setLevelsText(e.target.value);
            }}
            onBlur={commitLevels}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
        </label>
        <NumberField
          label="Radio del mapa"
          unit="m"
          decimals={0}
          min={0}
          value={s.vibExtent}
          onCommit={(x) => {
            s.set({ vibExtent: x });
          }}
        />
        <div className="checks">
          <label className="check">
            <input
              type="checkbox"
              checked={s.layers.vibration}
              onChange={(e) => {
                s.setLayer('vibration', e.target.checked);
              }}
            />
            Mapa
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={s.layers.flyrock}
              onChange={(e) => {
                s.setLayer('flyrock', e.target.checked);
              }}
            />
            Zona de flyrock
          </label>
        </div>
      </section>
    </>
  );
}
