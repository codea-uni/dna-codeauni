import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { TOOLS } from '../components/Toolbar';
import { findGuideTarget, guideTargets, MAP_TOOLS, searchGuideTargets } from './targets';
import { TOUR_IDS, tourSteps, toursFor } from './tours';

vi.mock('../session', async () => {
  const { createEditorSession } = await import('@cronos/core');
  return {
    session: createEditorSession(),
    getEngine: () => null,
    getCompute: () => {
      throw new Error('sin worker en las pruebas');
    },
    APP_VERSION: 'test',
  };
});
vi.mock('../topography/session', () => ({
  topographyElevation: () => null,
  collectAssets: vi.fn(),
  drapeNewHoles: vi.fn(),
  storeEmbeddedAssets: vi.fn(),
}));

/** Todos los `data-guide` fijos escritos en la interfaz (sin los armados con plantilla). */
function anchorsInSource(): Set<string> {
  const root = join(__dirname, '..');
  const out = new Set<string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith('.tsx')) {
        const src = readFileSync(path, 'utf8');
        for (const m of src.matchAll(/data-guide="([^"]+)"|guide(?:=|: )["']([^"'`]+)["']/g))
          out.add(m[1] ?? m[2] ?? '');
      }
    }
  };
  walk(root);
  return out;
}

describe('agente guía', () => {
  it('cada paso de cada recorrido señala un control del catálogo', () => {
    for (const id of TOUR_IDS)
      for (const step of tourSteps(id))
        if (step.target) expect(findGuideTarget(step.target), `${id}: ${step.target}`).toBeDefined();
  });

  it('los controles marcados a mano existen en la interfaz', () => {
    const anchors = anchorsInSource();
    const templated = /^(ribbon|panel|window|tool|ug\.tab)\./;
    const manual = guideTargets().filter((x) => !templated.test(x.id));
    for (const target of manual) {
      // Los ítems de Importar y Exportar llevan `guide: 'import.x'` en el menú.
      expect(anchors.has(target.id), target.id).toBe(true);
    }
  });

  it('las herramientas del mapa son las de la cinta', () => {
    const ribbon = TOOLS.flatMap((group, g) => group.map((x) => [x.name, x.label, g]));
    expect(MAP_TOOLS).toEqual(ribbon);
  });

  it('no hay ids repetidos en el catálogo', () => {
    const ids = guideTargets().map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('los recorridos de cada herramienta no mezclan la otra', () => {
    expect(toursFor('surface')).toContain('firstBlast');
    expect(toursFor('surface')).not.toContain('ugFace');
    expect(toursFor('underground')).toContain('ugFace');
    expect(toursFor('underground')).not.toContain('firstBlast');
  });

  it('la búsqueda encuentra controles por palabras en español', () => {
    const ids = (q: string, kind: 'surface' | 'underground' = 'surface') =>
      searchGuideTargets(q, kind).map((x) => x.id);
    expect(ids('carga')).toContain('panel.charge');
    expect(ids('labores', 'underground')).toContain('import.workings');
    expect(ids('simular')).toContain('quick.simulate');
    // Lo subterráneo no aparece en un proyecto a cielo abierto.
    expect(ids('frente')).not.toContain('ug.send');
  });
});
