import { describe, expect, it } from 'vitest';
import { KEEP_VERSIONS, planWrite, type VersionInfo } from './history';

const at = (min: number) => new Date(Date.UTC(2026, 8, 28, 12, min));
const v = (id: number, min: number, projectId = 'P'): VersionInfo => ({
  id,
  projectId,
  name: 'x',
  savedAt: at(min).toISOString(),
  holes: 0,
});

describe('historial de autoguardado', () => {
  it('sobrescribe la última versión si tiene menos de un minuto; si no, crea otra', () => {
    expect(planWrite([], 'P', at(0))).toEqual({ overwriteId: null, deleteIds: [] });
    const list = [v(1, 0), v(2, 5), v(3, 1, 'otro')];
    expect(planWrite(list, 'P', new Date(at(5).getTime() + 30_000)).overwriteId).toBe(2);
    expect(planWrite(list, 'P', at(7)).overwriteId).toBeNull();
  });

  it(`conserva ${String(KEEP_VERSIONS)} versiones por proyecto y borra las más viejas`, () => {
    const list = Array.from({ length: KEEP_VERSIONS }, (_, i) => v(i + 1, i * 2));
    list.push(v(99, 0, 'otro'));
    // Nueva versión (la última tiene más de un minuto): se borra la más vieja de P, no la de otro.
    expect(planWrite(list, 'P', at(100))).toEqual({ overwriteId: null, deleteIds: [1] });
  });
});
