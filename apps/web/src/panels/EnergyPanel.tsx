import { commands, DEFAULT_NEAR_FIELD, type EnergyMetric } from '@blastlab/core';
import { turboCss } from '@blastlab/engine';
import { useState } from 'react';
import { NumberField } from '../components/NumberField';
import { useActiveBlast, useProject } from '../hooks/useDocument';
import { session } from '../session';
import { useAnalysisStore } from '../stores/analysisStore';

const fmt = (v: number, d = 0) =>
  v.toLocaleString('es', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Energía: PPV de campo cercano (Holmberg–Persson) o densidad de carga en un plano horizontal. */
export function EnergyPanel() {
  const project = useProject();
  const blast = useActiveBlast();
  const s = useAnalysisStore();
  const nf = project.siteModels.nearField ?? DEFAULT_NEAR_FIELD;
  const isPpv = s.energyMetric === 'nearFieldPpv';
  const unit = isPpv ? 'mm/s' : 'kg/m³';
  const toUi = isPpv ? 1000 : 1;
  const midBench = blast ? blast.bench.floorElevation + blast.bench.height / 2 : 0;
  const [levelsText, setLevelsText] = useState(s.energyLevels.join('; '));
  const e = s.energy;

  const setNearField = (patch: Partial<typeof nf>) => {
    session.document.dispatch(
      commands.setSiteModels({ ...project.siteModels, nearField: { ...nf, ...patch } }),
      'Constantes de campo cercano',
    );
  };
  const commitLevels = () => {
    const levels = levelsText
      .split(/[;\s]+/)
      .map((t) => Number(t.replace(',', '.')))
      .filter((v) => Number.isFinite(v) && v > 0);
    s.set({ energyLevels: levels });
    setLevelsText(levels.join('; '));
  };

  return (
    <>
      <section className="panel">
        <h2>Energía</h2>
        <label className="check">
          <input
            type="checkbox"
            checked={s.energyEnabled}
            onChange={(ev) => {
              s.set({ energyEnabled: ev.target.checked });
            }}
          />
          Calcular y mostrar
        </label>
        <label className="field">
          <span className="field-label">Métrica</span>
          <select
            value={s.energyMetric}
            onChange={(ev) => {
              s.set({ energyMetric: ev.target.value as EnergyMetric, energyLevels: [] });
              setLevelsText('');
            }}
          >
            <option value="nearFieldPpv">PPV campo cercano (Holmberg–Persson)</option>
            <option value="chargeDensity">Densidad de carga</option>
          </select>
        </label>
        <NumberField
          label="Cota del plano"
          unit="m"
          decimals={2}
          value={s.energyElevation ?? midBench}
          onCommit={(v) => {
            s.set({ energyElevation: v });
          }}
        />
        <button
          disabled={s.energyElevation === null}
          onClick={() => {
            s.set({ energyElevation: null });
          }}
        >
          Usar mitad del banco ({fmt(midBench, 1)} m)
        </button>
        <NumberField
          label="Tamaño de celda"
          unit="m"
          decimals={2}
          min={0}
          value={s.energyCellSize}
          onCommit={(v) => {
            s.set({ energyCellSize: v });
          }}
        />
        <NumberField
          label="Radio de influencia"
          unit="m"
          decimals={1}
          min={0}
          value={s.energyCutoff}
          onCommit={(v) => {
            s.set({ energyCutoff: v });
          }}
        />
        <p className="hint">
          0 = automático (celda según tamaño de la voladura; radio 4 × espaciamiento o 4σ).
        </p>
        {isPpv ? (
          <>
            <h3>Constantes de sitio (Holmberg–Persson)</h3>
            <p className="hint">
              v = K · [Σ q·dx / d^(β/α)]^α · típicos: K = 700 mm/s, α = 0,7, β = 1,5.
            </p>
            <NumberField
              label="K"
              unit="mm/s"
              decimals={0}
              min={1}
              value={nf.k * 1000}
              onCommit={(v) => {
                setNearField({ k: v / 1000 });
              }}
            />
            <NumberField
              label="α"
              decimals={3}
              min={0.01}
              value={nf.alpha}
              onCommit={(v) => {
                setNearField({ alpha: v });
              }}
            />
            <NumberField
              label="β"
              decimals={3}
              min={0.01}
              value={nf.beta}
              onCommit={(v) => {
                setNearField({ beta: v });
              }}
            />
          </>
        ) : (
          <NumberField
            label="σ del núcleo"
            unit="m"
            decimals={2}
            min={0.1}
            value={s.energySigma}
            onCommit={(v) => {
              s.set({ energySigma: v });
            }}
          />
        )}
        <label className="field">
          <span className="field-label">Contornos [{unit}]</span>
          <input
            value={levelsText}
            placeholder="automáticos"
            onChange={(ev) => {
              setLevelsText(ev.target.value);
            }}
            onBlur={commitLevels}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter') ev.currentTarget.blur();
            }}
          />
        </label>
        <label className="field">
          <span className="field-label">Opacidad</span>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={s.energyOpacity}
            onChange={(ev) => {
              s.set({ energyOpacity: Number(ev.target.value) });
            }}
          />
        </label>
      </section>

      {s.energyEnabled && (
        <section className="panel">
          <h2>
            Resultado{' '}
            <span className="muted small">
              {s.energyComputing ? '· calculando…' : e ? `· ${fmt(e.elapsedMs)} ms` : ''}
            </span>
          </h2>
          {!e || e.nx === 0 ? (
            <p className="hint">Sin taladros cargados (pestaña Carguío).</p>
          ) : (
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
                    {fmt(e.colorMin * toUi, isPpv ? 0 : 2)} {unit}
                  </span>
                  <span>{e.colorLog ? 'escala log' : ''}</span>
                  <span>
                    {fmt(e.colorMax * toUi, isPpv ? 0 : 2)} {unit}
                  </span>
                </div>
              </div>
              <table className="kv">
                <tbody>
                  <tr>
                    <td>Máximo</td>
                    <td className="num">
                      {fmt(e.max * toUi, isPpv ? 0 : 2)} {unit}
                    </td>
                  </tr>
                  <tr>
                    <td>Grilla</td>
                    <td className="num">
                      {e.nx} × {e.ny} · celda {fmt(e.cellSize, 2)} m
                    </td>
                  </tr>
                </tbody>
              </table>
              <h3>Área sobre cada nivel</h3>
              <table className="grid-table compact">
                <thead>
                  <tr>
                    <th>≥ {unit}</th>
                    <th>m²</th>
                  </tr>
                </thead>
                <tbody>
                  {e.contourLevels.map((l, i) => (
                    <tr key={l}>
                      <td>{fmt(l * toUi, isPpv ? 0 : 3)}</td>
                      <td className="num">{fmt(e.areaAbove[i] ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <label className="check">
                <input
                  type="checkbox"
                  checked={s.layers.energy}
                  onChange={(ev) => {
                    s.setLayer('energy', ev.target.checked);
                  }}
                />
                Mostrar en el plano
              </label>
            </>
          )}
        </section>
      )}
    </>
  );
}
