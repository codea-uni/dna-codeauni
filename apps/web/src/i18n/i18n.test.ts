import { describe, expect, it } from 'vitest';
import { formatDateTime, formatDay, t, useLocale } from './index';

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

describe('fechas', () => {
  it('día de calendario en DD/MM/AAAA (español) y MM/DD/AAAA (inglés), sin correrse por la zona horaria', () => {
    expect(formatDay('2026-10-21', 'es')).toBe('21/10/2026');
    expect(formatDay('2026-01-05', 'en')).toBe('01/05/2026');
    expect(formatDay('sin fecha', 'es')).toBe('sin fecha');
  });

  it('fecha y hora con el año completo', () => {
    expect(formatDateTime('2026-10-21T15:04:00', 'es')).toMatch(/^21\/10\/2026/);
  });
});
