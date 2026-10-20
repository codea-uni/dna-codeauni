import { describe, expect, it } from 'vitest';
import {
  fitsKind,
  kindOrder,
  mineToolPath,
  otherKind,
  projectPath,
  toolFromSearch,
} from './product';

describe('Cronos Open Pit / Cronos Underground', () => {
  it('cada herramienta muestra sus paneles y oculta los de la otra', () => {
    // Subterránea solo en underground; malla de banco, pila y cara libre solo en superficie.
    expect(fitsKind('underground', 'surface')).toBe(false);
    expect(fitsKind('underground', 'underground')).toBe(true);
    for (const id of ['pattern', 'muckpile', 'freeFace']) {
      expect(fitsKind(id, 'surface')).toBe(true);
      expect(fitsKind(id, 'underground')).toBe(false);
    }
    // Lo que aplica en ambas.
    for (const id of [
      'topography',
      'vibration',
      'energy',
      'fragmentation',
      'timing',
      'charge',
      'library',
      'ai',
    ]) {
      expect(fitsKind(id, 'surface')).toBe(true);
      expect(fitsKind(id, 'underground')).toBe(true);
    }
  });

  it('en Underground su panel va primero', () => {
    expect(kindOrder('underground', 'underground')).toBeLessThan(kindOrder('blast', 'underground'));
    expect(kindOrder('underground', 'surface')).toBe(kindOrder('blast', 'surface'));
  });

  it('un proyecto de la otra herramienta se abre con ?tool= (solo visualización)', () => {
    expect(projectPath('p1', 'surface', 'surface')).toBe('/projects/p1');
    expect(projectPath('p1', 'underground', 'surface')).toBe('/projects/p1?tool=surface');
    expect(mineToolPath('m1', 'underground')).toBe('/mines/m1?tool=underground');
    expect(otherKind('surface')).toBe('underground');
  });

  it('lee la herramienta de la URL', () => {
    expect(toolFromSearch(new URLSearchParams('tool=underground'))).toBe('underground');
    expect(toolFromSearch(new URLSearchParams('tool=surface'))).toBe('surface');
    expect(toolFromSearch(new URLSearchParams('tool=x'))).toBeNull();
    expect(toolFromSearch(new URLSearchParams(''))).toBeNull();
  });
});
