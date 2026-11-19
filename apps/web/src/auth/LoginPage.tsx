import { Eye, EyeOff, TriangleAlert } from 'lucide-react';
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
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

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
        <div className="auth-heading">
          <h1 className="auth-title">{t('auth.title')}</h1>
          <p className="muted">{t('auth.welcome')}</p>
        </div>
        <label>
          <span>{t('auth.email')}</span>
          <input
            type="email"
            name="email"
            autoComplete="username"
            spellCheck={false}
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
          <span className="password-field">
            <input
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete="current-password"
              required
              value={password}
              aria-describedby={capsLock ? 'caps-lock-hint' : undefined}
              onChange={(e) => {
                setPassword(e.target.value);
              }}
              onKeyUp={(e) => {
                setCapsLock(e.getModifierState('CapsLock'));
              }}
              onBlur={() => {
                setCapsLock(false);
              }}
            />
            <button
              type="button"
              className="password-toggle"
              aria-pressed={showPassword}
              aria-label={t(showPassword ? 'auth.hidePassword' : 'auth.showPassword')}
              title={t(showPassword ? 'auth.hidePassword' : 'auth.showPassword')}
              onClick={() => {
                setShowPassword((v) => !v);
              }}
            >
              {showPassword ? <EyeOff size={17} aria-hidden /> : <Eye size={17} aria-hidden />}
            </button>
          </span>
          {capsLock && (
            <span id="caps-lock-hint" className="auth-caps" role="status">
              <TriangleAlert size={14} aria-hidden /> {t('auth.capsLock')}
            </span>
          )}
        </label>
        {error && (
          <p className="auth-error" role="alert">
            {t(error)}
          </p>
        )}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? t('auth.signingIn') : t('auth.signIn')}
        </button>
        <p className="auth-note">{t('auth.noAccount')}</p>
        <div className="auth-locale" role="group" aria-label={t('auth.language')}>
          {(['es', 'en'] as const).map((l) => (
            <button
              key={l}
              type="button"
              lang={l}
              aria-pressed={locale === l}
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
