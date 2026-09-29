import {
  degToRad,
  equilateralSpacing,
  freeFaceAlignment,
  radToDeg,
  type PatternKind,
} from '@cronos/core';
import { useT } from '../i18n';
import { BurdenReference } from './BurdenReference';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { IconButton } from '../components/IconButton';
import * as actions from '../actions';
import { NumberField } from '../components/NumberField';
import { useActiveBlast } from '../hooks/useDocument';
import { useUiStore } from '../stores/uiStore';
import { useUnits } from '../hooks/useUnits';

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

  return (
    <>
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
          onClick={() =>
            void actions.generatePattern({ ...form, boundaryId: selectedBoundary?.id ?? null })
          }
        >
          {replacing > 0 ? t('pattern.regenerate') : t('pattern.generate')}
        </button>
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
