import type { DesignCheck, ImportWarning } from '@cronos/core';

/**
 * Textos que genera el núcleo (revisión del diseño, avisos de importación, ejemplos). El núcleo no
 * conoce la interfaz: devuelve un id o código con sus parámetros, y aquí se traducen (G8).
 * Provisional: devuelve el texto en español del núcleo.
 */
export function checkText(c: DesignCheck): { title: string; detail: string } {
  return { title: c.title, detail: c.detail };
}

export function importWarningText(w: ImportWarning): string {
  return w.message;
}

export function exampleText(
  _id: string,
  fallback: { name: string; description: string },
): { name: string; description: string } {
  return fallback;
}
