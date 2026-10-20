import {
  blockTotals,
  GEOTECH_NUMERIC_FIELDS,
  lithologyTable,
  type BlockModelData,
  type BlockModelMapping,
  type LithologyProps,
  type TopographySurvey,
} from '@cronos/core';
import { useState } from 'react';
import { useFormat, useT } from '../i18n';
import { getEngine, session } from '../session';
import { useUiStore } from '../stores/uiStore';
import {
  blockColoring,
  blockMappingOps,
  blockModelOf,
  blockStyle,
  COMPETENCE_RMR,
  COMPETENCE_UCS,
  setBlockStyle,
} from '../topography/session';

const rgb = (c: readonly number[]) => `rgb(${String(c[0])}, ${String(c[1])}, ${String(c[2])})`;

/**
 * Controles de un modelo de bloques: atributo con el que se colorea, filtro por valor, opacidad,
 * leyenda y tonelaje de lo visible.
 */
export function BlockModelControls({ survey }: { survey: TopographySurvey }) {
  const t = useT();
  const fmt = useFormat();
  const [mappingOpen, setMappingOpen] = useState(false);
  const model = blockModelOf(survey.id);
  const style = blockStyle(survey.id);
  const coloring = blockColoring(survey.id);
  if (!model || !style) return null;
  const mapping: BlockModelMapping = survey.blockModel ?? {
    geological: true,
    geotechnical: false,
    columns: {},
  };
  const setMapping = (next: BlockModelMapping) => {
    session.document.dispatch(
      blockMappingOps(survey.id, next),
      t('topo.geotech.undo', { name: survey.name }),
    );
  };
  const competence = style.attribute === COMPETENCE_RMR || style.attribute === COMPETENCE_UCS;
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
          {mapping.geotechnical && (
            <optgroup label={t('topo.geotech.competence')}>
              <option value={COMPETENCE_RMR}>{t('topo.geotech.competenceRmr')}</option>
              <option value={COMPETENCE_UCS}>{t('topo.geotech.competenceUcs')}</option>
            </optgroup>
          )}
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
      {competence && (
        <div className="muted">
          ▲ {t('topo.geotech.hard')} · ▼ {t('topo.geotech.soft')}
        </div>
      )}
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
      <div className="row">
        <span>{t('topo.geotech.kind')}:</span>
        <label>
          <input
            type="checkbox"
            checked={mapping.geological}
            onChange={(e) => {
              setMapping({ ...mapping, geological: e.target.checked });
            }}
          />{' '}
          {t('topo.geotech.geological')}
        </label>
        <label>
          <input
            type="checkbox"
            checked={mapping.geotechnical}
            onChange={(e) => {
              setMapping({ ...mapping, geotechnical: e.target.checked });
            }}
          />{' '}
          {t('topo.geotech.geotechnical')}
        </label>
      </div>
      {mapping.geotechnical && (
        <label>
          <input
            type="checkbox"
            checked={mapping.useForRock ?? false}
            onChange={(e) => {
              setMapping({ ...mapping, useForRock: e.target.checked });
            }}
          />{' '}
          {t('topo.geotech.useForRock')}
        </label>
      )}
      <button
        className="small"
        onClick={() => {
          setMappingOpen(!mappingOpen);
        }}
      >
        {mappingOpen ? t('topo.geotech.hideMapping') : t('topo.geotech.mapColumns')}
      </button>
      {mappingOpen && <ColumnMapping model={model} mapping={mapping} onChange={setMapping} />}
    </div>
  );
}

const LITH_FIELDS = ['density', 'ucs', 'youngModulus', 'vp', 'tensileStrength', 'rmr'] as const;
const LITH_UNITS: Record<(typeof LITH_FIELDS)[number], string> = {
  density: 't/m³',
  ucs: 'MPa',
  youngModulus: 'GPa',
  vp: 'm/s',
  tensileStrength: 'MPa',
  rmr: '',
};

/**
 * Asistente de mapeo: qué columna del CSV da cada propiedad de la roca y, si hay litología, la
 * tabla de valores típicos de cada una (editable; viaja con el levantamiento).
 */
function ColumnMapping({
  model,
  mapping,
  onChange,
}: {
  model: BlockModelData;
  mapping: BlockModelMapping;
  onChange: (m: BlockModelMapping) => void;
}) {
  const t = useT();
  const setColumn = (field: keyof BlockModelMapping['columns'], name: string) => {
    const columns = { ...mapping.columns };
    if (name === '') delete columns[field];
    else columns[field] = name;
    onChange({ ...mapping, columns });
  };
  const lith = mapping.columns.lithology
    ? model.categorical.find((a) => a.name === mapping.columns.lithology)
    : undefined;
  const table = lith ? lithologyTable(lith.categories, mapping.lithologies) : [];
  const setCell = (row: LithologyProps, field: (typeof LITH_FIELDS)[number], raw: string) => {
    const v = raw.trim() === '' ? undefined : Number(raw.replace(',', '.'));
    const next = table.map((r) => {
      if (r.name !== row.name) return r;
      const copy: LithologyProps = { ...r };
      if (v === undefined || !Number.isFinite(v)) delete copy[field];
      else copy[field] = v;
      return copy;
    });
    onChange({ ...mapping, lithologies: next });
  };
  return (
    <div className="geotech-mapping">
      <p className="muted">{t('topo.geotech.mappingHint')}</p>
      {GEOTECH_NUMERIC_FIELDS.map((f) => (
        <label key={f} className="row">
          {t(`topo.geotech.field.${f}`)}{' '}
          <select
            value={mapping.columns[f] ?? ''}
            onChange={(e) => {
              setColumn(f, e.target.value);
            }}
          >
            <option value="">{t('topo.geotech.none')}</option>
            {model.numeric.map((a) => (
              <option key={a.name} value={a.name}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      ))}
      <label className="row">
        {t('topo.geotech.field.lithology')}{' '}
        <select
          value={mapping.columns.lithology ?? ''}
          onChange={(e) => {
            setColumn('lithology', e.target.value);
          }}
        >
          <option value="">{t('topo.geotech.none')}</option>
          {model.categorical.map((a) => (
            <option key={a.name} value={a.name}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      {table.length > 0 && (
        <>
          <div>{t('topo.geotech.lithTable')}</div>
          <div className="table-scroll">
            <table className="small">
              <thead>
                <tr>
                  <th>{t('topo.geotech.lithName')}</th>
                  {LITH_FIELDS.map((f) => (
                    <th key={f}>
                      {t(`topo.geotech.field.${f}`)} {LITH_UNITS[f]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.map((row) => (
                  <tr key={row.name}>
                    <td
                      title={
                        LITH_FIELDS.some((f) => row[f] !== undefined)
                          ? undefined
                          : t('topo.geotech.unknownLith')
                      }
                    >
                      {row.name}
                    </td>
                    {LITH_FIELDS.map((f) => (
                      <td key={f}>
                        <input
                          type="number"
                          step="any"
                          style={{ width: '5em' }}
                          key={`${row.name}-${f}-${String(row[f] ?? '')}`}
                          defaultValue={row[f] ?? ''}
                          onBlur={(e) => {
                            if (e.target.value !== String(row[f] ?? ''))
                              setCell(row, f, e.target.value);
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
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
      <button
        className="small"
        onClick={() => {
          useUiStore.getState().setViewMode('3d');
          requestAnimationFrame(() => getEngine()?.frameModels3d());
        }}
      >
        {t('topo.model3d.view3d')}
      </button>
    </div>
  );
}
