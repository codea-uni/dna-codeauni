import { Activity } from 'lucide-react';
import { useFormat, useT } from '../i18n';
import {
  lawSummary,
  openVibrationCalibration,
  useVibrationLawStatus,
} from '../vibration/lawStatus';

/**
 * Ley de PPV en uso, siempre a la vista en la barra de estado: verde si viene de sismógrafos de la
 * mina, ámbar si es la genérica (y avisa si la mina ya tiene mediciones sin usar). Clic: abre la
 * calibración en la ventana Vibración.
 */
export function VibrationLawChip() {
  const t = useT();
  const fmt = useFormat();
  const { law, available } = useVibrationLawStatus();
  if (!law) return null;
  const calibrated = Boolean(law.fit);
  const label = law.fit
    ? t('status.law.calibrated', { name: law.name, n: law.fit.n })
    : available
      ? t('status.law.unused')
      : t('status.law.generic');
  return (
    <button
      type="button"
      className={`status-law ${calibrated ? 'ok' : 'warn'}`}
      title={`${t('vib.lawInUse')}: ${lawSummary(law, t, fmt)}\n${t('status.law.open')}`}
      onClick={openVibrationCalibration}
    >
      <Activity size={12} aria-hidden />
      {label}
    </button>
  );
}
