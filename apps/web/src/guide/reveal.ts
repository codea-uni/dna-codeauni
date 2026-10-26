import { openWorkspacePanel } from '../components/WorkspaceWindows';
import { useUiStore } from '../stores/uiStore';
import { findGuideTarget, fold, type Reveal } from './targets';

/**
 * Deja un control a la vista para señalarlo: cambia de pestaña en la cinta, abre su ventana o su
 * menú, despliega los `<details>` que lo esconden y lo trae al centro de su zona de scroll.
 */

const frame = () =>
  new Promise<void>((r) => {
    requestAnimationFrame(() => {
      r();
    });
  });

/** Visible de verdad: con tamaño y sin un ancestro oculto. */
export function isShown(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  return el.checkVisibility({ visibilityProperty: true });
}

/** El elemento con ese `data-guide` que está a la vista (puede haber copias ocultas). */
export function queryGuide(id: string): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>(`[data-guide="${CSS.escape(id)}"]`);
  for (const el of all) if (isShown(el)) return el;
  return all[0] ?? null;
}

/**
 * Busca un control visible por su texto (botones, pestañas, títulos, campos): para señalar algo
 * que no está en el catálogo pero se ve en pantalla.
 */
export function queryByLabel(label: string): HTMLElement | null {
  const want = fold(label);
  if (!want) return null;
  const nodes = document.querySelectorAll<HTMLElement>(
    'button, [role="tab"], [role="menuitem"], summary, label, h2, h3, a, [data-guide]',
  );
  let best: { el: HTMLElement; score: number; area: number } | null = null;
  for (const el of nodes) {
    if (el.closest('[data-guide-ui]') || !isShown(el)) continue;
    const text = fold(el.getAttribute('aria-label') ?? el.textContent);
    const title = fold(el.getAttribute('title') ?? '');
    let score = 0;
    if (text === want) score = 3;
    else if (text.startsWith(want)) score = 2;
    else if (text.includes(want) || title.includes(want)) score = 1;
    if (score === 0) continue;
    // A igualdad, el más chico (el botón, no la sección que lo contiene).
    const r = el.getBoundingClientRect();
    const area = r.width * r.height;
    if (!best || score > best.score || (score === best.score && area < best.area))
      best = { el, score, area };
  }
  return best?.el ?? null;
}

async function waitFor(get: () => HTMLElement | null, ms = 1500): Promise<HTMLElement | null> {
  const end = performance.now() + ms;
  for (;;) {
    const el = get();
    if (el && isShown(el)) return el;
    if (performance.now() > end) return el;
    await frame();
  }
}

async function applyReveal(step: Reveal): Promise<void> {
  const ui = useUiStore.getState();
  if ('ribbon' in step) {
    if (ui.ribbonTab !== step.ribbon) ui.setRibbonTab(step.ribbon);
  } else if ('window' in step) {
    if (!ui.floating.some((w) => w.id === `workspace.${step.window}`))
      openWorkspacePanel(step.window);
  } else if ('view' in step) {
    if (ui.viewMode !== step.view) ui.setViewMode(step.view);
  } else {
    const el = await waitFor(() => queryGuide(step.open), 800);
    if (el && el.getAttribute('aria-expanded') !== 'true') el.click();
  }
  await frame();
}

/** Despliega los `<details>` cerrados que esconden el control. */
function openAncestors(el: HTMLElement): void {
  for (let n: HTMLElement | null = el.parentElement; n; n = n.parentElement)
    if (n instanceof HTMLDetailsElement && !n.open) n.open = true;
}

/**
 * Deja el control a la vista y lo devuelve (null si no aparece: falta un dato previo o no existe
 * en esta herramienta). `label` sirve de respaldo cuando el id no está o no se encuentra.
 */
export async function revealTarget(id?: string, label?: string): Promise<HTMLElement | null> {
  let el: HTMLElement | null = null;
  if (id) {
    el = queryGuide(id);
    if (!el || !isShown(el)) {
      const target = findGuideTarget(id);
      for (const step of target?.reveal ?? []) await applyReveal(step);
      el = await waitFor(() => queryGuide(id));
    }
  }
  if ((!el || !isShown(el)) && label) el = await waitFor(() => queryByLabel(label), 600);
  if (!el) return null;
  openAncestors(el);
  if (!isShown(el)) return null;
  el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  return el;
}
