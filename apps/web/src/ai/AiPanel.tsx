import { Bot, Mic, MicOff, RotateCcw, Send, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocale, useT, type MessageKey } from '../i18n';
import { serverMode } from '../server/api';
import {
  cancelAssistant,
  resetAssistant,
  sendToAssistant,
  useAiStore,
  type ChatEntry,
} from './agent';

/** Reconocimiento de voz del navegador (Web Speech API; Chrome y Edge, con prefijo webkit). */
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;
const Recognition: RecognitionCtor | undefined = (() => {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
})();

/** Idioma de voz: el del navegador si coincide con el de la interfaz (es-PE, es-CL…). */
function speechLang(locale: string): string {
  const nav = navigator.language;
  if (nav.toLowerCase().startsWith(locale)) return nav;
  return locale === 'en' ? 'en-US' : 'es-ES';
}

function speak(text: string, lang: string): void {
  if (!('speechSynthesis' in window) || !text) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  window.speechSynthesis.speak(u);
}

const EXAMPLES = [
  'ai.example.1',
  'ai.example.2',
  'ai.example.3',
  'ai.example.4',
  'ai.example.5',
] as const satisfies readonly MessageKey[];

const TOOL_LABELS: Record<string, MessageKey> = {
  generate_pattern: 'ai.tool.generate_pattern',
  edit_holes: 'ai.tool.edit_holes',
  move_holes: 'ai.tool.move_holes',
  add_holes: 'ai.tool.add_holes',
  delete_holes: 'ai.tool.delete_holes',
  set_charge: 'ai.tool.set_charge',
  clear_charge: 'ai.tool.clear_charge',
  set_tie_up: 'ai.tool.set_tie_up',
  set_electronic_timing: 'ai.tool.set_electronic_timing',
  set_hole_delays: 'ai.tool.set_hole_delays',
  clear_tie_up: 'ai.tool.clear_tie_up',
  create_perimeter: 'ai.tool.create_perimeter',
  set_free_face: 'ai.tool.set_free_face',
  undo: 'ai.tool.undo',
};

const VOICE_ERRORS: Record<string, MessageKey> = {
  'not-allowed': 'ai.voice.not-allowed',
  'service-not-allowed': 'ai.voice.not-allowed',
  'audio-capture': 'ai.voice.audio-capture',
  network: 'ai.voice.network',
};

const ERROR_KEYS: Record<string, MessageKey> = {
  ai_not_configured: 'ai.error.ai_not_configured',
  ai_upstream: 'ai.error.ai_upstream',
  unauthorized: 'ai.error.unauthorized',
  ai_empty: 'ai.error.ai_empty',
  ai_steps: 'ai.error.ai_steps',
  ai_cancelled: 'ai.error.ai_cancelled',
  voice: 'ai.error.voice',
};

function Entry({ entry }: { entry: ChatEntry }) {
  const t = useT();
  switch (entry.kind) {
    case 'user':
      return <div className="ai-msg ai-user">{entry.text}</div>;
    case 'assistant':
      return <div className="ai-msg ai-assistant">{entry.text}</div>;
    case 'tool':
      return (
        <div className={`ai-tool${entry.ok ? '' : ' failed'}`}>
          {!entry.ok && <strong>{t('ai.tool.failed')}</strong>}
          <span>{t(TOOL_LABELS[entry.name] ?? 'ai.tool.other')}</span>
        </div>
      );
    case 'error':
      return (
        <div className="ai-msg ai-error" role="alert">
          {t(ERROR_KEYS[entry.code] ?? 'ai.error.ai_failed', { text: entry.text })}
        </div>
      );
  }
}

