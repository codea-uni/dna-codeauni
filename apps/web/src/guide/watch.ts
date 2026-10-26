import { projectKind } from '@cronos/core';
import { create } from 'zustand';
import { WORKSPACE_PANELS } from '../components/WorkspaceWindows';
import { t } from '../i18n';
import { session } from '../session';
import { useUiStore } from '../stores/uiStore';
import { useGuideStore } from './store';
import type { TourId } from './tours';

/**
 * La guía atenta a lo que pasa: ofrece explicar un error cuando aparece, dice por qué un botón
 * está bloqueado (y lleva a lo que falta), ofrece ayuda si el usuario da vueltas sin avanzar, y
 * guarda el rastro de lo último que hizo (va con los reportes del buzón).
 */

export type GuideOffer =
  | { kind: 'error'; text: string }
  | { kind: 'blocked'; name: string; why: string; tour: TourId | null }
  | { kind: 'stuck' };

export const useOfferStore = create<{ offer: GuideOffer | null }>(() => ({ offer: null }));

const setOffer = (offer: GuideOffer | null) => {
  useOfferStore.setState({ offer });
};

/** Rastro de acciones y errores recientes (para el contexto de los reportes). */
const trail: { at: string; what: string }[] = [];
const errors: { at: string; text: string }[] = [];
const MAX_TRAIL = 30;
const MAX_ERRORS = 15;

const now = () => new Date().toISOString().slice(11, 19);

export function recentTrail(): readonly { at: string; what: string }[] {
  return trail;
}

export function recentErrors(): readonly { at: string; text: string }[] {
  return errors;
}

function pushError(text: string): void {
  errors.push({ at: now(), text: text.slice(0, 300) });
  if (errors.length > MAX_ERRORS) errors.shift();
}

/** Cómo se llama un control para el rastro (ancla de la guía, nombre accesible o texto). */
function describe(el: Element): string {
  const guide = el.closest('[data-guide]')?.getAttribute('data-guide');
  const named = el.closest(
    'button, a, [role="tab"], [role="menuitem"], input, select, label, summary',
  );
  const text = (named?.getAttribute('aria-label') ?? named?.textContent ?? '').trim().slice(0, 60);
  return [guide, text].filter(Boolean).join(' · ') || el.tagName.toLowerCase();
}

const guideActive = () => {
  const g = useGuideStore.getState();
  return g.steps.length > 0 || g.welcome || g.feedbackOpen;
};

/** Botón bloqueado bajo el puntero (los navegadores no avisan clics sobre `disabled`). */
function blockedAt(x: number, y: number): HTMLElement | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const b = el.closest<HTMLElement>('button, [role="tab"], [aria-disabled="true"]');
    if (!b) continue;
    if ((b as HTMLButtonElement).disabled || b.getAttribute('aria-disabled') === 'true') return b;
    return null;
  }
  return null;
}

function blockedOffer(el: HTMLElement): GuideOffer {
  const name = (el.getAttribute('aria-label') ?? el.textContent).trim().slice(0, 50);
  const guide = el.getAttribute('data-guide') ?? '';
  const panel = guide.startsWith('panel.')
    ? WORKSPACE_PANELS.find((p) => `panel.${p.id}` === guide)
    : undefined;
  const ug = projectKind(session.document.project) === 'underground';
  if (panel?.requires === 'holes')
    return {
      kind: 'blocked',
      name,
      why: t('guide.blocked.holes'),
      tour: ug ? 'ugFace' : 'firstBlast',
    };
  if (panel?.requires === 'charged')
    return {
      kind: 'blocked',
      name,
      why: t('guide.blocked.charge'),
      tour: ug ? 'ugFace' : 'charge',
    };
  return {
    kind: 'blocked',
    name,
    why: el.getAttribute('title')?.split('\n').at(-1) ?? t('guide.blocked.generic'),
    tour: null,
  };
}

/** Arranca la vigilancia; devuelve cómo detenerla. */
export function startGuideWatch(): () => void {
  let clicks = 0;
  let firstClick = 0;
  let stuckOffered = false;

  const onPointer = (e: PointerEvent) => {
    if (e.target instanceof Element && e.target.closest('[data-guide-ui]')) return;
    const blocked = blockedAt(e.clientX, e.clientY);
    if (blocked) {
      trail.push({ at: now(), what: `(bloqueado) ${describe(blocked)}` });
      if (!guideActive()) setOffer(blockedOffer(blocked));
    }
  };

  const onClick = (e: MouseEvent) => {
    if (!(e.target instanceof Element) || e.target.closest('[data-guide-ui]')) return;
    trail.push({ at: now(), what: describe(e.target) });
    if (trail.length > MAX_TRAIL) trail.shift();
    // Muchos clics sin cambiar nada en un minuto: probablemente está buscando algo.
    const time = performance.now();
    if (time - firstClick > 60_000) {
      firstClick = time;
      clicks = 0;
    }
    clicks++;
    if (clicks >= 14 && !stuckOffered && !guideActive() && !useOfferStore.getState().offer) {
      stuckOffered = true;
      setOffer({ kind: 'stuck' });
    }
  };

  const unsubDoc = session.document.subscribe(() => {
    clicks = 0;
    firstClick = performance.now();
  });

  const unsubUi = useUiStore.subscribe((s, prev) => {
    const m = s.message;
    if (!m || m === prev.message || m.kind !== 'error') return;
    pushError(m.text);
    if (!guideActive()) setOffer({ kind: 'error', text: m.text });
  });

  const onError = (e: ErrorEvent) => {
    pushError(e.message);
  };
  const onRejection = (e: PromiseRejectionEvent) => {
    pushError(e.reason instanceof Error ? e.reason.message : String(e.reason));
  };

  document.addEventListener('pointerdown', onPointer, true);
  document.addEventListener('click', onClick, true);
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    document.removeEventListener('pointerdown', onPointer, true);
    document.removeEventListener('click', onClick, true);
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    unsubDoc();
    unsubUi();
  };
}

export function dismissOffer(): void {
  setOffer(null);
}
