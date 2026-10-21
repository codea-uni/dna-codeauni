import type { DisplayUnits } from '@cronos/core';
import { useProject } from '../hooks/useDocument';
import { useT } from '../i18n';
import { session } from '../session';

/**
 * Unidad del diámetro (mm o pulgadas) junto al campo, sin ir a Ajustes del proyecto: cambia la
 * presentación del proyecto (el dato se guarda siempre en metros).
 */
export function DiameterUnitToggle() {
  const t = useT();
  const units = useProject().displayUnits;
  const set = (diameter: DisplayUnits['diameter']) => {
    if (diameter === units.diameter) return;
    session.document.dispatch(
      { type: 'project/patch', patch: { displayUnits: { ...units, diameter } } },
      t('settings.units'),
    );
  };
  return (
    <div className="unit-toggle" role="group" aria-label={t('units.diameterUnit')}>
      {(['mm', 'in'] as const).map((u) => (
        <button
          key={u}
          type="button"
          className={units.diameter === u ? 'active' : ''}
          aria-pressed={units.diameter === u}
          onClick={() => {
            set(u);
          }}
        >
          {u === 'mm' ? 'mm' : t('units.inches')}
        </button>
      ))}
    </div>
  );
}
