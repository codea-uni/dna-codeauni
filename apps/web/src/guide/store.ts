import type { Vec3 } from '@cronos/core';
import { create } from 'zustand';

/**
 * Estado del agente guía: la secuencia de pasos que se está mostrando (recorrido, respuesta del
 * asistente, ayuda ante un error), la bienvenida «¿Qué quieres hacer hoy?» y la conversación corta
 * de la burbuja.
 */

/** Ancla en la escena: la burbuja sigue al objeto mientras se mueve la cámara. */
export interface WorldAnchor {
  at: Vec3;
  /** Lo que tiene que caber al volar hasta ahí [m]; sin él no se mueve la cámara. */
  size?: number;
  /** Nombre del objeto (encabezado de la burbuja). */
  name?: string;
}

export interface GuideStep {
  /** `data-guide` del control a señalar (ver targets.ts). */
  target?: string;
  /** Texto visible del control, de respaldo si no tiene `data-guide`. */
  label?: string;
  world?: WorldAnchor;
  title?: string;
  text: string;
  /** El paso ya está hecho: se salta al llegar y avanza solo cuando se cumple. */
  done?: () => boolean;
  /** Avanzar al hacer clic en el control señalado (por defecto sí, si no hay `done`). */
  advanceOnClick?: boolean;
  /** «Hazlo por mí». */
  doIt?: () => unknown;
}

export type GuideSource = 'tour' | 'agent' | 'error' | 'hint' | 'focus';

export interface GuideMessage {
  role: 'user' | 'guide';
  text: string;
}

interface GuideState {
  steps: GuideStep[];
  index: number;
  /** Sube con cada secuencia nueva (la burbuja se vuelve a montar aunque empiece igual). */
  run: number;
  /** Largo de la conversación al empezar: lo anterior ya está dicho en los pasos. */
  chatMark: number;
  source: GuideSource | null;
  /** Nombre del recorrido (aviso final). */
  title: string | null;
  /** Bienvenida / lanzador abierto. */
  welcome: boolean;
  feedbackOpen: boolean;
  /** Conversación de la burbuja (las últimas). */
  chat: GuideMessage[];
  busy: boolean;
  /** Aviso final del recorrido. */
  finished: string | null;
  start: (steps: GuideStep[], opts?: { source?: GuideSource; title?: string }) => void;
  next: () => void;
  back: () => void;
  stop: () => void;
  setWelcome: (open: boolean) => void;
  setFeedbackOpen: (open: boolean) => void;
  say: (msg: GuideMessage) => void;
  setBusy: (busy: boolean) => void;
}

export const useGuideStore = create<GuideState>((set, get) => ({
  steps: [],
  index: 0,
  run: 0,
  chatMark: 0,
  source: null,
  title: null,
  welcome: false,
  feedbackOpen: false,
  chat: [],
  busy: false,
  finished: null,
  start: (steps, opts) => {
    if (steps.length === 0) return;
    set((s) => ({
      steps,
      index: 0,
      run: s.run + 1,
      chatMark: s.chat.length,
      source: opts?.source ?? 'agent',
      title: opts?.title ?? null,
      welcome: false,
      finished: null,
    }));
  },
  next: () => {
    const { index, steps, source, title } = get();
    if (index + 1 < steps.length) set({ index: index + 1 });
    else
      set({
        steps: [],
        index: 0,
        source: null,
        title: null,
        finished: source === 'tour' && title ? title : null,
      });
  },
  back: () => {
    set((s) => ({ index: Math.max(0, s.index - 1) }));
  },
  stop: () => {
    set({ steps: [], index: 0, source: null, title: null, finished: null });
  },
  setWelcome: (welcome) => {
    set(welcome ? { welcome, finished: null } : { welcome });
  },
  setFeedbackOpen: (feedbackOpen) => {
    set(feedbackOpen ? { feedbackOpen, welcome: false } : { feedbackOpen });
  },
  say: (msg) => {
    set((s) => ({ chat: [...s.chat, msg].slice(-6) }));
  },
  setBusy: (busy) => {
    set({ busy });
  },
}));

/** Paso en curso (o null si no se está guiando). */
export function currentStep(): GuideStep | null {
  const { steps, index } = useGuideStore.getState();
  return steps[index] ?? null;
}
