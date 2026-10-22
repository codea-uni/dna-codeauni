import {
  defaultVibrationLaw,
  fitByZone,
  isUncalibratedLaw,
  isUndergroundBlast,
  type VibrationLaw,
  type ZoneFit,
} from '@cronos/core';
import { useMemo } from 'react';
import { openWorkspacePanelAt } from '../components/WorkspaceWindows';
import { useProject } from '../hooks/useDocument';
import type { useFormat, useT } from '../i18n';
import { useMineVibration } from './mineStore';

export interface VibrationLawStatus {
  /** Ley de PPV en uso (la misma del cálculo y del informe); null sin leyes en el sitio. */
  law: VibrationLaw | null;
  /** Ajuste de la mina para este tipo de voladura que no se está usando (ley genérica en uso). */
  available: ZoneFit | undefined;
}

/**
 * Ley de PPV en uso y, si es la genérica, el ajuste de sismógrafos de la mina que podría usarse.
 * La comparten la ventana Vibración y el indicador de la barra de estado.
 */
export function useVibrationLawStatus(): VibrationLawStatus {
  const project = useProject();
  const records = useMineVibration((m) => m.records);
  const fits = useMemo(() => fitByZone(records), [records]);
  const blast = project.blasts[0];
  const law = defaultVibrationLaw(project, blast);
  const context = blast && isUndergroundBlast(blast) ? 'underground' : 'surface';
  const available =
    law && isUncalibratedLaw(law)
      ? fits.find((f) => f.context === context && f.squareRoot)
      : undefined;
  return { law, available };
}

/** Id del título «Calibración de la ley» en la ventana Vibración. */
export const CALIBRATION_ANCHOR = 'vib-calibration';

/** Abre la ventana Vibración y lleva la vista a «Calibración de la ley». */
export function openVibrationCalibration(): void {
  openWorkspacePanelAt('vibration', CALIBRATION_ANCHOR);
}

/** «Tajo Norte · 95 % (n = 12, R² = 0,99) · K = 1.505 mm/s, β = 1,58» o «Genérica (USBM), sin calibrar». */
export function lawSummary(
  law: VibrationLaw,
  t: ReturnType<typeof useT>,
  fmt: ReturnType<typeof useFormat>,
): string {
  const kb = t('vib.lawFormula', { k: fmt(law.k * 1000, 0), beta: fmt(law.beta, 2) });
  return law.fit
    ? `${law.name} (n = ${String(law.fit.n)}, R² = ${fmt(law.fit.r2, 2)}) · ${kb}`
    : `${law.name}, ${t('vib.notCalibrated')} · ${kb}`;
}
