import {
  permissions,
  type MineDetail,
  type ProjectSummary,
  type ProjectVersion,
} from '@cronos/api';
import { createEmptyProject } from '@cronos/core';
import { ArrowLeft, FilePlus, FileUp, History } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useFormat, useFormatDate, useT, type MessageKey } from '../i18n';
import { parseErrorText } from '../i18n/coreText';
import { api } from '../server/api';
import { summaryParts } from '../server/summaryText';
import { APP_VERSION, getCompute } from '../session';
import { workspaceErrorKey } from '../stores/workspaceStore';
import { PageShell } from './PageShell';
import { roleKey } from './roles';

interface Loaded {
  mineId: string;
  detail?: MineDetail;
  projects?: ProjectSummary[];
  recent?: ProjectVersion[];
  error?: MessageKey;
}

const RECENT = 6;

/** Una mina: sus proyectos con la última versión de cada uno y lo último que cambió en ella. */
export function MinePage() {
  const t = useT();
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
    Promise.all([
      api.mine(mineId),
      api.projects(mineId),
      api.timeline(mineId, { limit: RECENT }),
    ]).then(
      ([d, p, tl]) => {
        if (alive) setLoaded({ mineId, detail: d, projects: p, recent: tl.versions });
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
        <p className="form-error" role="alert">
          {t(error)}
        </p>
      )}
      {!detail && !error && <p className="muted">{t('workspace.loading')}</p>}
      {detail && (
        <>
          <header className="page-head">
            <div className="page-head-row">
              <h1>{detail.mine.name}</h1>
              <Link className="button-link" to={`/mines/${mineId}/history`}>
                <History size={15} aria-hidden /> {t('history.mineLink')}
              </Link>
            </div>
            <ul className="chips">
              <li>
                {detail.mine.epsg
                  ? t('workspace.epsg', { code: detail.mine.epsg })
                  : t('workspace.noEpsg')}
              </li>
              <li>{t('workspace.yourRole', { role: t(roleKey(detail.role)) })}</li>
            </ul>
          </header>

          <div className="mine-layout">
            <section className="section" aria-labelledby="projects-title">
              <div className="section-head">
                <h2 id="projects-title">{t('projects.title')}</h2>
              </div>
              {projects?.length === 0 && (
                <div className="empty">
                  <strong>{t('projects.empty')}</strong>
                  {canEdit ? t('projects.emptyHint') : t('projects.emptyReviewer')}
                </div>
              )}
              {projects && projects.length > 0 && (
                <ul className="rows">
                  {projects.map((p) => (
                    <ProjectRow key={p.id} project={p} />
                  ))}
                </ul>
              )}
              {actionError && (
                <p className="form-error" role="alert">
                  {actionError}
                </p>
              )}
              {canEdit && (
                <form
                  className="new-project"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void createEmpty();
                  }}
                >
                  <input
                    required
                    name="project-name"
                    autoComplete="off"
                    placeholder={t('projects.newName')}
                    aria-label={t('projects.newName')}
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                    }}
                  />
                  <button className="primary" type="submit" disabled={busy}>
                    <FilePlus size={15} aria-hidden /> {t('projects.new')}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    title={t('projects.importHint')}
                    onClick={() => fileInput.current?.click()}
                  >
                    <FileUp size={15} aria-hidden /> {t('projects.import')}
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
                </form>
              )}
            </section>

            <RecentActivity mineId={mineId} versions={current?.recent ?? []} />
          </div>
        </>
      )}
    </PageShell>
  );
}

function ProjectRow({ project: p }: { project: ProjectSummary }) {
  const t = useT();
  const fmt = useFormat();
  const fmtDate = useFormatDate();
  return (
    <li className="project-row">
      <span className="row-title">
        <strong>{p.name}</strong>
        <span className="row-meta">{t('projects.holes', { n: fmt(p.latest.holeCount) })}</span>
      </span>
      <span className="latest">
        <span>
          <span className="version-tag">v{p.latest.number}</span>{' '}
          <span className="row-meta">
            {t('projects.by', { date: fmtDate(p.latest.createdAt), author: p.latest.authorName })}
          </span>
        </span>
        <p title={p.latest.message}>{p.latest.message}</p>
      </span>
      <Link className="button-link" to={`/projects/${p.id}`}>
        {t('projects.open')}
      </Link>
    </li>
  );
}

/** Lo último que cambió en la mina (historial resumido, D-14). */
function RecentActivity({ mineId, versions }: { mineId: string; versions: ProjectVersion[] }) {
  const t = useT();
  const fmtDate = useFormatDate();
  return (
    <aside className="activity" aria-labelledby="activity-title">
      <h2 id="activity-title">{t('history.recent')}</h2>
      {versions.length === 0 ? (
        <p className="muted">{t('history.recentEmpty')}</p>
      ) : (
        <ol>
          {versions.map((v) => (
            <li key={v.id}>
              <span>
                <strong>{v.projectName}</strong> <span className="version-tag">v{v.number}</span>
              </span>
              <p>{v.message || t('history.initial')}</p>
              {v.summary && <p className="muted">{summaryParts(v.summary, t).join(', ')}</p>}
              <p className="muted">
                {t('projects.by', { date: fmtDate(v.createdAt), author: v.authorName })}
              </p>
            </li>
          ))}
        </ol>
      )}
      <Link to={`/mines/${mineId}/history`}>{t('history.seeAll')}</Link>
    </aside>
  );
}
