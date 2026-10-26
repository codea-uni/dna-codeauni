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
export function feedbackContext(): Record<string, unknown> {
  const ui = useUiStore.getState();
  const cur = useProjectSession.getState().current;
  const project = session.document.project;
  const guide = useGuideStore.getState();
  const step = guide.steps[guide.index];
  return {
    route: window.location.pathname,
    tool: cur?.tool ?? projectKind(project),
    projectKind: projectKind(project),
    projectId: cur?.projectId ?? null,
    projectName: project.name,
    mineId: cur?.mine.id ?? null,
    mineName: cur?.mine.name ?? null,
    version: cur?.base.number ?? null,
    viewMode: ui.viewMode,
    ribbonTab: ui.ribbonTab,
    windows: ui.floating.map((w) => w.id.replace(/^workspace\./, '')),
    holes: project.blasts.reduce((n, b) => n + b.holes.length, 0),
    guide: step
      ? { source: guide.source, title: guide.title, step: step.text, target: step.target }
      : null,
    trail: recentTrail(),
    errors: recentErrors(),
    assistant: useAiStore
      .getState()
      .entries.slice(-12)
      .map((e) =>
        e.kind === 'tool'
          ? `[tool ${e.name}${e.ok ? '' : ' ✗'}]`
          : e.kind === 'error'
            ? `[error ${e.code}] ${e.text}`
            : `${e.kind === 'user' ? 'Usuario' : 'Asistente'}: ${e.text.slice(0, 400)}`,
      ),
    screen: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio },
    userAgent: navigator.userAgent,
    appVersion: APP_VERSION,
    locale: useLocale.getState().locale,
  };
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
