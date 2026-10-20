import { BookOpen } from 'lucide-react';
import { methodModel, plannedAlternatives, type MethodId } from '@cronos/core';
import { Formula } from '../components/Formula';
import { modelAnchor, openDocumentation } from '../documentation/docsNav';
import { useFormat, useLocale, useT } from '../i18n';

/** Valores que usa ahora el cálculo, por `key` de variable, en la unidad del catálogo. */
export type MethodValues = Readonly<Record<string, number | string | null | undefined>>;

/** Cuerpo del Detalle (diferido: trae KaTeX). Ver `MethodDetail`. */
export default function MethodDetailBody({
  id,
  values,
  alternatives,
}: {
  id: MethodId;
  values?: MethodValues;
  alternatives?: readonly MethodId[];
}) {
  const t = useT();
  const fmt = useFormat();
  const locale = useLocale((s) => s.locale);
  const m = methodModel(id);
  const show = (x: number | string | null | undefined, decimals = 2): string =>
    x === null || x === undefined
      ? '—'
      : typeof x === 'number'
        ? Number.isFinite(x)
          ? fmt(x, decimals)
          : '—'
        : x;
  const inputs = m.variables.filter((x) => !x.output);
  const outputs = m.variables.filter((x) => x.output);
  const hasValues =
    values !== undefined &&
    m.variables.some((x) => values[x.key] !== undefined && values[x.key] !== null);
  const others = (alternatives ?? [])
    .filter((a) => a !== id)
    .map((a) => methodModel(a).name[locale]);
  const planned = plannedAlternatives(id).map((p) => p.name[locale]);
  return (
    <div className="method-detail-body">
      <h4 className="method-detail-title">{m.name[locale]}</h4>
      <dl className="method-detail-meta">
        <div>
          <dt>{t('md.authors')}</dt>
          <dd>{m.authors}</dd>
        </div>
        <div>
          <dt>{t('md.reference')}</dt>
          <dd>{m.reference}</dd>
        </div>
        <div>
          <dt>{t('md.confidence')}</dt>
          <dd>
            <span className="method-detail-badge" title={t('md.confidenceHelp')}>
              {m.confidence}
            </span>
          </dd>
        </div>
        <div>
          <dt>{t('md.rules')}</dt>
          <dd className="method-detail-rules">
            {m.rules.map((r) => (
              <code key={r}>{r}</code>
            ))}
          </dd>
        </div>
      </dl>
      {m.status === 'visual' && <p className="hint">{t('md.visual')}</p>}
      <div className="method-detail-formulas" aria-label={t('md.formula')}>
        {m.formulas.map((f, i) => (
          <Formula
            key={f}
            tex={f}
            label={`${m.name[locale]} (${String(i + 1)})`}
            className="method-detail-formula"
          />
        ))}
      </div>
      {m.variables.length > 0 && (
        <>
          <h5>{t('md.variables')}</h5>
          <div className="method-detail-table-wrap">
            <table className="method-detail-vars">
              <thead>
                <tr>
                  <th scope="col">{t('md.symbol')}</th>
                  <th scope="col">{t('md.meaning')}</th>
                  <th scope="col" className="num">
                    {t('md.value')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...inputs, ...outputs].map((x) => (
                  <tr key={x.key} className={x.output ? 'output' : undefined}>
                    <td>
                      <Formula
                        tex={x.tex}
                        label={x.key}
                        className="method-detail-symbol"
                        display={false}
                      />
                    </td>
                    <td>
                      {x.output && <span className="method-detail-arrow">→ </span>}
                      {x.name[locale]}
                    </td>
                    <td className="num">
                      {show(values?.[x.key], x.decimals)}
                      {x.unit && <span className="muted"> {x.unit}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!hasValues && <p className="hint muted">{t('md.noValues')}</p>}
        </>
      )}
      <h5>{t('md.assumptions')}</h5>
      <ul className="method-detail-list">
        {m.assumptions.map((a) => (
          <li key={a.en}>{a[locale]}</li>
        ))}
      </ul>
      <p className="hint">
        <strong>{t('md.where')}:</strong> {m.where[locale]}
      </p>
      {others.length > 0 && (
        <p className="hint">{t('md.alternatives', { list: others.join(' · ') })}</p>
      )}
      {planned.length > 0 && (
        <p className="hint muted">{t('md.planned', { list: planned.join(' · ') })}</p>
      )}
      <button
        type="button"
        className="method-detail-docs"
        onClick={() => {
          openDocumentation(`models.${m.topic}`, modelAnchor(m.id));
        }}
      >
        <BookOpen size={14} aria-hidden="true" />
        {t('md.openDocs')}
      </button>
    </div>
  );
}
