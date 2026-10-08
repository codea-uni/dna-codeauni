import { Bot, Mic, MicOff, RotateCcw, Send, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocale, useT, type MessageKey } from '../i18n';
import { serverMode } from '../server/api';
import { canRecord, startRecording, type Recording } from './audio';
import { ERROR_KEYS, speak, speechLang, TOOL_LABELS } from './labels';
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

/**
 * El navegador del Meta Quest expone `webkitSpeechRecognition` pero no lo deja usar: ahí (y donde
 * no exista) se graba el audio y lo escucha Gemini, como en el visor.
 */
const IS_HEADSET = /OculusBrowser|Quest|Pico/i.test(navigator.userAgent);
/** Errores del reconocimiento que significan «este navegador no lo permite»: se pasa a grabar. */
const RECOGNITION_UNAVAILABLE = new Set([
  'network',
  'service-not-allowed',
  'language-not-supported',
]);
/** La grabación se corta sola a los 30 s. */
const MAX_RECORD_MS = 30_000;
/** Menos de esto es un toque sin querer: no se envía. */
const MIN_RECORD_MS = 400;

const EXAMPLES = [
  'ai.example.1',
  'ai.example.2',
  'ai.example.3',
  'ai.example.4',
  'ai.example.5',
] as const satisfies readonly MessageKey[];

const VOICE_ERRORS: Record<string, MessageKey> = {
  'not-allowed': 'ai.voice.not-allowed',
  'service-not-allowed': 'ai.voice.not-allowed',
  'audio-capture': 'ai.voice.audio-capture',
  network: 'ai.voice.network',
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
  const recording = useRef<Recording | null>(null);
  const stopRecording = useRef<(() => Promise<void>) | null>(null);
  /** Falso si el navegador no tiene o no deja usar el reconocimiento: se graba. */
  const useRecognition = useRef(!!Recognition && !IS_HEADSET);
  const log = useRef<HTMLDivElement>(null);
  const lang = speechLang(locale);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [entries.length, busy]);

  useEffect(
    () => () => {
      recognition.current?.stop();
      recording.current?.cancel();
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

  const voiceError = (e: unknown) => {
    const name = e instanceof DOMException ? e.name : '';
    const known =
      name === 'NotAllowedError' || name === 'SecurityError'
        ? VOICE_ERRORS['not-allowed']
        : name === 'NotFoundError'
          ? VOICE_ERRORS['audio-capture']
          : undefined;
    push({
      kind: 'error',
      code: 'voice',
      text: known ? t(known) : e instanceof Error ? e.message : String(e),
    });
  };

  /** Graba con el micrófono y envía el audio a Gemini (sin reconocimiento del navegador). */
  const record = async () => {
    if (!canRecord) {
      push({ kind: 'error', code: 'voice', text: t('ai.noVoice') });
      return;
    }
    setListening(true);
    let rec: Recording;
    try {
      rec = await startRecording();
    } catch (e) {
      setListening(false);
      voiceError(e);
      return;
    }
    recording.current = rec;
    const timer = setTimeout(() => {
      void finish();
    }, MAX_RECORD_MS);
    const finish = async () => {
      clearTimeout(timer);
      if (recording.current !== rec) return;
      recording.current = null;
      setListening(false);
      const short = rec.elapsed() < MIN_RECORD_MS;
      let data: string | null;
      try {
        data = await rec.stop();
      } catch (e) {
        voiceError(e);
        return;
      }
      if (!data || short) return;
      const answer = await sendToAssistant(text, { mimeType: 'audio/wav', data });
      setText('');
      if (readAloud) speak(answer, lang);
    };
    stopRecording.current = finish;
  };

  const toggleVoice = () => {
    if (listening) {
      if (recording.current) void stopRecording.current?.();
      else recognition.current?.stop();
      return;
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (!Recognition || !useRecognition.current) {
      void record();
      return;
    }
    const rec = new Recognition();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = '';
    let fallback = false;
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
      if (RECOGNITION_UNAVAILABLE.has(e.error) && canRecord) {
        // El navegador tiene la API pero no la deja usar: desde ahora se graba y escucha Gemini.
        useRecognition.current = false;
        fallback = true;
        return;
      }
      const known = VOICE_ERRORS[e.error];
      push({ kind: 'error', code: 'voice', text: known ? t(known) : e.error });
    };
    rec.onend = () => {
      setListening(false);
      recognition.current = null;
      if (fallback) void record();
      else if (finalText.trim()) void send(finalText, true);
    };
    recognition.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      useRecognition.current = false;
      recognition.current = null;
      void record();
    }
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
