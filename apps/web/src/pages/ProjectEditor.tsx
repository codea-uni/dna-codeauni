import { ArrowLeft } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useParams } from 'react-router';
import { App } from '../App';
import { AuthShell } from '../auth/AuthGate';
import { useFormatDate, useT } from '../i18n';
import { ComparePanel } from '../server/ComparePanel';
import { useCompare } from '../server/compareStore';
import { PublishDialog } from '../server/PublishDialog';
import { useServerDialogs } from '../server/ProjectContext';
import { hasUnpublished, useProjectSession } from '../server/projectSession';
import { VersionHistoryDialog } from '../server/VersionHistoryDialog';
import { session } from '../session';
import { useUiStore } from '../stores/uiStore';

/**
 * Editor de un proyecto de la mina: carga la última versión (o, con `:number`, una anterior en
 * solo lectura) y monta el editor de siempre.
 */
export function ProjectEditor() {
  const t = useT();
  const { projectId = '', number } = useParams();
  const version = number === undefined ? undefined : Number(number);
  const status = useProjectSession((s) => s.status);
  const current = useProjectSession((s) => s.current);
  const error = useProjectSession((s) => s.error);
  const open = useProjectSession((s) => s.open);
  const close = useProjectSession((s) => s.close);
  const dialog = useServerDialogs((s) => s.open);
  const showDialog = useServerDialogs((s) => s.show);

  useEffect(() => {
    void open(projectId, version);
  }, [projectId, version, open]);
  useEffect(
    () => () => {
      useCompare.getState().stop();
      close();
      showDialog(null);
    },
    [close, showDialog],
  );
  // Otra versión u otro proyecto: la comparación anterior deja de tener sentido.
  useEffect(() => {
    useCompare.getState().stop();
  }, [projectId, version]);
  // El revisor intenta editar: se le explica en vez de fallar en silencio (H-801).
  useEffect(
    () =>
      session.document.onReadOnlyAttempt((label) => {
        useUiStore.getState().notify(t('projects.readOnlyAttempt', { label }), 'error');
      }),
    [t],
  );
  // Cerrar la pestaña con cambios sin publicar: el navegador pide confirmar (quedan en borrador).
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnpublished()) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, []);

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
  const loaded =
    status === 'ready' &&
    current?.projectId === projectId &&
    (version === undefined ? !current.viewingOld : current.base.number === version);
  if (!loaded)
    return (
      <div className="loading-screen" role="status">
        {t('projects.loading')}
      </div>
    );

  const closeDialog = () => {
    showDialog(null);
  };
  return (
    <>
      <App restoreLocalDraft={false} />
      <EditorBanner />
      <ComparePanel />
      {dialog === 'publish' && <PublishDialog onClose={closeDialog} />}
      {dialog === 'history' && <VersionHistoryDialog onClose={closeDialog} />}
    </>
  );
}

/** Aviso flotante: consulta de una versión anterior, o borrador local sin publicar. */
function EditorBanner() {
  const t = useT();
  const fmtDate = useFormatDate();
  const current = useProjectSession((s) => s.current);
  const draft = useProjectSession((s) => s.draft);
  const recover = useProjectSession((s) => s.recoverDraft);
  const dismiss = useProjectSession((s) => s.dismissDraft);
  if (!current) return null;
  if (current.viewingOld)
    return (
      <div className="editor-banner" role="status">
        {t('history.viewingOld', { n: current.base.number })}
        <Link to={`/projects/${current.projectId}`}>
          {t('history.backToLatest', { n: current.latestNumber })}
        </Link>
      </div>
    );
  if (!draft) return null;
  return (
    <div className="editor-banner" role="status">
      {t('history.draftFound', { date: fmtDate(draft.savedAt) })}
      <button className="primary-inline" onClick={() => void recover()}>
        {t('history.recoverDraft')}
      </button>
      <button onClick={dismiss}>{t('history.dismissDraft')}</button>
    </div>
  );
}
