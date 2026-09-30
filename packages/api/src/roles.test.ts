import { describe, expect, it } from 'vitest';
import { permissions, ROLES } from './roles';

describe('permisos por rol (guía 01 §1.4, H-801)', () => {
  it('el revisor ve y comenta, pero no edita', () => {
    expect(permissions.editDesign('reviewer')).toBe(false);
    expect(permissions.manageMembers('reviewer')).toBe(false);
  });

  it('el diseñador edita pero no administra la empresa', () => {
    expect(permissions.editDesign('designer')).toBe(true);
    expect(permissions.manageMembers('designer')).toBe(false);
    expect(permissions.manageMines('designer')).toBe(false);
  });

  it('el administrador puede todo', () => {
    for (const can of Object.values(permissions)) expect(can('admin')).toBe(true);
    expect(ROLES).toEqual(['admin', 'designer', 'reviewer']);
  });
});
