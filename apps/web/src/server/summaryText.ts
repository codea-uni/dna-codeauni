import type { DiffSummary } from '@cronos/core';
import type { MessageKey, t as translate } from '../i18n';

/** Campo del resumen, texto en plural y en singular (n = 1). */
const COUNTS = [
  ['blastsAdded', 'history.s.blastsAdded', 'history.s.blastsAddedOne'],
  ['blastsRemoved', 'history.s.blastsRemoved', 'history.s.blastsRemovedOne'],
  ['holesAdded', 'history.s.holesAdded', 'history.s.holesAddedOne'],
  ['holesRemoved', 'history.s.holesRemoved', 'history.s.holesRemovedOne'],
  ['holesMoved', 'history.s.holesMoved', 'history.s.holesMovedOne'],
  ['holesGeometry', 'history.s.holesGeometry', 'history.s.holesGeometryOne'],
  ['holesCharge', 'history.s.holesCharge', 'history.s.holesChargeOne'],
  ['holesTiming', 'history.s.holesTiming', 'history.s.holesTimingOne'],
  ['holesOther', 'history.s.holesOther', 'history.s.holesOtherOne'],
] as const satisfies readonly (readonly [keyof DiffSummary, MessageKey, MessageKey])[];

const FIELD_KEYS: Record<string, MessageKey> = {
  name: 'history.field.name',
  description: 'history.field.description',
  currency: 'history.field.currency',
  coordinateSystem: 'history.field.coordinateSystem',
  library: 'history.field.library',
  rockMasses: 'history.field.rockMasses',
  siteModels: 'history.field.siteModels',
  surfaces: 'history.field.surfaces',
  monitoringPoints: 'history.field.monitoringPoints',
  ppvLimits: 'history.field.ppvLimits',
  scenarios: 'history.field.scenarios',
  displayUnits: 'history.field.displayUnits',
  status: 'history.field.status',
  bench: 'history.field.bench',
  rockMassId: 'history.field.rockMassId',
  boundaries: 'history.field.boundaries',
  freeFaces: 'history.field.freeFaces',
  groups: 'history.field.groups',
  patterns: 'history.field.patterns',
  initiation: 'history.field.initiation',
  calcParams: 'history.field.calcParams',
  notes: 'history.field.notes',
};

/** Resumen de cambios en frases cortas («+3 taladros», «2 movidos», «cambió: banco, amarre»). */
export function summaryParts(s: DiffSummary, t: typeof translate): string[] {
  const parts: string[] = COUNTS.filter(([k]) => s[k] > 0).map(([k, many, one]) =>
    t(s[k] === 1 ? one : many, { n: s[k] }),
  );
  const fields = [...new Set([...s.projectFields, ...s.blastFields])];
  if (fields.length)
    parts.push(
      t('history.s.fields', {
        fields: fields.map((f) => (FIELD_KEYS[f] ? t(FIELD_KEYS[f]) : f)).join(', '),
      }),
    );
  return parts.length ? parts : [t('history.s.none')];
}
