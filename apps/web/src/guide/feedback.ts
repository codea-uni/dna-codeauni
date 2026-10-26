import type { FeedbackContext } from '@cronos/api';
import { projectKind } from '@cronos/core';
import { useAiStore } from '../ai/agent';
import { useLocale } from '../i18n';
import { APP_VERSION, session } from '../session';
import { useProjectSession } from '../server/projectSession';
import { useUiStore } from '../stores/uiStore';
import { useGuideStore } from './store';
import { recentErrors, recentTrail } from './watch';

/**
 * Contexto que acompaña un pedido del buzón: dónde estaba el usuario, qué tenía abierto, lo último
 * que hizo, los errores recientes y la conversación con el asistente. El equipo lo lee para
 * reproducir el problema sin tener que preguntar.
 */
export function feedbackContext(): FeedbackContext {
  const ui = useUiStore.getState();
  const cur = useProjectSession.getState().current;
  const project = session.document.project;
  const guide = useGuideStore.getState();
  const step = guide.steps[guide.index];
  const conversation = useAiStore
    .getState()
    .entries.slice(-12)
    .flatMap((e): NonNullable<FeedbackContext['conversation']> =>
      e.kind === 'user' || e.kind === 'assistant'
        ? [{ role: e.kind, text: e.text.slice(0, 1500) }]
        : e.kind === 'error'
          ? [{ role: 'assistant', text: `[error ${e.code}] ${e.text}` }]
          : [],
    );
  return {
    screen: window.location.pathname,
    tool: cur?.tool ?? projectKind(project),
    windows: ui.floating.map((w) => w.id.replace(/^workspace\./, '')),
    recentActions: recentTrail().map((x) => ({ at: x.at, label: x.what })),
    recentErrors: recentErrors().map((x) => ({ at: x.at, message: x.text })),
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      dpr: window.devicePixelRatio,
    },
    appVersion: APP_VERSION,
    userAgent: navigator.userAgent.slice(0, 500),
    locale: useLocale.getState().locale,
    conversation,
    // Datos extra (se ven en «Otros datos»).
    projectName: project.name,
    projectKind: projectKind(project),
    version: cur?.base.number ?? null,
    viewMode: ui.viewMode,
    ribbonTab: ui.ribbonTab,
    holes: project.blasts.reduce((n, b) => n + b.holes.length, 0),
    guide: step
      ? { source: guide.source, title: guide.title, step: step.text, target: step.target ?? null }
      : null,
  };
}

/** Mina y proyecto abiertos (el servidor los guarda si son de la empresa del usuario). */
export function feedbackWhere(): { mineId: string | null; projectId: string | null } {
  const cur = useProjectSession.getState().current;
  return { mineId: cur?.mine.id ?? null, projectId: cur?.projectId ?? null };
}

/** Reduce una imagen a JPEG (máx. 1600 px de lado) para que viaje liviana. */
export async function shrinkImage(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.8);
}
