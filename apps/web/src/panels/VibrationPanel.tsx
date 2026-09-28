import {
  commands,
  type MonitoringPointId,
  type PpvLimit,
  type VibrationMetric,
} from '@cronos/core';
import { turboCss } from '@cronos/engine';
import { MapPin, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { NumberCell, TextCell } from '../components/CellInput';
import { NumberField } from '../components/NumberField';
import { useProject } from '../hooks/useDocument';
import { session } from '../session';
import { useAnalysisStore } from '../stores/analysisStore';
import { useUiStore } from '../stores/uiStore';
import { useUnits } from '../hooks/useUnits';

const fmt = (v: number, d = 0) =>
  v.toLocaleString('es', { minimumFractionDigits: d, maximumFractionDigits: d });
const dB = (pa: number) => (pa > 0 ? 20 * Math.log10(pa / 20e-6) : 0);

/** Vibración (PPV), sobrepresión y flyrock (Lundborg). */
export function VibrationPanel() {
  const { len } = useUnits();
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
                {v.micExtended && (
                  <tr>
                    <td title="Ventana ampliada por la dispersión de los detonadores pirotécnicos (w + 2σ, P-10)">
                      Con ventana ampliada ({fmt(v.micExtended.window * 1000, 0)} ms)
                    </td>
                    <td className={`num${v.micExtended.mic > v.mic ? ' warn' : ''}`}>
                      {fmt(v.micExtended.mic)} kg
                    </td>
                  </tr>
                )}
                {v.notInitiated > 0 && (
                  <tr className="warn">
                    <td>Sin tiempo (carga individual)</td>
                    <td className="num">{v.notInitiated}</td>
                  </tr>
                )}
                <tr>
                  <td>Alcance flyrock (Lundborg)</td>
                  <td className="num">
                    {fmt(len.show(v.flyrock.range))} {len.unit}
                  </td>
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
                    <td className="num">
                      {fmt(len.show(v.distanceForLevel[i] ?? 0))} {len.unit}
                    </td>
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
                <th>R [{len.unit}]</th>
                <th>mm/s</th>
                <th title="Límite aplicable (del punto o de la tabla)">Lím.</th>
                <th title="Carga por retardo admisible para el límite (H-603)">kg adm.</th>
                <th>dB</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(project.monitoringPoints ?? []).map((p) => {
                const rec = v?.receivers.find((x) => x.id === p.id);
                return (
                  <tr key={p.id} className={rec?.exceeds ? 'warn' : undefined}>
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
                    <td className="num">{rec ? fmt(len.show(rec.distance)) : '—'}</td>
                    <td
                      className="num"
                      title={
                        rec?.centroid
                          ? `Con el centroide de la ventana (informativo, P-07): ${fmt(rec.centroid.ppv * 1000, 1)} mm/s`
                          : undefined
                      }
                    >
                      {rec ? fmt(rec.ppv * 1000, 1) : '—'}
                    </td>
                    <td className="num" title={rec?.limit?.source}>
                      {rec?.limit ? fmt(rec.limit.ppvMax * 1000, 0) : '—'}
                    </td>
                    <td className="num">
                      {rec?.admissibleCharge != null ? fmt(rec.admissibleCharge) : '—'}
                    </td>
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
        {(project.monitoringPoints ?? []).length > 0 && <PointSettings />}
      </section>
      <PpvLimitsTable />

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
          unit={len.unit}
          decimals={0}
          min={0}
          value={len.show(s.vibExtent)}
          onCommit={(raw) => {
            const x = len.parse(raw);
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

/** Estructura, límite propio y K/β propios de cada punto (H-602). Vacío o 0 = el del sitio. */
function PointSettings() {
  const project = useProject();
  const update = (id: MonitoringPointId, patch: commands.MonitoringPointPatch, label: string) => {
    session.document.dispatch(commands.updateMonitoringPoint(session.document, id, patch), label);
  };
  return (
    <>
      <h3>Configuración por punto</h3>
      <table className="grid-table compact">
        <thead>
          <tr>
            <th>Punto</th>
            <th title="Tipo de estructura: elige las filas de la tabla de límites">Estructura</th>
            <th title="Límite propio [mm/s]; 0 = de la tabla">Lím. propio</th>
            <th title="K propio [mm/s]; 0 = el del sitio">K</th>
            <th title="β propio; 0 = el del sitio">β</th>
          </tr>
        </thead>
        <tbody>
          {(project.monitoringPoints ?? []).map((p) => (
            <tr key={p.id}>
              <td className="muted">{p.name}</td>
              <td>
                <TextCell
                  value={p.structure ?? ''}
                  onCommit={(v) => {
                    update(p.id, { structure: v.trim() || undefined }, 'Estructura del punto');
                  }}
                />
              </td>
              <td>
                <NumberCell
                  value={(p.ppvLimit ?? 0) * 1000}
                  decimals={1}
                  min={0}
                  onCommit={(v) => {
                    update(p.id, { ppvLimit: v > 0 ? v / 1000 : undefined }, 'Límite del punto');
                  }}
                />
              </td>
              <td>
                <NumberCell
                  value={(p.k ?? 0) * 1000}
                  decimals={0}
                  min={0}
                  onCommit={(v) => {
                    update(p.id, { k: v > 0 ? v / 1000 : undefined }, 'K del punto');
                  }}
                />
              </td>
              <td>
                <NumberCell
                  value={p.beta ?? 0}
                  decimals={2}
                  min={0}
                  onCommit={(v) => {
                    update(p.id, { beta: v > 0 ? v : undefined }, 'β del punto');
                  }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/**
 * Tabla de límites de PPV del sitio (RM-21, P-12): por tipo de estructura y distancia, con su
 * fuente (EIA de la operación; USBM RI 8507/OSM o DIN 4150). Los valores iniciales son de curso y
 * están rotulados «por contrastar».
 */
function PpvLimitsTable() {
  const project = useProject();
  const limits = project.ppvLimits ?? [];
  const set = (next: PpvLimit[], label: string) => {
    session.document.dispatch({ type: 'project/patch', patch: { ppvLimits: next } }, label);
  };
  const patch = (i: number, p: Partial<PpvLimit>) => {
    set(
      limits.map((l, k) => (k === i ? { ...l, ...p } : l)),
      'Editar límite de PPV',
    );
  };
  return (
    <section className="panel">
      <h2>Límites de PPV</h2>
      <p className="hint">
        Valores por tipo de estructura y distancia, con su fuente. Perú no tiene una norma nacional
        de PPV para voladura: usa los del instrumento ambiental (EIA) de la operación (P-12).
      </p>
      <table className="grid-table compact">
        <thead>
          <tr>
            <th>Estructura</th>
            <th>Desde [m]</th>
            <th>Hasta [m]</th>
            <th>mm/s</th>
            <th>Fuente</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {limits.map((l, i) => (
            <tr key={i}>
              <td>
                <TextCell
                  value={l.structure ?? ''}
                  title="Vacío = todas"
                  onCommit={(v) => {
                    const next = { ...l };
                    if (v.trim()) next.structure = v.trim();
                    else delete next.structure;
                    set(
                      limits.map((x, k) => (k === i ? next : x)),
                      'Editar límite de PPV',
                    );
                  }}
                />
              </td>
              <td>
                <NumberCell
                  value={l.from}
                  decimals={0}
                  min={0}
                  onCommit={(v) => {
                    patch(i, { from: v });
                  }}
                />
              </td>
              <td>
                <NumberCell
                  value={l.to ?? 0}
                  decimals={0}
                  min={0}
                  onCommit={(v) => {
                    const next = { ...l };
                    if (v > 0) next.to = v;
                    else delete next.to;
                    set(
                      limits.map((x, k) => (k === i ? next : x)),
                      'Editar límite de PPV',
                    );
                  }}
                />
              </td>
              <td>
                <NumberCell
                  value={l.ppvMax * 1000}
                  decimals={1}
                  min={0.1}
                  onCommit={(v) => {
                    patch(i, { ppvMax: v / 1000 });
                  }}
                />
              </td>
              <td>
                <TextCell
                  value={l.source}
                  onCommit={(v) => {
                    if (v.trim()) patch(i, { source: v.trim() });
                  }}
                />
              </td>
              <td>
                <button
                  className="icon danger"
                  title="Quitar fila"
                  onClick={() => {
                    set(
                      limits.filter((_, k) => k !== i),
                      'Quitar límite de PPV',
                    );
                  }}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        onClick={() => {
          set(
            [...limits, { from: 0, ppvMax: 0.01, source: 'Por definir (EIA de la operación)' }],
            'Agregar límite de PPV',
          );
        }}
      >
        + Límite
      </button>
    </section>
  );
}
