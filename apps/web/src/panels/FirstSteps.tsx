import { EXAMPLES } from '@cronos/core';
import { Check } from 'lucide-react';
import * as actions from '../actions';
import { useWorkflow } from '../hooks/useWorkflow';
import { useT, type MessageKey } from '../i18n';
import { exampleText } from '../i18n/coreText';
import { useUiStore } from '../stores/uiStore';

/**
 * Guía de entrada (observación 2 del ingeniero): qué falta para que cada pestaña tenga sentido.
 * Se muestra en Diseño hasta completar el flujo básico y desaparece sola después.
 */
export function FirstSteps() {
  const t = useT();
  const w = useWorkflow();
  const setTab = useUiStore((s) => s.setLeftTab);
  const steps: { done: boolean; label: MessageKey; hint: MessageKey; go?: () => void }[] = [
    { done: w.boundary, label: 'steps.boundary', hint: 'steps.boundaryHint' },
    { done: w.freeFace, label: 'steps.freeFace', hint: 'steps.freeFaceHint' },
    { done: w.holes, label: 'steps.pattern', hint: 'steps.patternHint' },
    {
      done: w.charged,
      label: 'steps.charge',
      hint: 'steps.chargeHint',
      go: () => {
        setTab('charge');
      },
    },
    {
      done: w.tied,
      label: 'steps.tie',
      hint: 'steps.tieHint',
      go: () => {
        setTab('timing');
      },
    },
  ];
  if (steps.every((s) => s.done)) return null;
  const next = steps.findIndex((s) => !s.done);
  const example = EXAMPLES.find((e) => e.id === 'production');

  return (
    <section className="panel first-steps">
      <h2>{t('steps.title')}</h2>
      <ol>
        {steps.map((s, i) => (
          <li key={s.label} className={s.done ? 'done' : i === next ? 'next' : ''}>
            <span className="step-mark">{s.done ? <Check size={12} /> : i + 1}</span>
            <div>
              {s.go && !s.done && i === next ? (
                <button className="link" onClick={s.go}>
                  {t(s.label)}
                </button>
              ) : (
                <strong>{t(s.label)}</strong>
              )}
              {i === next && <p className="hint">{t(s.hint)}</p>}
            </div>
          </li>
        ))}
      </ol>
      <p className="hint">{t('steps.unlock')}</p>
      {!w.holes && example && (
        <button
          onClick={() => {
            void actions.loadExample(example.id, exampleText(example.id, example).name);
          }}
        >
          {t('steps.example')}
        </button>
      )}
    </section>
  );
}
