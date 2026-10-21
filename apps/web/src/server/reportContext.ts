import type { MonitoringPoint } from '@cronos/core';
import { t } from '../i18n';
import { minePointsForCalc } from '../vibration/mineStore';
import { useAuth } from './api';
import { hasUnpublished, useProjectSession } from './projectSession';

/** Ficha del informe PDF y lo que la pantalla suma al cálculo (puntos de la mina). */
export interface ReportContext {
  company?: string;
  mine?: string;
  version?: string;
  author?: string;
  extraPoints: MonitoringPoint[];
}

/**
 * Empresa, mina, versión (vN; con cambios sin publicar se aclara) y autor del proyecto abierto,
 * y los puntos de control de la mina que entran al cálculo de vibración en pantalla, para que el
 * informe muestre lo mismo. Sin servidor (proyecto local) solo van los puntos.
 */
export function reportContext(): ReportContext {
  const cur = useProjectSession.getState().current;
  const auth = useAuth.getState();
  const out: ReportContext = { extraPoints: minePointsForCalc() };
  const company = auth.organization?.name;
  if (company) out.company = company;
  if (cur) {
    out.mine = cur.mine.name;
    out.version = hasUnpublished()
      ? t('report.versionUnpublished', { n: cur.base.number })
      : `v${String(cur.base.number)}`;
  }
  const author = auth.user?.name;
  if (author) out.author = author;
  return out;
}
