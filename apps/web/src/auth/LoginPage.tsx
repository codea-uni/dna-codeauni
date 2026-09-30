import { useState } from 'react';
import { useLocale, useT } from '../i18n';
import { useAuth } from '../server/api';
import { AuthShell } from './AuthGate';

export function LoginPage() {
  const t = useT();
  const signIn = useAuth((s) => s.signIn);
  const busy = useAuth((s) => s.busy);
  const error = useAuth((s) => s.error);
  const locale = useLocale((s) => s.locale);
  const setLocale = useLocale((s) => s.setLocale);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <AuthShell>
      <form
        className="auth-form"
        onSubmit={(e) => {
          e.preventDefault();
          void signIn(email, password).then((ok) => {
            if (!ok) setPassword('');
          });
        }}
      >
        <h1>{t('auth.title')}</h1>
        <label>
          <span>{t('auth.email')}</span>
          <input
            type="email"
            autoComplete="username"
            required
            autoFocus
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
            }}
          />
        </label>
        <label>
          <span>{t('auth.password')}</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
            }}
          />
        </label>
        {error && (
          <p className="auth-error" role="alert">
            {t(error)}
          </p>
        )}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? t('auth.signingIn') : t('auth.signIn')}
        </button>
        <p className="muted">{t('auth.noAccount')}</p>
        <div className="auth-locale">
          {(['es', 'en'] as const).map((l) => (
            <button
              key={l}
              type="button"
              className={`link${locale === l ? ' active' : ''}`}
              onClick={() => {
                setLocale(l);
              }}
            >
              {l === 'es' ? 'Español' : 'English'}
            </button>
          ))}
        </div>
      </form>
    </AuthShell>
  );
}
