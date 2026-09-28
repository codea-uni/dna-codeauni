import {
  andersenBurden,
  ashBurden,
  DEFAULT_STEMMING_RATIO,
  DEFAULT_SUBDRILL_RATIO,
  konyaWalterBurden,
  stiffnessRating,
  stiffnessRatio,
  suggestedSpacing,
} from '@cronos/core';
import { useState } from 'react';
import { NumberField } from '../components/NumberField';
import { useActiveBlast, useProject } from '../hooks/useDocument';
import { useUnits } from '../hooks/useUnits';
import { useFormat, useT } from '../i18n';

type Model = 'ash' | 'konya' | 'andersen';

/**
 * Burden teórico por Ash, Konya–Walter y Andersen (H-305, `docs/theory/02 §1`), con el espaciamiento,
 * taco y sobreperforación sugeridos. Es un cálculo de un solo diseño: corre en el hilo principal.
 */
export function BurdenReference({
  burden,
  diameter,
  subdrill,
  onBurden,
  onSpacing,
  onSubdrill,
}: {
  burden: number;
  diameter: number;
  subdrill: number;
  onBurden: (b: number) => void;
  onSpacing: (s: number) => void;
  onSubdrill: (j: number) => void;
}) {
  const t = useT();
  const fmt = useFormat();
  const { len } = useUnits();
  const project = useProject();
  const blast = useActiveBlast();
  const explosives = project.library.explosives;
  const [explosiveId, setExplosiveId] = useState(explosives[0]?.id ?? '');
  const [kb, setKb] = useState(25);
  const [kd, setKd] = useState(1);
  const [ks, setKs] = useState(1);
  const [reference, setReference] = useState<Model>('ash');
  if (!blast) return null;

  const H = blast.bench.height;
  const rock = project.rockMasses.find((r) => r.id === blast.rockMassId);
  const explosive = explosives.find((e) => e.id === explosiveId) ?? explosives[0];
  const values: Record<Model, number | null> = {
    ash: ashBurden(diameter, kb),
    konya:
      explosive && rock
        ? konyaWalterBurden(diameter, explosive.density, rock.density, kd, ks)
        : null,
    andersen: andersenBurden(diameter, H + subdrill),
  };
  const ref = values[reference];
  const deviation = ref ? (burden - ref) / ref : 0;
  const ratio = stiffnessRatio(H, burden);
  const show = (m: number) => `${fmt(len.show(m), 2)} ${len.unit}`;

  return (
    <section className="panel">
      <h2>{t('burden.title')}</h2>
      <p className="hint">{t('burden.hint')}</p>
      <label className="field">
        <span className="field-label">{t('burden.explosive')}</span>
        <select
          value={explosive?.id ?? ''}
          onChange={(e) => {
            setExplosiveId(e.target.value);
          }}
        >
          {explosives.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} · {fmt(e.density)} kg/m³
            </option>
          ))}
        </select>
      </label>
      <NumberField label="Kb (Ash)" value={kb} decimals={1} min={1} onCommit={setKb} />
      <NumberField label="Kd (Konya)" value={kd} decimals={2} min={0.1} onCommit={setKd} />
      <NumberField label="Ks (Konya)" value={ks} decimals={2} min={0.1} onCommit={setKs} />
      <table className="grid-table compact">
        <thead>
          <tr>
            <th>{t('burden.reference')}</th>
            <th>{t('burden.model')}</th>
            <th>B</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {(['ash', 'konya', 'andersen'] as const).map((m) => {
            const v = values[m];
            return (
              <tr key={m}>
                <td>
                  <input
                    type="radio"
                    name="burden-reference"
                    checked={reference === m}
                    onChange={() => {
                      setReference(m);
                    }}
                  />
                </td>
                <td>{t(`burden.${m}`)}</td>
                <td className="num">{v === null ? '—' : show(v)}</td>
                <td>
                  {v !== null && (
                    <button
                      onClick={() => {
                        onBurden(Number(v.toFixed(2)));
                      }}
                    >
                      {t('burden.use')}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {ref !== null && Math.abs(deviation) > 0.1 && (
        <p className="warn">
          {t('burden.outOfRange', { b: show(burden), pct: fmt(deviation * 100) })}
        </p>
      )}
      <p className="muted">
        {t('burden.stiffness', {
          r: fmt(ratio, 2),
          rating: t(`burden.rating.${stiffnessRating(ratio)}`),
        })}
      </p>
      <div className="row">
        <span>
          {t('burden.spacing')}: {show(suggestedSpacing(H, burden))}
        </span>
        <button
          onClick={() => {
            onSpacing(Number(suggestedSpacing(H, burden).toFixed(2)));
          }}
        >
          {t('burden.use')}
        </button>
      </div>
      <p className="muted">
        {t('burden.stemming')}: {show(DEFAULT_STEMMING_RATIO * burden)}
      </p>
      <div className="row">
        <span>
          {t('burden.subdrill')}: {show(DEFAULT_SUBDRILL_RATIO * burden)}
        </span>
        <button
          onClick={() => {
            onSubdrill(Number((DEFAULT_SUBDRILL_RATIO * burden).toFixed(2)));
          }}
        >
          {t('burden.applySubdrill')}
        </button>
      </div>
    </section>
  );
}