/** Sección del asistente de IA: conversación por texto o por voz. */
export default function AiPanel() {
  const t = useT();
  const locale = useLocale((s) => s.locale);
  const entries = useAiStore((s) => s.entries);
  const busy = useAiStore((s) => s.busy);
  const push = useAiStore((s) => s.push);
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [readAloud, setReadAloud] = useState(true);
  const recognition = useRef<Recognition | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const lang = speechLang(locale);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [entries.length, busy]);

  useEffect(
    () => () => {
      recognition.current?.stop();
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    },
    [],
  );

  const send = async (message: string, byVoice: boolean) => {
    if (!message.trim() || busy) return;
    setText('');
    const answer = await sendToAssistant(message);
    if (byVoice && readAloud) speak(answer, lang);
  };

  const toggleVoice = () => {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    if (!Recognition) {
      push({ kind: 'error', code: 'voice', text: t('ai.noVoice') });
      return;
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    const rec = new Recognition();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const said = result?.[0]?.transcript ?? '';
        if (result?.isFinal) finalText += said;
        else interim += said;
      }
      setText(finalText + interim);
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      const known = VOICE_ERRORS[e.error];
      push({ kind: 'error', code: 'voice', text: known ? t(known) : e.error });
    };
    rec.onend = () => {
      setListening(false);
      recognition.current = null;
      if (finalText.trim()) void send(finalText, true);
    };
    recognition.current = rec;
    setListening(true);
    rec.start();
  };

  return (
    <div className="ai-panel">
      {!serverMode && <p className="hint ai-warning">{t('ai.needsServer')}</p>}
      <div className="ai-log" ref={log} aria-live="polite">
        {entries.length === 0 && (
          <div className="ai-empty">
            <Bot size={28} aria-hidden />
            <p>{t('ai.intro')}</p>
            <p className="hint">{t('ai.examples')}</p>
            {EXAMPLES.map((key) => (
              <button
                key={key}
                type="button"
                className="ai-example"
                disabled={busy || !serverMode}
                onClick={() => void send(t(key), false)}
              >
                {t(key)}
              </button>
            ))}
          </div>
        )}
        {entries.map((entry, i) => (
          <Entry key={i} entry={entry} />
        ))}
        {busy && <div className="ai-thinking">{t('ai.thinking')}</div>}
      </div>
      <form
        className="ai-input"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text, false);
        }}
      >
        <textarea
          rows={2}
          value={text}
          placeholder={listening ? t('ai.listening') : t('ai.placeholder')}
          aria-label={t('ai.placeholder')}
          disabled={!serverMode}
          onChange={(e) => {
            setText(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send(text, false);
            }
          }}
        />
        <div className="ai-buttons">
          <button
            type="button"
            className={`icon-btn${listening ? ' active ai-listening' : ''}`}
            title={listening ? t('ai.listening') : t('ai.listen')}
            aria-label={listening ? t('ai.listening') : t('ai.listen')}
            aria-pressed={listening}
            disabled={(busy && !listening) || !serverMode}
            onClick={toggleVoice}
          >
            {listening ? <MicOff size={17} aria-hidden /> : <Mic size={17} aria-hidden />}
          </button>
          {busy ? (
            <button
              type="button"
              className="icon-btn"
              title={t('ai.stop')}
              aria-label={t('ai.stop')}
              onClick={cancelAssistant}
            >
              <Square size={16} aria-hidden />
            </button>
          ) : (
            <button
              type="submit"
              className="icon-btn primary"
              title={t('ai.send')}
              aria-label={t('ai.send')}
              disabled={!text.trim() || !serverMode}
            >
              <Send size={16} aria-hidden />
            </button>
          )}
        </div>
      </form>
      <div className="ai-options">
        <label>
          <input
            type="checkbox"
            checked={readAloud}
            onChange={(e) => {
              setReadAloud(e.target.checked);
            }}
          />
          {t('ai.speak')}
        </label>
        <button
          type="button"
          className="link"
          disabled={entries.length === 0}
          onClick={resetAssistant}
        >
          <RotateCcw size={13} aria-hidden /> {t('ai.reset')}
        </button>
      </div>
    </div>
  );
}
