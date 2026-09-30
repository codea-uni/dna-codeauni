import type { DiffSummary } from '@cronos/core';
import { describe, expect, it } from 'vitest';
import { t, useLocale } from '../i18n';
import { summaryParts } from './summaryText';

const EMPTY: DiffSummary = {
  blastsAdded: 0,
  blastsRemoved: 0,
  holesAdded: 0,
  holesRemoved: 0,
  holesMoved: 0,
  holesGeometry: 0,
  holesCharge: 0,
  holesTiming: 0,
  holesOther: 0,
  blastFields: [],
  projectFields: [],
};

describe('summaryParts', () => {
  it('lista solo lo que cambió, con los campos traducidos', () => {
    useLocale.getState().setLocale('es');
    const parts = summaryParts(
      {
        ...EMPTY,
        holesAdded: 3,
        holesMoved: 2,
        blastFields: ['bench', 'initiation'],
        projectFields: ['name'],
      },
      t,
    );
    expect(parts).toEqual(['+3 taladros', '2 movidos', 'cambió: nombre, banco, amarre']);
  });

  it('sin cambios lo dice', () => {
    useLocale.getState().setLocale('en');
    expect(summaryParts(EMPTY, t)).toEqual(['no design changes']);
    useLocale.getState().setLocale('es');
  });

  it('usa el singular con uno solo', () => {
    useLocale.getState().setLocale('es');
    expect(summaryParts({ ...EMPTY, holesMoved: 1, holesAdded: 2 }, t)).toEqual([
      '+2 taladros',
      '1 movido',
    ]);
  });
});
