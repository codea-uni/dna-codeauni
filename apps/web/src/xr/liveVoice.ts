import type { Engine, XrLine } from '@cronos/engine';
import { TOOL_LABELS } from '../ai/labels';
import { liveVoice, useLiveStore, type LiveState } from '../ai/live';
import { t } from '../i18n';
import { serverMode } from '../server/api';
import { clampLines, wrapText, type XrVoice } from './voice';

/**
 * Voz en vivo dentro del visor (Gemini Live, `ai/live.ts`): manos libres desde que se entra, sin
 * controles. Se habla cuando se quiera; mientras el asistente responde no escucha (no se responde
 * a sí mismo por el parlante). El botón del menú o A/X silencia o reactiva el micrófono, e
 * interrumpe una respuesta. El panel frente a la cabeza muestra lo que oyó, lo que responde (como
 * subtítulo) y las herramientas que usó.
 */

/** Caracteres por línea del panel de voz. */
const WRAP = 40;
/** Líneas de subtítulo que se muestran (las últimas). */
const SAID_LINES = 7;
/** Colores del punto de estado (los de `voice.ts`; gris = micrófono en pausa). */
const DOT = {
  mic: '#ef4444',
  busy: '#f59e0b',
  speaking: '#60a5fa',
  done: '#22c55e',
  off: '#94a3b8',
};
/** El saludo llega unos segundos después de entrar (cuando ya se ve la escena). */
const GREET_MS = 2500;

export function bindXrLiveVoice(
  engine: Engine,
  style: string,
  context: () => string,
  onChange: () => void,
  onTool: (name: string, ok: boolean) => void,
): XrVoice {
  let active = false;
  let greeted = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  /** Texto de lo que se dijo y respondió; oculto, el asistente solo habla (como `voice.ts`). */
  let showText = false;

  const heading = (dot: string, label: string): XrLine => ({ label, heading: true, swatch: dot });

  const rows = (s: LiveState): XrLine[] => {
    const lines: XrLine[] = [];
    switch (s.phase) {
      case 'off':
        return [];
      case 'connecting':
        lines.push(heading(DOT.busy, t('xr.live.connecting')));
        break;
      case 'ready':
        lines.push(
          heading(
            s.handsFree ? DOT.done : DOT.off,
            t(s.handsFree ? 'xr.live.ready' : 'xr.live.muted'),
          ),
        );
        break;
      case 'listening':
        lines.push(heading(DOT.mic, t('xr.live.listening')), {
          label: t('xr.voice.release'),
          slider: Math.round(s.level * 20) / 20,
        });
        break;
      case 'thinking':
        lines.push(
          heading(
            DOT.busy,
            s.tool ? t(TOOL_LABELS[s.tool] ?? 'ai.tool.other') : t('xr.voice.thinking'),
          ),
        );
        break;
      case 'speaking':
        lines.push(heading(DOT.speaking, t('xr.voice.speaking')));
        break;
      case 'error':
        lines.push(heading(DOT.mic, t('xr.voice.title')));
        for (const label of clampLines(
          wrapText(t('xr.voice.error', { message: s.error ?? '' }), WRAP),
          4,
        ))
          lines.push({ label, body: true });
        lines.push([{ id: 'voice:mute', label: t('xr.live.retry') }]);
        return lines;
    }
    if (showText) {
      if (s.heard.trim())
        for (const label of wrapText(`«${s.heard.trim()}»`, WRAP).slice(-2))
          lines.push({ label, body: true });
      if (s.said.trim())
        for (const label of wrapText(s.said.trim(), WRAP).slice(-SAID_LINES))
          lines.push({ label, body: true });
    }
    for (let i = 0; i < s.tools.length; i += 2)
      lines.push(
        s.tools.slice(i, i + 2).map((tool) => ({
          label: `${tool.ok ? '✓' : '✗'} ${t(TOOL_LABELS[tool.name] ?? 'ai.tool.other')}`,
          active: tool.ok,
        })),
      );
    if (s.latencyMs !== null && s.phase === 'speaking')
      lines.push({
        label: t('xr.live.latency', { s: (s.latencyMs / 1000).toFixed(1) }),
        body: true,
      });
    lines.push([
      { id: 'voice:text', label: t(showText ? 'xr.voice.hideText' : 'xr.voice.showText') },
      { id: 'voice:mute', label: t(s.handsFree ? 'xr.live.pause' : 'xr.live.resume') },
    ]);
    return lines;
  };

  let lastKey = '';
  const render = () => {
    if (!active) return;
    const r = rows(useLiveStore.getState());
    const key = JSON.stringify(r);
    if (key === lastKey) return;
    lastKey = key;
    engine.setXrVoice(r);
    onChange();
  };

  const start = () => {
    if (!serverMode) return;
    active = true;
    liveVoice.use({ style, context, onTool, name: 'xr-voice' });
    void liveVoice.setHandsFree(true);
    render();
    if (!greeted)
      timer = setTimeout(() => {
        greeted = true;
        liveVoice.greet(t('xr.live.greetPrompt'));
      }, GREET_MS);
  };

  const stop = () => {
    active = false;
    if (timer) clearTimeout(timer);
    timer = null;
    liveVoice.close();
    lastKey = '';
  };

  const offs = [
    useLiveStore.subscribe(render),
    engine.on('xrTalk', (down) => {
      if (down && active) void liveVoice.toggle();
    }),
    engine.on('xrSession', (mode) => {
      if (mode) start();
      else stop();
    }),
  ];

  return {
    available: serverMode,
    get listening() {
      const s = useLiveStore.getState();
      return s.handsFree || s.phase === 'listening';
    },
    toggle: () => {
      void liveVoice.toggle();
    },
    action: (id) => {
      if (id === 'voice:text') {
        showText = !showText;
        lastKey = '';
        render();
        return true;
      }
      if (id === 'voice:mute') {
        // Pausar silencia de verdad (aunque haya ruido o se esté hablando); en error, reintenta.
        const st = useLiveStore.getState();
        if (st.phase === 'error') void liveVoice.toggle();
        else void liveVoice.setMicMuted(st.handsFree);
        return true;
      }
      return false;
    },
    dispose: () => {
      stop();
      for (const off of offs) off();
    },
  };
}
