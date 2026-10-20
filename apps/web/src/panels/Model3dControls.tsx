import { blockTotals, type TopographySurvey } from '@cronos/core';
import { useState } from 'react';
import { useFormat, useT } from '../i18n';
import { getEngine } from '../session';
import { useUiStore } from '../stores/uiStore';
import { blockColoring, blockModelOf, blockStyle, setBlockStyle } from '../topography/session';

const rgb = (c: readonly number[]) => `rgb(${String(c[0])}, ${String(c[1])}, ${String(c[2])})`;

/**
 * Controles de un modelo de bloques: atributo con el que se colorea, filtro por valor, opacidad,
 * leyenda y tonelaje de lo visible.
 */
export function BlockModelControls({ survey }: { survey: TopographySurvey }) {
  const t = useT();
  const fmt = useFormat();
  const model = blockModelOf(survey.id);
  const style = blockStyle(survey.id);
  const coloring = blockColoring(survey.id);
  if (!model || !style) return null;
  const totals = blockTotals(model, coloring?.visible);
  const legend = coloring?.legend;
  const isNumeric = model.numeric.some((a) => a.name === style.attribute);
  const num = (v: string) => (v.trim() === '' ? undefined : Number(v.replace(',', '.')));
  const update = (patch: {
    attribute?: string;
    min?: number | undefined;
    max?: number | undefined;
    opacity?: number;
  }) => {
    const merged = { ...style, ...patch };
    setBlockStyle(survey.id, {
      attribute: merged.attribute,
      opacity: merged.opacity,
      ...(merged.min !== undefined ? { min: merged.min } : {}),
      ...(merged.max !== undefined ? { max: merged.max } : {}),
    });
  };
  return (
    <div className="model3d-controls small">
      <label>
        {t('topo.model3d.colorBy')}{' '}
        <select
          value={style.attribute}
          onChange={(e) => {
            update({ attribute: e.target.value, min: undefined, max: undefined });
          }}
        >
          <optgroup label={t('topo.model3d.groupText')}>
            {model.categorical.map((a) => (
              <option key={a.name} value={a.name}>
                {a.name}
              </option>
            ))}
          </optgroup>
          <optgroup label={t('topo.model3d.groupNumber')}>
            {model.numeric.map((a) => (
              <option key={a.name} value={a.name}>
                {a.name}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      {legend?.kind === 'category' && (
        <ul className="model3d-legend">
          {legend.items.map((it) => (
            <li key={it.name}>
              <span className="swatch" style={{ background: rgb(it.color) }} /> {it.name}{' '}
              <span className="muted">({fmt(it.count)})</span>
            </li>
          ))}
        </ul>
      )}
      {legend?.kind === 'numeric' && (
        <div className="model3d-scale">
          <span>{fmt(legend.min, 3)}</span>
          <span className="turbo-bar" />
          <span>{fmt(legend.max, 3)}</span>
        </div>
      )}
      {isNumeric && (
        <div className="row">
          <label>
            {t('topo.model3d.filterMin')}{' '}
            <input
              type="number"
              step="any"
              defaultValue={style.min ?? ''}
              key={`min-${style.attribute}`}
              onBlur={(e) => {
                update({ min: num(e.target.value) });
              }}
            />
          </label>
          <label>
            {t('topo.model3d.filterMax')}{' '}
            <input
              type="number"
              step="any"
              defaultValue={style.max ?? ''}
              key={`max-${style.attribute}`}
              onBlur={(e) => {
                update({ max: num(e.target.value) });
              }}
            />
          </label>
        </div>
      )}
      <label>
        {t('topo.model3d.opacity')}{' '}
        <input
          type="range"
          min={0.2}
          max={1}
          step={0.05}
          value={style.opacity}
          onChange={(e) => {
            update({ opacity: Number(e.target.value) });
          }}
        />
      </label>
      <div className="muted">
        {t('topo.model3d.totals', {
          blocks: fmt(totals.blocks),
          volume: fmt(totals.volume),
          tonnes: fmt(totals.tonnes),
        })}
      </div>
    </div>
  );
}

/** Tamaño de los puntos de las nubes (a escala real). */
export function PointCloudControls() {
  const t = useT();
  const [size, setSize] = useState(0.15);
  return (
    <div className="model3d-controls small">
      <label>
        {t('topo.model3d.pointSize')}{' '}
        <input
          type="range"
          min={0.02}
          max={1}
          step={0.01}
          value={size}
          onChange={(e) => {
            const v = Number(e.target.value);
            setSize(v);
            getEngine()?.setPointSize(v);
          }}
        />{' '}
        {size.toFixed(2)} m
      </label>
      {useUiStore.getState().viewMode !== '3d' && (
        <button
          className="small"
          onClick={() => {
            useUiStore.getState().setViewMode('3d');
          }}
        >
          {t('topo.model3d.view3d')}
        </button>
      )}
    </div>
  );
}
