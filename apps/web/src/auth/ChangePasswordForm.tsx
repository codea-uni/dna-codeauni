import { useState } from 'react';
import { useT, type MessageKey } from '../i18n';
import { useAuth } from '../server/api';

/** Cambio de contraseña (obligatorio si es temporal; también desde el menú de la cuenta). */
export function ChangePasswordForm({ onDone }: { onDone?: () => void }) {
  const t = useT();
  const changePassword = useAuth((s) => s.changePassword);
  const busy = useAuth((s) => s.busy);
  const serverError = useAuth((s) => s.error);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [localError, setLocalError] = useState<MessageKey | null>(null);
  const error = localError ?? serverError;

  return (
    <form
      className="auth-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (next !== repeat) {
          setLocalError('auth.error.passwordMismatch');
          return;
        }
        setLocalError(null);
        void changePassword(current, next).then((ok) => {
          if (ok) onDone?.();
        });
      }}
    >
      <label>
        <span>{t('auth.currentPassword')}</span>
        <input
          type="password"
          autoComplete="current-password"
          required
          value={current}
          onChange={(e) => {
            setCurrent(e.target.value);
          }}
        />
      </label>
      <label>
        <span>{t('auth.newPassword')}</span>
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          value={next}
          onChange={(e) => {
            setNext(e.target.value);
          }}
        />
      </label>
      <label>
        <span>{t('auth.repeatPassword')}</span>
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          value={repeat}
          onChange={(e) => {
            setRepeat(e.target.value);
          }}
        />
      </label>
      <p className="muted">{t('auth.passwordHint')}</p>
      {error && (
        <p className="auth-error" role="alert">
          {t(error)}
        </p>
      )}
      <button className="primary" type="submit" disabled={busy}>
        {busy ? t('auth.saving') : t('auth.save')}
      </button>
    </form>
  );
}
