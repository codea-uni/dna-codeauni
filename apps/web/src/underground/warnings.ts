import type { FaceWarning } from '@cronos/core';
import type { t as translate } from '../i18n';

type Translate = typeof translate;

/** Texto de un aviso del método sueco (panel y asistente). */
export function faceWarningText(
  w: FaceWarning,
  t: Translate,
  fmt: (v: number, d?: number) => string,
): string {
  const p = w.params ?? {};
  const v = (k: string, d = 2) => fmt(p[k] ?? NaN, d);
  switch (w.code) {
    case 'reliefNotLarger':
      return t('ug.warn.reliefNotLarger', {
        relief: fmt((p.reliefDiameter ?? NaN) * 1000, 0),
        hole: fmt((p.holeDiameter ?? NaN) * 1000, 0),
      });
    case 'firstBurdenNonPositive':
      return t('ug.warn.firstBurdenNonPositive', { f: v('drillingError') });
    case 'cutChargeBelowRequired':
      return t('ug.warn.cutChargeBelowRequired', {
        required: v('required', 3),
        available: v('available', 3),
      });
    case 'cutBurdenLimited':
      return t('ug.warn.cutBurdenLimited', { square: v('square', 0) });
    case 'depthLimited':
      return t('ug.warn.depthLimited', { relief: v('depthFromRelief'), depth: v('depth') });
    case 'lifterBurdenOver06L':
      return t('ug.warn.lifterBurdenOver06L', { burden: v('burden'), limit: v('limit') });
    case 'holesOutsideProfile':
      return t('ug.warn.holesOutsideProfile', { count: v('count', 0) });
    case 'cutOutsideProfile':
      return t('ug.warn.cutOutsideProfile');
    case 'contourChargeExceedsExplosive':
      return t('ug.warn.contourChargeExceedsExplosive', {
        required: v('required', 3),
        available: v('available', 3),
      });
    case 'singleCutSquare':
      return t('ug.warn.singleCutSquare');
  }
}
