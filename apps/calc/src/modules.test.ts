import {
  asDrilledProject,
  computeCharges,
  EXAMPLES,
  fragmentation,
  fragmentationHeadline,
  kuzRamInputsFromBlast,
  type Project,
} from '@cronos/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { InputError, prepare, runModule, type RunRequest } from './modules';

// El servicio no calcula nada propio: estas pruebas comparan con el núcleo (mismos números que la
// aplicación) y vigilan que la respuesta no exponga coeficientes de los modelos.

let project: Project;
let request: RunRequest;

beforeAll(async () => {
  const ex = EXAMPLES.find((e) => e.id === 'production');
  if (!ex) throw new Error('falta el ejemplo production');
  project = (await ex.build()).project;
  request = { project: project as unknown as Record<string, unknown> };
});

/** Claves de coeficientes o pasos intermedios que nunca deben salir del servicio. */
const FORBIDDEN =
  /^(k|beta|alpha|n|xc|b|rockFactor|rock_factor|law|swebrecB|velocityModel|launchAngle.*|x50)$/;
function forbiddenKeys(v: unknown, path = ''): string[] {
  if (Array.isArray(v)) return v.flatMap((x, i) => forbiddenKeys(x, `${path}[${String(i)}]`));
  if (v && typeof v === 'object')
    return Object.entries(v).flatMap(([k, x]) => [
      ...(FORBIDDEN.test(k) ? [`${path}.${k}`] : []),
      ...forbiddenKeys(x, `${path}.${k}`),
    ]);
  return [];
}

describe('prepare', () => {
  it('acepta el proyecto solo o el archivo cronos-project', () => {
    expect(prepare(request).blast.holes.length).toBeGreaterThan(0);
    const file = {
      format: 'cronos-project',
      schemaVersion: 1,
      savedAt: '2026-10-23T00:00:00Z',
      appVersion: 'x',
      project,
    };
    expect(() => prepare({ project: file })).not.toThrow(InputError);
  });

  it('rechaza un proyecto inválido o una voladura que no existe', () => {
    expect(() => prepare({ project: { foo: 1 } })).toThrow(InputError);
    expect(() => prepare({ ...request, blast_id: 'no-existe' })).toThrow(/No existe la voladura/);
  });
});

describe('módulos', () => {
  it('fragmentación: los mismos percentiles que el núcleo, sin parámetros del modelo', () => {
    const { result } = runModule('fragmentation', request);
    const p = asDrilledProject(project);
    const blast = p.blasts.find((b) => b.holes.length > 0);
    if (!blast) throw new Error('sin voladura');
    const rock = p.rockMasses.find((r) => r.id === blast.rockMassId);
    if (!rock) throw new Error('sin roca');
    const inputs = kuzRamInputsFromBlast(
      blast,
      p.library,
      computeCharges(blast, p.library, rock.density),
      rock,
    );
    if (!inputs) throw new Error('sin entradas');
    const h = fragmentationHeadline(
      fragmentation(inputs, { oversizeSize: 1, finesSize: 0.01 }),
      'swebrec',
    );
    const r = result as { p80_cm: number; p50_cm: number; passing: unknown[] };
    expect(r.p80_cm).toBeCloseTo(h.p80 * 100, 1);
    expect(r.p50_cm).toBeCloseTo(h.p50 * 100, 1);
    expect(r.passing.length).toBeGreaterThan(5);
    expect(forbiddenKeys(result)).toEqual([]);
  });

  it('análisis: carga y secuencia de la voladura', () => {
    const { result } = runModule('analysis', request);
    const r = result as {
      holes: number;
      total_explosive_kg: number;
      firing: { span_ms: number | null };
    };
    expect(r.holes).toBe(prepare(request).blast.holes.length);
    expect(r.total_explosive_kg).toBeGreaterThan(0);
    expect(forbiddenKeys(result)).toEqual([]);
  });

  it('vibración: puntos de control sin la ley (K, β) en la respuesta', () => {
    const { result } = runModule('vibration', request);
    const r = result as { points: { ppv_mm_s: number | null }[] };
    expect(Array.isArray(r.points)).toBe(true);
    expect(forbiddenKeys(result)).toEqual([]);
  });

  it('pila: volúmenes y desplazamientos, sin la ley de velocidad', () => {
    const { result } = runModule('muckpile', request);
    const r = result as { in_situ_volume_m3: number; pile_volume_m3: number };
    expect(r.in_situ_volume_m3).toBeGreaterThan(0);
    expect(r.pile_volume_m3).toBeGreaterThan(r.in_situ_volume_m3);
    expect(forbiddenKeys(result)).toEqual([]);
  });

  it('la firma del diseño cambia en un solo parámetro si cambia el burden', () => {
    const a = runModule('fragmentation', request).signature;
    const changed = structuredClone(project);
    const pattern = changed.blasts.find((b) => b.holes.length > 0)?.patterns[0];
    if (!pattern) throw new Error('sin patrón');
    (pattern as { burden: number }).burden += 0.1;
    const b = runModule('fragmentation', {
      project: changed as unknown as Record<string, unknown>,
    }).signature;
    const diff = Object.keys({ ...a, ...b }).filter((k) => a[k] !== b[k]);
    expect(diff).toEqual(['pattern.0.burden']);
  });
});
