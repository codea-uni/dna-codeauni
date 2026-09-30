import { ArrowLeft } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useParams } from 'react-router';
import { App } from '../App';
import { AuthShell } from '../auth/AuthGate';
import { useT } from '../i18n';
import { useProjectSession } from '../server/projectSession';
import { session } from '../session';
import { useUiStore } from '../stores/uiStore';

/** Editor de un proyecto de la mina: carga su última versión y monta el editor de siempre. */
export function ProjectEditor() {
  const t = useT();
  const { projectId = '' } = useParams();
  const status = useProjectSession((s) => s.status);
  const current = useProjectSession((s) => s.current);
  const error = useProjectSession((s) => s.error);
  const open = useProjectSession((s) => s.open);
  const close = useProjectSession((s) => s.close);

  useEffect(() => {
    void open(projectId);
  }, [projectId, open]);
  useEffect(() => close, [close]);
  // El revisor intenta editar: se le explica en vez de fallar en silencio (H-801).
  useEffect(
    () =>
      session.document.onReadOnlyAttempt((label) => {
        useUiStore.getState().notify(t('projects.readOnlyAttempt', { label }), 'error');
      }),
    [t],
  );

  if (status === 'error')
    return (
      <AuthShell>
        <p className="auth-error" role="alert">
          {typeof error === 'object' && error !== null
            ? error.text
            : t(error ?? 'auth.error.unexpected')}
        </p>
        <Link to="/" className="back-link">
          <ArrowLeft size={14} aria-hidden /> {t('workspace.backToMines')}
        </Link>
      </AuthShell>
    );
  if (status !== 'ready' || current?.projectId !== projectId)
    return <AuthShell>{t('projects.loading')}</AuthShell>;
  return <App restoreLocalDraft={false} />;
}
