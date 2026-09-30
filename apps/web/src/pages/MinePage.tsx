import { permissions, type MineDetail, type ProjectSummary } from '@cronos/api';
import { createEmptyProject } from '@cronos/core';
import { ArrowLeft, FilePlus, FileUp, History } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useFormat, useFormatDate, useT, type MessageKey } from '../i18n';
import { parseErrorText } from '../i18n/coreText';
import { api } from '../server/api';
import { APP_VERSION, getCompute } from '../session';
import { workspaceErrorKey } from '../stores/workspaceStore';
import { PageShell } from './PageShell';
import { roleKey } from './roles';

interface Loaded {
  mineId: string;
  detail?: MineDetail;
  projects?: ProjectSummary[];
  error?: MessageKey;
}

/** Una mina: sus proyectos con la última versión de cada uno, y alta de proyectos nuevos. */
export function MinePage() {
  const t = useT();
  const fmt = useFormat();
  const fmtDate = useFormatDate();
  const navigate = useNavigate();
  const { mineId = '' } = useParams();
  // El resultado guarda su mina: al cambiar de mina, lo anterior deja de mostrarse sin reiniciar
  // el estado dentro del efecto.
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const current = loaded?.mineId === mineId ? loaded : null;
  const detail = current?.detail ?? null;
  const projects = current?.projects ?? null;
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([api.mine(mineId), api.projects(mineId)]).then(
      ([d, p]) => {
        if (alive) setLoaded({ mineId, detail: d, projects: p });
      },
      (err: unknown) => {
        if (alive) setLoaded({ mineId, error: workspaceErrorKey(err) });
      },
    );
    return () => {
      alive = false;
    };
  }, [mineId]);

  /** Envía el JSON del proyecto (ya serializado) y abre el proyecto creado. */
  const create = async (fileJson: () => Promise<string | null>, message: string) => {
    setBusy(true);
    setActionError(null);
    try {
      const json = await fileJson();
      if (json === null) return;
      const created = await api.createProjectFromText(mineId, json, message);
      void navigate(`/projects/${created.id}`);
    } catch (err) {
      setActionError(t(workspaceErrorKey(err)));
    } finally {
      setBusy(false);
    }
  };

  const createEmpty = () =>
    create(async () => {
      const project = createEmptyProject(name.trim());
      const epsg = detail?.mine.epsg;
      if (epsg) project.coordinateSystem = { ...project.coordinateSystem, epsg };
      return getCompute().api.serializeProject(project, { appVersion: APP_VERSION });
    }, t('projects.initialMessage'));

  const importFile = (file: File) =>
    create(
      async () => {
        const text = await file.text();
        // Se valida en el worker para dar un error claro; el servidor vuelve a validar.
        const parsed = await getCompute().api.parseProject(text);
        if (!parsed.ok) {
          setActionError(parseErrorText(parsed.error));
          return null;
        }
        return text;
      },
      t('projects.importedMessage', { file: file.name }),
    );

  const error = current?.error;
  const canEdit = detail ? permissions.editDesign(detail.role) : false;

  return (
    <PageShell>
      <Link to="/" className="back-link">
        <ArrowLeft size={14} aria-hidden /> {t('workspace.backToMines')}
      </Link>
      {error && (
        <p className="auth-error" role="alert">
          {t(error)}
        </p>
      )}
      {!detail && !error && <p className="muted">{t('workspace.loading')}</p>}
      {detail && (
        <>
          <h1>{detail.mine.name}</h1>
          <p className="muted">
            {detail.mine.epsg
              ? t('workspace.epsg', { code: detail.mine.epsg })
              : t('workspace.noEpsg')}{' '}
            · {t('workspace.yourRole', { role: t(roleKey(detail.role)) })}
          </p>

          <Link className="button-link" to={`/mines/${mineId}/history`}>
            <History size={14} aria-hidden /> {t('history.mineLink')}
          </Link>

          <section className="page-section">
            <h2>{t('projects.title')}</h2>
            {projects?.length === 0 && <p className="muted">{t('projects.empty')}</p>}
            {projects && projects.length > 0 && (
              <table className="grid-table page-table">
                <thead>
                  <tr>
                    <th>{t('projects.name')}</th>
                    <th>{t('projects.lastVersion')}</th>
                    <th />
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <strong>{p.name}</strong>
                        <div className="muted">
                          {t('projects.holes', { n: fmt(p.latest.holeCount) })}
                        </div>
                      </td>
                      <td>
                        <span className="badge">
                          {t('projects.versionN', { n: p.latest.number })}
                        </span>{' '}
                        {p.latest.message}
                        <div className="muted">
                          {t('projects.by', {
                            date: fmtDate(p.latest.createdAt),
                            author: p.latest.authorName,
                          })}
                        </div>
                      </td>
                      <td className="muted">
                        {t('projects.versions')}: {p.versionCount}
                      </td>
                      <td>
                        <Link className="button-link" to={`/projects/${p.id}`}>
                          {t('projects.open')}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {actionError && (
              <p className="auth-error" role="alert">
                {actionError}
              </p>
            )}
            {canEdit && (
              <div className="inline-form">
                <form
                  className="inline-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void createEmpty();
                  }}
                >
                  <input
                    required
                    placeholder={t('projects.newName')}
                    aria-label={t('projects.newName')}
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                    }}
                  />
                  <button className="primary" type="submit" disabled={busy}>
                    <FilePlus size={14} aria-hidden /> {t('projects.new')}
                  </button>
                </form>
                <button
                  type="button"
                  disabled={busy}
                  title={t('projects.importHint')}
                  onClick={() => fileInput.current?.click()}
                >
                  <FileUp size={14} aria-hidden /> {t('projects.import')}
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".json,application/json"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void importFile(file);
                    e.target.value = '';
                  }}
                />
              </div>
            )}
          </section>
        </>
      )}
    </PageShell>
  );
}
