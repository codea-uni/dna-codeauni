// Verificación de la UI de Cronos en un Chromium sin ventana (Playwright + axe-core).
// Uso: node ui-check.cjs [--base http://localhost:5173/] [--out ./ui-check-out] [--example "Producción estándar"]
// Requiere playwright y @axe-core/playwright instalados en el directorio desde el que se ejecuta.
const { chromium } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');
const fs = require('fs');
const path = require('path');

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const BASE = arg('base', 'http://localhost:5173/');
const OUT = path.resolve(arg('out', './ui-check-out'));
const EXAMPLE = arg('example', 'Producción estándar');
const RIBBON = ['Inicio', 'Diseño', 'Carguío', 'Tiempos', 'Análisis', 'Vista', 'Librería', 'Asistente IA'];
const VIEWPORTS = [[1440, 900], [1280, 720], [1024, 768]];
const DECIMALS = ['6,5', '6.5', '1.234,5', '1,234.5', '7,25 m'];
const slug = (s) => s.normalize('NFD').replace(/[^\w]/g, '');
fs.mkdirSync(OUT, { recursive: true });

async function newPage(browser, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'es-ES' });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  return page;
}

async function loadExample(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Ejemplos/ }).click();
  await page.getByText(EXAMPLE).first().click();
  await page.waitForTimeout(3000);
}

async function axe(page) {
  try {
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    return r.violations.map((v) => ({ impact: v.impact, id: v.id, count: v.nodes.length, help: v.help, examples: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) }));
  } catch (e) {
    return [{ impact: 'error', id: 'axe-failed', count: 0, help: e.message.slice(0, 120), examples: [] }];
  }
}

// Cierra ventanas flotantes con su botón × (por nombre accesible, sin depender del orden del DOM).
const closeWindows = async (page) => {
  for (let i = 0; i < 8; i++) {
    const close = page.locator('.floating-window .floating-header button').first();
    if (!(await close.count())) return;
    await close.click({ timeout: 2000 }).catch(() => {});
  }
};

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const report = { base: BASE, example: EXAMPLE, date: new Date().toISOString(), pageErrors: [], screens: {}, decimals: [], keyboard: {}, viewports: {} };

  const page = await newPage(browser, 1440, 900);
  page.on('pageerror', (e) => report.pageErrors.push(e.message.slice(0, 200)));
  await loadExample(page);
  report.statusBar = ((await page.locator('footer, .statusbar, .status-bar').first().textContent().catch(() => '')) || '').trim().slice(0, 160);

  // 1. Cada pestaña de la cinta: captura + axe.
  for (const tab of RIBBON) {
    await closeWindows(page);
    await page.getByRole('tab', { name: tab, exact: true }).first().click().catch(() => {});
    await page.waitForTimeout(1000);
    const file = `tab-${slug(tab)}.png`;
    await page.screenshot({ path: path.join(OUT, file) });
    report.screens[tab] = { file, axe: await axe(page) };
  }

  // 2. Decimales en el primer campo de «Generar malla».
  await closeWindows(page);
  await page.getByRole('tab', { name: 'Diseño', exact: true }).click();
  await page.getByRole('button', { name: /Generar malla/ }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, 'win-generar-malla.png') });
  const field = page.getByRole('dialog', { name: 'Generar malla' }).locator('input[inputmode=decimal]').first();
  for (const typed of DECIMALS) {
    await field.click();
    await field.fill(typed);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    report.decimals.push({ typed, shown: await field.inputValue(), invalid: await field.getAttribute('aria-invalid') });
    // Sin Esc aquí: con el campo confirmado, Esc cierra la ventana (comportamiento esperado).
  }
  await field.click();
  const before = await field.inputValue();
  await page.keyboard.press('ArrowUp');
  report.keyboard.arrowUpChangesValue = before !== (await field.inputValue());

  // 3. Teclado: ¿Esc cierra la ventana? ¿el diálogo recibe el foco al abrirse?
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  report.keyboard.escClosesWindow = (await page.locator('[role=dialog]').count()) === 0;
  await closeWindows(page);
  await page.getByRole('tab', { name: 'Inicio', exact: true }).click();
  await page.getByRole('button', { name: /Ajustes del proyecto/ }).click();
  await page.waitForTimeout(500);
  report.keyboard.focusInsideSettingsOnOpen = await page.evaluate(() => !!document.activeElement?.closest('[role=dialog], .modal, dialog'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  report.keyboard.escClosesSettings = !(await page.getByRole('heading', { name: /Ajustes del proyecto/ }).isVisible().catch(() => false));

  // 4. Tamaños de pantalla.
  for (const [w, h] of VIEWPORTS) {
    const p = await newPage(browser, w, h);
    await loadExample(p);
    await p.screenshot({ path: path.join(OUT, `vp-${w}x${h}.png`) });
    report.viewports[`${w}x${h}`] = { horizontalOverflow: await p.evaluate(() => document.documentElement.scrollWidth > innerWidth) };
    await p.context().close();
  }
  await browser.close();

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  const axeAll = {};
  for (const s of Object.values(report.screens)) for (const v of s.axe) axeAll[v.id] = v;
  console.log(`Estado: ${report.statusBar}`);
  console.log(`Errores JS: ${report.pageErrors.length}`);
  console.log(`axe (únicos): ${Object.values(axeAll).map((v) => `${v.impact} ${v.id} x${v.count}`).join('; ') || 'ninguno'}`);
  console.log(`Decimales: ${report.decimals.map((d) => `${d.typed}→${d.shown}${d.invalid === 'true' ? ' (inválido)' : ''}`).join(' | ')}`);
  console.log(`Teclado: ${JSON.stringify(report.keyboard)}`);
  console.log(`Pantallas: ${JSON.stringify(report.viewports)}`);
  console.log(`Capturas e informe en ${OUT}`);
})();
