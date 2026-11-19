import { useEffect, type ReactNode } from 'react';
import { useLocale, useT } from '../i18n';
import { useAuth } from '../server/api';
import { BrandMark } from '../components/BrandMark';
import { APP_VERSION } from '../session';
import { BlastSequence } from './BlastSequence';
import { Contours } from './Contours';
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
  const organization = useAuth((s) => s.organization);
  const signOut = useAuth((s) => s.signOut);
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

  if (status === 'loading')
    return (
      <AuthShell>
        <p className="auth-note">{t('auth.loading')}</p>
      </AuthShell>
    );
  if (status === 'unreachable')
    return (
      <AuthShell>
        <h1 className="auth-title">{t('auth.unreachableTitle')}</h1>
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
        <h1 className="auth-title">{t('auth.mustChangeTitle')}</h1>
        <p className="auth-note">{t('auth.mustChange')}</p>
        <ChangePasswordForm />
      </AuthShell>
    );
  // Empresa desactivada por la plataforma: sus datos siguen, pero nadie de ella entra.
  if (organization?.disabled && !user.isSuperAdmin)
    return (
      <AuthShell>
        <h1 className="auth-title">{t('auth.orgDisabledTitle', { name: organization.name })}</h1>
        <p>{t('auth.orgDisabled')}</p>
        <button onClick={() => void signOut()}>{t('auth.signOut')}</button>
      </AuthShell>
    );
  return children;
}

/**
 * Marco del login y de las pantallas previas al editor: a la izquierda la marca con la malla que
 * se enciende en secuencia; a la derecha el formulario o el mensaje.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  const t = useT();
  return (
    <main className="auth-page">
      <section className="auth-hero">
        <Contours />
        <div className="auth-brand">
          <img className="auth-logo" src="/brand/codeauni-blanco.png" alt="CODEa UNI" />
          <BrandMark size={34} />
        </div>
        <div className="auth-hero-body">
          <p className="kicker">{t('auth.kicker')}</p>
          <BlastSequence />
          <p className="claim">{t('auth.claim')}</p>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">{children}</div>
        <p className="auth-version mono">Cronos v{APP_VERSION}</p>
      </section>
    </main>
  );
}
