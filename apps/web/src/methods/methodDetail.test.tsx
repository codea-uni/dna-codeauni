import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import katex from 'katex';
import { describe, expect, it } from 'vitest';
import { isMethodId, METHOD_MODELS } from '@cronos/core';
import { chapters } from '../documentation/content';
import { useLocale } from '../i18n';
import { MethodDetail } from './MethodDetail';
import MethodDetailBody from './MethodDetailBody';

const SRC = join(import.meta.dirname, '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !name.includes('.test.') ? [path] : [];
  });
}

const strict = (tex: string, displayMode: boolean) =>
  katex.renderToString(tex, { displayMode, strict: 'error', throwOnError: true });

describe('catálogo ↔ paneles', () => {
  it('cada «Detalle» de los paneles apunta a un modelo del catálogo', () => {
    const ids = new Set<string>();
    for (const file of sources(SRC)) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/<MethodDetail\s+id="([^"]+)"/g)) ids.add(m[1] ?? '');
    }
    expect(ids.size).toBeGreaterThanOrEqual(20);
    for (const id of ids) expect(isMethodId(id), id).toBe(true);
  });

  it('todas las fórmulas (catálogo y Documentación) se leen en KaTeX estricto', () => {
    for (const m of METHOD_MODELS) {
      for (const f of m.formulas) expect(() => strict(f, true), `${m.id}: ${f}`).not.toThrow();
      for (const v of m.variables)
        expect(() => strict(v.tex, false), `${m.id}.${v.key}`).not.toThrow();
    }
    for (const c of chapters)
      for (const e of c.equations)
        expect(() => strict(e.tex, true), `${c.id}: ${e.name.es}`).not.toThrow();
  });
});

describe('MethodDetail', () => {
  it('barra cerrada: modelo, botón «Detalle» accesible y sin panel', () => {
    useLocale.setState({ locale: 'es' });
    const html = renderToString(createElement(MethodDetail, { id: 'vibration.usbm' }));
    expect(html).toContain('Ley USBM (raíz cuadrada)');
    expect(html).toContain('Detalle');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('method-detail-panel');
  });

  it('con selector: muestra solo metodologías implementadas', () => {
    const html = renderToString(
      createElement(MethodDetail, {
        id: 'vibration.ambraseys',
        choice: {
          label: 'Ley',
          value: 'cube-root',
          options: [
            { value: 'square-root', model: 'vibration.usbm' },
            { value: 'cube-root', model: 'vibration.ambraseys' },
          ],
          onChange: () => undefined,
        },
      }),
    );
    expect(html).toContain('<select');
    expect(html).toContain('Ambraseys-Hendron');
    expect(html).not.toContain('Ghosh');
  });

  it('cuerpo: fórmula, valores actuales, confianza, reglas y «próximamente»', () => {
    useLocale.setState({ locale: 'es' });
    const html = renderToString(
      createElement(MethodDetailBody, {
        id: 'vibration.usbm',
        values: { k: 1140, beta: 1.6, q: 50, r: 120, ppv: 3.52 },
      }),
    );
    expect(html).toContain('class="katex');
    expect(html).toContain('1.140');
    expect(html).toContain('1,600');
    expect(html).toContain('3,52');
    expect(html).toContain('R3');
    expect(html).toContain('FC-24');
    expect(html).toContain('Próximamente');
    expect(html).toContain('Ghosh-Daemen');
    expect(html).toMatchSnapshot();
  });
});
