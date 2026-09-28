import type { DesignCheck, ImportWarning } from '@cronos/core';
import { t } from './index';
import { es } from './ns/core';

/**
 * Textos que genera el núcleo (revisión del diseño, avisos de importación, ejemplos). El núcleo no
 * conoce la interfaz: devuelve un id o código con sus parámetros, y aquí se traducen (G8). Lo que
 * no se reconoce se muestra con el texto en español del núcleo.
 */

type CoreKey = keyof typeof es;
type Vars = Record<string, string | number>;

const isKey = (k: string): k is CoreKey => k in es;

export function checkText(c: DesignCheck): { title: string; detail: string } {
  const title = `check.${c.id}.title`;
  const detail = `check.${c.id}.detail`;
  return isKey(title) && isKey(detail)
    ? { title: t(title), detail: t(detail, c.params) }
    : { title: c.title, detail: c.detail };
}

export function importWarningText(w: ImportWarning): string {
  const p = w.params;
  if (!p) return messageText(w.message);
  switch (w.kind) {
    case 'swapXY':
      return t(p.variant === 'utm' ? 'import.warn.swapXYUtm' : 'import.warn.swapXYDigits');
    case 'outOfCrs':
      return t(p.fileEpsg === undefined ? 'import.warn.outOfCrs' : 'import.warn.crsMismatch', p);
    default:
      return t(`import.warn.${w.kind}`, p);
  }
}

export function exampleText(
  id: string,
  fallback: { name: string; description: string },
): { name: string; description: string } {
  const name = `example.${id}.name`;
  const description = `example.${id}.description`;
  return isKey(name) && isKey(description)
    ? { name: t(name), description: t(description) }
    : fallback;
}

/** Error de una fila importada (CSV, GeoJSON, catálogo, perímetros). */
export function importErrorText(e: { line?: number; message: string }): string {
  const message = messageText(e.message);
  return e.line === undefined ? message : t('import.err.line', { line: e.line, message });
}

/** Error al abrir un archivo de proyecto. */
export function parseErrorText(error: string): string {
  return messageText(error);
}

/**
 * Mensajes en texto plano del núcleo (errores de GeoJSON, perímetros, DXF y proyecto), reconocidos
 * con las plantillas en español de `ns/core.ts`: `{x}` captura el valor y `{message}` se traduce
 * a su vez («Línea 3: …», «Punto 2: …»).
 * ponytail: depende de que el núcleo no cambie esos textos; si cambian, se muestra el español.
 */
const MESSAGE_KEYS: CoreKey[] = [
  'import.err.line',
  'import.err.point',
  'import.err.nonNumericXY',
  'import.err.invalidGeometry',
  'import.err.duplicateId',
  'import.err.duplicateIdExisting',
  'import.err.missingExplosiveFields',
  'import.err.notJson',
  'import.err.notGeoJson',
  'import.err.lonLat',
  'import.err.noEastNorth',
  'import.err.nonNumericEN',
  'import.err.fewVertices',
  'import.dxf.flatLines',
  'import.dxf.noZ',
  'import.dxf.openPolyline',
  'project.notProject',
  'project.schemaTooNew',
  'project.invalid',
];

const PATTERNS = MESSAGE_KEYS.map((key) => {
  const source = es[key]
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\\{(\w+)\\\}/g, '(?<$1>[\\s\\S]*?)');
  return { key, re: new RegExp(`^${source}$`) };
});

function messageText(message: string): string {
  for (const { key, re } of PATTERNS) {
    const m = re.exec(message);
    if (!m) continue;
    const vars: Vars = { ...m.groups };
    if (typeof vars.message === 'string') vars.message = messageText(vars.message);
    return t(key, vars);
  }
  return message;
}
