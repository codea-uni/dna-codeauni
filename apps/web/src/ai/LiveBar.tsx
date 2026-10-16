import { AudioLines, Mic, MicOff, PhoneOff } from 'lucide-react';
import { useEffect } from 'react';
import { useT, type MessageKey } from '../i18n';
import { serverMode } from '../server/api';
import { TOOL_LABELS } from './labels';
import { liveVoice, useLiveStore, type LivePhase } from './live';

const PHASE: Record<LivePhase, MessageKey> = {
  off: 'ai.live.off',
  connecting: 'ai.live.connecting',
  ready: 'ai.live.ready',
  listening: 'ai.live.listening',
  thinking: 'ai.live.thinking',
  speaking: 'ai.live.speaking',
  error: 'ai.live.error',
};

/** Estilo de la voz en la web: el ingeniero ve el plano y los paneles mientras conversa. */
const WEB_STYLE =
  'Web mode: the user sees the plan/3D view and the panels of Cronos while talking to you. When you talk about holes, select them with select_holes so they see them; to show results use show_results.';

/**
 * Conversación en vivo (Gemini Live) desde la web: manos libres, el agente diseña mientras se le
 * habla. Arriba del chat: estado, nivel del micrófono, lo que oyó y lo que responde.
 */
export default function LiveBar() {
  const t = useT();
  const s = useLiveStore();
  const on = s.phase !== 'off';

  useEffect(
    () => () => {
      liveVoice.close();
    },
    [],
  );

  const start = () => {
    liveVoice.use({ style: WEB_STYLE, name: 'web-voice' });
    // Dentro del clic: el audio del navegador necesita el gesto.
    liveVoice.prepare().catch(() => undefined);
    void liveVoice.setHandsFree(true);
  };

  if (!serverMode) return null;
  if (!on)
    return (
      <button type="button" className="live-start" onClick={start}>
        <AudioLines size={18} aria-hidden />
        <span>
          <strong>{t('ai.live.start')}</strong>
          <small>{t('ai.live.startHint')}</small>
        </span>
      </button>
    );

  return (
    <div className={`live-bar phase-${s.phase}`} role="status" aria-live="polite">
      <div className="live-head">
        <span
          className="live-orb"
          style={{ ['--level' as string]: String(s.phase === 'listening' ? s.level : 0) }}
          aria-hidden
        />
        <span className="live-state">
          {s.phase === 'thinking' && s.tool
            ? t(TOOL_LABELS[s.tool] ?? 'ai.tool.other')
            : t(PHASE[s.phase], { message: s.error ?? '' })}
        </span>
        {s.latencyMs !== null && (
          <span className="live-latency">{(s.latencyMs / 1000).toFixed(1)} s</span>
        )}
        <button
          type="button"
          className="icon-btn"
          title={t(s.handsFree ? 'ai.live.mute' : 'ai.live.unmute')}
          aria-label={t(s.handsFree ? 'ai.live.mute' : 'ai.live.unmute')}
          onClick={() => void liveVoice.setMicMuted(s.handsFree)}
        >
          {s.handsFree ? <Mic size={16} aria-hidden /> : <MicOff size={16} aria-hidden />}
        </button>
        <button
          type="button"
          className="icon-btn"
          title={t('ai.live.stop')}
          aria-label={t('ai.live.stop')}
          onClick={() => {
            liveVoice.close();
          }}
        >
          <PhoneOff size={16} aria-hidden />
        </button>
      </div>
      {s.heard.trim() && <p className="live-heard">«{s.heard.trim()}»</p>}
      {s.said.trim() && <p className="live-said">{s.said.trim()}</p>}
    </div>
  );
}
