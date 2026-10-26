import { Bug, HelpCircle, Lightbulb, Paperclip, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { api } from '../server/api';
import { feedbackContext, feedbackWhere, shrinkImage } from './feedback';
import { useGuideStore } from './store';

type Kind = 'bug' | 'idea' | 'question';

const KINDS = [
  ['bug', Bug, 'guide.fb.kind.bug'],
  ['idea', Lightbulb, 'guide.fb.kind.idea'],
  ['question', HelpCircle, 'guide.fb.kind.question'],
] as const;

/**
 * Buzón de mejoras desde el editor: qué pasó o qué se quiere, con captura opcional (archivo o
 * Ctrl+V). Va con el contexto de la pantalla al equipo, que lo valida antes de programar nada.
 */
export function FeedbackDialog() {
  const open = useGuideStore((s) => s.feedbackOpen);
  return open ? <FeedbackBody /> : null;
}

function FeedbackBody() {
  const t = useT();
  const close = () => {
    useGuideStore.getState().setFeedbackOpen(false);
  };
  const [kind, setKind] = useState<Kind>('bug');
  const [text, setText] = useState(() => {
    // Lo último que el usuario le dijo a la guía suele ser justo el problema.
    const last = [...useGuideStore.getState().chat].reverse().find((m) => m.role === 'user');
    return last?.text ?? '';
  });
  const [shot, setShot] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | { error: string }>('idle');
  const file = useRef<HTMLInputElement>(null);

  const attach = (blob: Blob) => {
    void shrinkImage(blob).then(setShot, () => undefined);
  };

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const img = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
      const blob = img?.getAsFile();
      if (blob) {
        e.preventDefault();
        attach(blob);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('paste', onPaste);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const send = async () => {
    setState('sending');
    try {
      await api.sendFeedback({
        kind,
        text: text.trim(),
        context: feedbackContext(),
        ...feedbackWhere(),
        ...(shot ? { screenshot: shot } : {}),
      });
      setState('sent');
      setTimeout(close, 1800);
    } catch (err) {
      setState({ error: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <div
      className="guide-modal"
      data-guide-ui
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <form
        className="guide-feedback"
        role="dialog"
        aria-modal="true"
        aria-label={t('guide.fb.title')}
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim() && state !== 'sending') void send();
        }}
      >
        <header className="guide-head">
          <h2 style={{ flex: 1 }}>{t('guide.fb.title')}</h2>
          <button
            type="button"
            className="guide-x"
            onClick={close}
            aria-label={t('guide.fb.cancel')}
          >
            <X size={16} />
          </button>
        </header>
        <p>{t('guide.fb.sub')}</p>
        <div className="guide-kinds" role="radiogroup">
          {KINDS.map(([id, Icon, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={kind === id}
              className={kind === id ? 'active' : ''}
              onClick={() => {
                setKind(id);
              }}
            >
              <Icon size={18} aria-hidden />
              {t(label)}
            </button>
          ))}
        </div>
        <label className="field">
          <span className="field-label">{t('guide.fb.text')}</span>
          <textarea
            value={text}
            maxLength={4000}
            autoFocus
            onChange={(e) => {
              setText(e.target.value);
            }}
          />
        </label>
        <div className="guide-shot">
          {shot ? (
            <>
              <img src={shot} alt="" />
              <button
                type="button"
                onClick={() => {
                  setShot(null);
                }}
              >
                {t('guide.fb.shotRemove')}
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => file.current?.click()}>
                <Paperclip size={14} aria-hidden /> {t('guide.fb.shot')}
              </button>
              <span>{t('guide.fb.shotPaste')}</span>
            </>
          )}
          <input
            ref={file}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) attach(f);
              e.target.value = '';
            }}
          />
        </div>
        {state === 'sent' && <p className="ok">{t('guide.fb.sent')}</p>}
        {typeof state === 'object' && (
          <p className="error" role="alert">
            {t('guide.fb.failed', { error: state.error })}
          </p>
        )}
        <div className="row">
          <button type="button" onClick={close}>
            {t('guide.fb.cancel')}
          </button>
          <button
            type="submit"
            className="primary"
            disabled={!text.trim() || state === 'sending' || state === 'sent'}
          >
            {t('guide.fb.send')}
          </button>
        </div>
      </form>
    </div>
  );
}
