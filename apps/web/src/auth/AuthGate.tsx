import { useEffect, type ReactNode } from 'react';
import { useLocale, useT } from '../i18n';
import { useAuth } from '../server/api';
import { ChangePasswordForm } from './ChangePasswordForm';
import { LoginPage } from './LoginPage';

/**
 * Puerta del modo servidor (D-14): sin sesión muestra el login; con contraseña temporal pide
 * cambiarla; con sesión muestra la app. El idioma del usuario se aplica al entrar.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const t = useT();
  const status = useAuth((s) => s.status);
  const user = useAuth((s) => s.user);
  const refresh = useAuth((s) => s.refresh);
  const setLocale = useLocale((s) => s.setLocale);
  const userLocale = user?.locale;

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (userLocale) setLocale(userLocale);
  }, [userLocale, setLocale]);
  // Cambiar el idioma en la app lo guarda en la cuenta (preferencia del usuario, 03 §2).
  useEffect(
    () =>
      useLocale.subscribe(({ locale }) => {
        const auth = useAuth.getState();
        if (auth.status === 'authenticated' && auth.user && auth.user.locale !== locale)
          void auth.setLocale(locale);
      }),
    [],
  );

  if (status === 'loading') return <AuthShell>{t('auth.loading')}</AuthShell>;
  if (status === 'unreachable')
    return (
      <AuthShell>
        <p className="auth-error" role="alert">
          {t('auth.error.unreachable')}
        </p>
        <button className="primary" onClick={() => void refresh()}>
          {t('auth.retry')}
        </button>
      </AuthShell>
    );
  if (status === 'anonymous' || !user) return <LoginPage />;
  if (user.mustChangePassword)
    return (
      <AuthShell>
        <p>{t('auth.mustChange')}</p>
        <ChangePasswordForm />
      </AuthShell>
    );
  return children;
}

/** Tarjeta centrada con la marca, común a login, carga y cambio de contraseña. */
export function AuthShell({ children }: { children: ReactNode }) {
  const t = useT();
  return (
    <main className="auth-page">
      <section className="auth-card">
        <header>
          <strong className="brand">Cronos</strong>
          <span className="muted">{t('auth.subtitle')}</span>
        </header>
        {children}
      </section>
    </main>
  );
}
