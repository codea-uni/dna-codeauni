import { describe, expect, it } from 'vitest';
import { t, useLocale } from './index';

describe('i18n', () => {
  it('traduce con el idioma activo e interpola variables', () => {
    useLocale.getState().setLocale('es');
    expect(t('toolbar.undo')).toBe('Deshacer');
    expect(t('toolbar.undoNamed', { label: 'Mover taladros' })).toBe('Deshacer: Mover taladros');
    useLocale.getState().setLocale('en');
    expect(t('toolbar.undoNamed', { label: 'Move holes' })).toBe('Undo: Move holes');
    useLocale.getState().setLocale('es');
  });
});
