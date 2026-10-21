import {
  degToRad,
  equilateralSpacing,
  freeFaceAlignment,
  radToDeg,
  type PatternKind,
} from '@cronos/core';
import { useFormat, useT } from '../i18n';
import { BurdenReference } from './BurdenReference';
import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { IconButton } from '../components/IconButton';
import * as actions from '../actions';
import { NumberField } from '../components/NumberField';
import { DiameterUnitToggle } from '../components/DiameterUnitToggle';
import { useActiveBlast } from '../hooks/useDocument';
import { useUiStore } from '../stores/uiStore';
import { useUnits } from '../hooks/useUnits';
import { getCompute } from '../session';
import { onTopographyChange, topographyTin } from '../topography/session';

const KINDS: PatternKind[] = ['square', 'rectangular', 'staggered'];

export function PatternPanel() {
  const { len, dia } = useUnits();
  const t = useT();
  const blast = useActiveBlast();
  const busy = useUiStore((s) => s.busy);
  const template = useUiStore((s) => s.holeTemplate);
  const setTemplate = useUiStore((s) => s.setHoleTemplate);
  const [form, setForm] = useState<actions.PatternForm>({
    kind: 'staggered',
    burden: 6,
    spacing: 7,
    rows: 8,
    holesPerRow: 12,
    rowAzimuth: Math.PI / 2,
    rowAdvance: 'right',
    boundaryId: null,
    frontOffset: 3,
  });
  const activeBoundaryId = useUiStore((s) => s.activeBoundaryId);
  const update = (patch: Partial<actions.PatternForm>) => {
    setForm((f) => ({ ...f, ...patch }));
  };
  const boundaries = blast?.boundaries ?? [];
  // "auto" = el perímetro activo; se resuelve al generar.
  const [boundaryChoice, setBoundaryChoice] = useState<string>('active');
  const selectedBoundary =
    boundaryChoice === 'none'
      ? undefined
      : boundaries.find(
          (b) => b.id === (boundaryChoice === 'active' ? activeBoundaryId : boundaryChoice),
        );
  const clip = selectedBoundary !== undefined;
  const alignment = selectedBoundary ? freeFaceAlignment(selectedBoundary) : null;
  // Taladros de las mallas que se reemplazarán al generar sobre este perímetro.
  const replacing = (blast?.holes ?? []).filter((h) =>
    blast?.patterns.some((p) => p.id === h.patternId && p.boundaryId === selectedBoundary?.id),
  ).length;
  // Resultado de la última generación: taladros cortos o puntos bajo el piso (se avisan aquí).
  const [last, setLast] = useState<actions.PatternResult | null>(null);

  // Banco de la malla: altura (de la voladura) y piso (del perímetro si tiene uno propio).
  const fmt = useFormat();
  const bench = blast?.bench;
  const floor = selectedBoundary?.floorElevation ?? bench?.floorElevation ?? 0;
  const ground = useGroundInBoundary(bench?.topographyId, selectedBoundary?.polygon);
  const suggested = ground !== null && bench ? ground - bench.height : null;
  const setFloor = (v: number) => {
    void actions.setBenchLevels({
      floor: v,
      ...(selectedBoundary?.floorElevation !== undefined
        ? { boundaryId: selectedBoundary.id }
        : {}),
    });
  };

  return (
    <>
      {bench && (
        <section className="panel">
          <h2>{t('design.bench.title')}</h2>
          <NumberField
            label={t('blast.benchHeight')}
            unit={len.unit}
            decimals={2}
            min={0.1}
            value={len.show(bench.height)}
            onCommit={(raw) => {
              void actions.setBenchLevels({ height: len.parse(raw) });
            }}
          />
          <NumberField
            label={t('blast.floor')}
            unit={len.unit}
            decimals={2}
            value={len.show(floor)}
            onCommit={(raw) => {
              setFloor(len.parse(raw));
            }}
          />
          {suggested !== null && ground !== null && Math.abs(suggested - floor) > 0.5 && (
            <p className="hint">
              {t('design.bench.suggested', {
                floor: fmt(len.show(suggested), 2),
                ground: fmt(len.show(ground), 2),
                height: fmt(len.show(bench.height), 2),
                unit: len.unit,
              })}{' '}
              <button
                className="link"
                onClick={() => {
                  setFloor(Number(suggested.toFixed(2)));
                }}
              >
                {t('design.bench.useSuggested')}
              </button>
            </p>
          )}
          <p className="hint">
            {t(bench.topographyId ? 'design.bench.hintTerrain' : 'design.bench.hintFlat')}
          </p>
        </section>
      )}
      <section className="panel">
        <h2>{t('pattern.template')}</h2>
        <p className="hint">{t('pattern.templateHint')}</p>
        <NumberField
          label={t('props.diameter')}
          unit={dia.unit}
          decimals={dia.unit === 'in' ? 3 : 1}
          min={1}
          value={dia.show(template.diameter)}
          onCommit={(v) => {
            setTemplate({ diameter: dia.parse(v) });
          }}
        />
        <DiameterUnitToggle />
        <NumberField
          label={t('props.inclination')}
          unit="°"
          decimals={2}
          min={0}
          max={89}
          value={radToDeg(template.inclination)}
          onCommit={(v) => {
            setTemplate({ inclination: degToRad(v) });
          }}
        />
        <NumberField
          label={t('props.azimuth')}
          unit="°"
          decimals={2}
          min={0}
          max={360}
          value={radToDeg(template.azimuth)}
          onCommit={(v) => {
            setTemplate({ azimuth: degToRad(v) });
          }}
        />
        <NumberField
          label={t('props.subdrill')}
          unit={len.unit}
          decimals={2}
          value={len.show(template.subdrill)}
          onCommit={(raw) => {
            const v = len.parse(raw);
            setTemplate({ subdrill: v });
          }}
        />
      </section>

      <BurdenReference
        burden={form.burden}
        diameter={template.diameter}
        subdrill={template.subdrill}
        onBurden={(burden) => {
          update({ burden });
        }}
        onSpacing={(spacing) => {
          update({ kind: form.kind === 'square' ? 'rectangular' : form.kind, spacing });
        }}
        onSubdrill={(subdrill) => {
          setTemplate({ subdrill });
        }}
      />
      <section className="panel">
        <h2>{t('pattern.generate')}</h2>
        <label className="field">
          <span className="field-label">{t('pattern.type')}</span>
          <select
            value={form.kind}
            onChange={(e) => {
              update({ kind: e.target.value as PatternKind });
            }}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`pattern.kind.${k}`)}
              </option>
            ))}
          </select>
        </label>
        <NumberField
          label="Burden"
          unit={len.unit}
          decimals={2}
          min={0.1}
          value={len.show(form.burden)}
          onCommit={(raw) => {
            const v = len.parse(raw);
            update({ burden: v });
          }}
        />
        <NumberField
          label={t('pattern.spacing')}
          unit={len.unit}
          decimals={2}
          min={0.1}
          value={len.show(form.kind === 'square' ? form.burden : form.spacing)}
          disabled={form.kind === 'square'}
          onCommit={(raw) => {
            const v = len.parse(raw);
            update({ spacing: v });
          }}
        />
        {form.kind === 'staggered' && (
          <button
            onClick={() => {
              update({ spacing: Number(equilateralSpacing(form.burden).toFixed(3)) });
            }}
          >
            {t('pattern.equilateral')}
          </button>
        )}
        <NumberField
          label={t('pattern.rowAzimuth')}
          unit="°"
          decimals={2}
          min={0}
          max={360}
          value={radToDeg(form.rowAzimuth)}
          onCommit={(v) => {
            update({ rowAzimuth: degToRad(v) });
          }}
        />
        <label className="field">
          <span className="field-label">{t('pattern.rowAdvance')}</span>
          <select
            value={form.rowAdvance}
            onChange={(e) => {
              update({ rowAdvance: e.target.value as 'left' | 'right' });
            }}
          >
            <option value="right">{t('pattern.right')}</option>
            <option value="left">{t('pattern.left')}</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">{t('pattern.boundary')}</span>
          <select
            value={boundaryChoice}
            onChange={(e) => {
              setBoundaryChoice(e.target.value);
            }}
          >
            <option value="active">
              {t('pattern.active')}
              {activeBoundaryId
                ? ` (${boundaries.find((b) => b.id === activeBoundaryId)?.name ?? '—'})`
                : ` (${t('pattern.none')})`}
            </option>
            <option value="none">{t('pattern.noneCentered')}</option>
            {boundaries.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        {boundaries.length === 0 && <p className="hint">{t('pattern.drawBoundaryHint')}</p>}
        {clip && (
          <>
            <NumberField
              label={t('pattern.frontOffset')}
              unit={len.unit}
              decimals={2}
              min={0}
              value={len.show(form.frontOffset)}
              onCommit={(raw) => {
                const v = len.parse(raw);
                update({ frontOffset: v });
              }}
            />
            <button
              disabled={!alignment}
              title={alignment ? t('pattern.alignTitle') : t('pattern.alignNoFace')}
              onClick={() => {
                if (alignment) update(alignment);
              }}
            >
              {t('pattern.align')}
            </button>
          </>
        )}
        <NumberField
          label={t('pattern.rows')}
          integer
          min={1}
          max={1000}
          decimals={0}
          value={form.rows}
          disabled={clip}
          onCommit={(v) => {
            update({ rows: v });
          }}
        />
        <NumberField
          label={t('pattern.holesPerRow')}
          integer
          min={1}
          max={1000}
          decimals={0}
          value={form.holesPerRow}
          disabled={clip}
          onCommit={(v) => {
            update({ holesPerRow: v });
          }}
        />
        {!clip && <p className="hint">{t('pattern.centeredHint')}</p>}
        {replacing > 0 && <p className="hint">{t('pattern.willReplace', { n: replacing })}</p>}
        <button
          className="primary"
          disabled={busy !== null}
          onClick={() => {
            setLast(null);
            void actions
              .generatePattern({ ...form, boundaryId: selectedBoundary?.id ?? null })
              .then((r) => {
                setLast(r ?? null);
              });
          }}
        >
          {replacing > 0 ? t('pattern.regenerate') : t('pattern.generate')}
        </button>
        {last && last.belowFloor > 0 && (
          <p className="warn">
            {t('design.belowFloor', { n: last.belowFloor, floor: fmt(len.show(last.floor), 2) })}
          </p>
        )}
        {last && last.shortHoles.length > 0 && (
          <p className="warn">
            {t('design.shortHoles', { n: last.shortHoles.length })}{' '}
            <button
              className="link"
              onClick={() => {
                actions.focusHoles(last.shortHoles);
              }}
            >
              {t('design.selectThem')}
            </button>
          </p>
        )}
        {(blast?.patterns.length ?? 0) > 0 && (
          <>
            <h3>{t('pattern.list')}</h3>
            <table className="grid-table compact">
              <tbody>
                {blast?.patterns.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td className="num muted">
                      {t('groups.holes', {
                        n: blast.holes.filter((h) => h.patternId === p.id).length,
                      })}
                    </td>
                    <td>
                      <IconButton
                        icon={Trash2}
                        label={t('pattern.remove')}
                        onClick={() => {
                          actions.removePattern(p.id);
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>
    </>
  );
}

/**
 * Cota mediana del terreno dentro del perímetro (en el worker), para sugerir el piso del banco.
 * `null` sin topografía o sin perímetro.
 */
function useGroundInBoundary(
  surveyId: string | undefined,
  polygon: readonly { x: number; y: number }[] | undefined,
): number | null {
  // Resultado con la consulta que lo produjo: si cambian perímetro o levantamiento, no vale.
  const [found, setFound] = useState<{ tin: unknown; polygon: unknown; z: number | null } | null>(
    null,
  );
  const [rev, setRev] = useState(0);
  const tin = surveyId ? topographyTin(surveyId) : undefined;
  useEffect(
    () =>
      onTopographyChange(() => {
        setRev((r) => r + 1);
      }),
    [],
  );
  useEffect(() => {
    if (!tin || !polygon || polygon.length < 3) return;
    let alive = true;
    void getCompute()
      .api.topographyBenchElevation(tin, [...polygon])
      .then((z) => {
        if (alive) setFound({ tin, polygon, z });
      });
    return () => {
      alive = false;
    };
  }, [tin, polygon, rev]);
  return found && found.tin === tin && found.polygon === polygon ? found.z : null;
}
