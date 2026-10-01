import { analyzeBlast, buildProblems, EXAMPLES } from '@cronos/core';
import { describe, expect, it } from 'vitest';
import { checkText, exampleText } from './coreText';
import { useLocale } from './index';

/** Revisión del ejemplo «problemas típicos» (dispara todas las alertas) y de los demás ejemplos. */
async function allChecks() {
  const projects = [
    buildProblems(),
    ...(await Promise.all(EXAMPLES.map((e) => e.build()))).map((b) => b.project),
  ];
  return projects.flatMap((p) => {
    const blast = p.blasts[0];
    return blast ? (analyzeBlast(p, blast.id)?.checks ?? []) : [];
  });
}

const checks = await allChecks();

describe('textos del núcleo traducidos (G8)', () => {
  it('en español, la revisión del diseño es idéntica al texto del núcleo', () => {
    useLocale.getState().setLocale('es');
    expect(checks.length).toBeGreaterThan(5);
    for (const c of checks) expect(checkText(c)).toEqual({ title: c.title, detail: c.detail });
    for (const e of EXAMPLES)
      expect(exampleText(e.id, e), e.id).toEqual({ name: e.name, description: e.description });
  });

  it('en inglés, cada observación tiene su traducción, sin marcadores sin reemplazar', () => {
    useLocale.getState().setLocale('en');
    for (const c of checks) {
      const { title, detail } = checkText(c);
      expect(title, c.id).not.toBe(c.title);
      expect(detail, c.id).not.toBe(c.detail);
      expect(`${title} ${detail}`, c.id).not.toMatch(/\{\w+\}/);
    }
    for (const e of EXAMPLES) expect(exampleText(e.id, e).name, e.id).not.toBe(e.name);
    useLocale.getState().setLocale('es');
  });
});
