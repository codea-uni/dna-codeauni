import {
  permissions,
  type MineDetail,
  type MineSurvey,
  type ProjectSummary,
  type ProjectVersion,
} from '@cronos/api';
import { createEmptyProject, PROJECT_KINDS, type ProjectKind } from '@cronos/core';
import { ArrowLeft, Eye, FilePlus, FileUp, History } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  PRODUCT_ICON,
  PRODUCT_NAME,
  TOOL_PARAM,
  projectPath,
  toolFromSearch,
  useProductChrome,
} from '../product/product';
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
  surveys?: MineSurvey[];
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
  const nameInput = useRef<HTMLInputElement>(null);
  // Herramienta elegida en la mina (`?tool=`): Open Pit por defecto, que es lo que ya se usa.
  const [search, setSearch] = useSearchParams();
  const tool: ProjectKind = toolFromSearch(search) ?? 'surface';
  const toolName = t(PRODUCT_NAME[tool]);
  useProductChrome(tool, `${toolName} · ${current?.detail?.mine.name ?? ''}`.replace(/ · $/, ''));
  const chooseTool = (next: ProjectKind) => {
    setSearch({ [TOOL_PARAM]: next }, { replace: true });
  };
  // «Crear un proyecto nuevo en …» desde la visualización cruzada: enfoca el nombre.
  const wantsNew = search.get('new') === '1';
  useEffect(() => {
    if (wantsNew && detail) nameInput.current?.focus();
  }, [wantsNew, detail]);

  useEffect(() => {
    let alive = true;
    Promise.all([
      api.mine(mineId),
      api.projects(mineId),
      api.timeline(mineId, { limit: RECENT }),
      api.surveys(mineId),
    ]).then(
      ([d, p, tl, surveys]) => {
        if (alive) setLoaded({ mineId, detail: d, projects: p, recent: tl.versions, surveys });
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
      const project = createEmptyProject(name.trim(), new Date(), tool);
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
        // Un archivo sin tipo (anterior a las dos herramientas) entra en la herramienta elegida.
        if (parsed.file.project.kind) return text;
        const data = JSON.parse(text) as { project?: Record<string, unknown> };
        if (data.project) data.project.kind = tool;
        return JSON.stringify(data);
      },
      t('projects.importedMessage', { file: file.name }),
    );

  const error = current?.error;
  const canEdit = detail ? permissions.editDesign(detail.role) : false;
  // Cada herramienta lista sus proyectos; los de la otra se pueden ver sin editarlos.
  const mine = projects?.filter((p) => p.kind === tool) ?? null;
  const others = projects?.filter((p) => p.kind !== tool) ?? null;
  const otherTool: ProjectKind = tool === 'surface' ? 'underground' : 'surface';

  const projectCount = (kind: ProjectKind) => {
    if (!projects) return '…';
    const n = projects.filter((p) => p.kind === kind).length;
    return n === 1 ? t('product.countOne') : t('product.count', { n });
  };

  return (
    <PageShell tool={tool}>
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

          <div className="tool-entries" role="group" aria-label={t('product.shared')}>
            {PROJECT_KINDS.map((kind) => {
              const Icon = PRODUCT_ICON[kind];
              return (
                <button
                  key={kind}
                  type="button"
                  className="tool-entry"
                  data-kind={kind}
                  aria-pressed={tool === kind}
                  onClick={() => {
                    chooseTool(kind);
                  }}
                >
                  <span className="tool-entry-icon" aria-hidden>
                    <Icon size={22} />
                  </span>
                  <strong translate="no">{t(`product.enter.${kind}`)}</strong>
                  <span className="tool-entry-count">{projectCount(kind)}</span>
                  <small>{t(`product.enterHint.${kind}`)}</small>
                </button>
              );
            })}
          </div>

          <div className="mine-layout">
            <section className="section" aria-labelledby="projects-title">
              <div className="section-head">
                <h2 id="projects-title">{t('product.projectsOf', { tool: toolName })}</h2>
              </div>
              <p className="muted">{t('product.shared')}</p>
              {mine?.length === 0 && (
                <div className="empty">
                  <strong>{t('product.empty', { tool: toolName })}</strong>
                  {canEdit ? t('projects.emptyHint') : t('projects.emptyReviewer')}
                </div>
              )}
              {mine && mine.length > 0 && (
                <ul className="rows">
                  {mine.map((p) => (
                    <ProjectRow key={p.id} project={p} tool={tool} />
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
                    ref={nameInput}
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
                    <FilePlus size={15} aria-hidden /> {t('product.newIn', { tool: toolName })}
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

              <div className="tool-others">
                <h3>{t('product.others', { tool: t(PRODUCT_NAME[otherTool]) })}</h3>
                {others?.length === 0 && (
                  <p className="muted">
                    {t('product.othersEmpty', { tool: t(PRODUCT_NAME[otherTool]) })}
                  </p>
                )}
                {others && others.length > 0 && (
                  <ul className="rows">
                    {others.map((p) => (
                      <ProjectRow key={p.id} project={p} tool={tool} />
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <div className="mine-side">
              <RecentActivity mineId={mineId} versions={current?.recent ?? []} />
              <MineSurveys surveys={current?.surveys ?? []} />
            </div>
          </div>
        </>
      )}
    </PageShell>
  );
}

/** Un proyecto de la lista; si es de la otra herramienta, se abre solo para verlo. */
function ProjectRow({ project: p, tool }: { project: ProjectSummary; tool: ProjectKind }) {
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
      <Link className="button-link" to={projectPath(p.id, p.kind, tool)}>
        {p.kind === tool ? (
          t('projects.open')
        ) : (
          <>
            <Eye size={14} aria-hidden /> {t('product.view')}
          </>
        )}
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

/**
 * Levantamientos topográficos de la mina (D-16), del más nuevo al más viejo: los proyectos los
 * usan como referencia y se suben una sola vez.
 */
function MineSurveys({ surveys }: { surveys: MineSurvey[] }) {
  const t = useT();
  const fmt = useFormat();
  const fmtDate = useFormatDate();
  return (
    <aside className="activity" aria-labelledby="surveys-title">
      <h2 id="surveys-title">{t('topo.section')}</h2>
      {surveys.length === 0 ? (
        <p className="muted">{t('topo.mine.empty')}</p>
      ) : (
        <ol>
          {surveys.map(({ survey: s, createdAt, createdBy }) => (
            <li key={s.id}>
              <span>
                <strong>{s.name}</strong> <span className="row-meta">{s.surveyDate}</span>
              </span>
              <p className="muted">
                {t('topo.panel.stats', {
                  points: fmt(s.stats.points),
                  triangles: fmt(s.stats.triangles),
                  lines: fmt(s.stats.lines),
                })}
              </p>
              <p className="muted">
                {t('topo.mine.uploaded', {
                  date: fmtDate(createdAt),
                  author: createdBy?.name ?? '—',
                })}
              </p>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
