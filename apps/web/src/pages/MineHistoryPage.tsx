import type {
  Member,
  MineDetail,
  ProjectSummary,
  ProjectVersion,
  TimelineQuery,
} from '@cronos/api';
import { ArrowLeft, Download } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useFormatDate, useLocale, useT, type MessageKey } from '../i18n';
import { api } from '../server/api';
import { summaryParts } from '../server/summaryText';
import { workspaceErrorKey } from '../stores/workspaceStore';
import { PageShell } from './PageShell';

interface Filters {
  projectId: string;
  authorId: string;
  /** Fechas locales `AAAA-MM-DD` de los campos del formulario. */
  from: string;
  to: string;
}

const NO_FILTERS: Filters = { projectId: '', authorId: '', from: '', to: '' };

/** Día local `AAAA-MM-DD` → instante ISO de su medianoche local (hasta: la del día siguiente). */
function dayStart(day: string, plusDays = 0): string | undefined {
  if (!day) return undefined;
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d + plusDays).toISOString();
}

function toQuery(f: Filters): TimelineQuery {
  const q: TimelineQuery = {};
  const from = dayStart(f.from);
  const to = dayStart(f.to, 1);
  if (f.projectId) q.projectId = f.projectId;
  if (f.authorId) q.authorId = f.authorId;
  if (from) q.from = from;
  if (to) q.to = to;
  return q;
}

/**
 * Historial de la mina (D-14): la evolución del diseño de todos sus proyectos en una línea de
 * tiempo, agrupada por día, con filtros; cada versión se abre o se descarga.
 */
export function MineHistoryPage() {
  const t = useT();
  const fmtDate = useFormatDate();
  const locale = useLocale((s) => s.locale);
  const { mineId = '' } = useParams();
  const [mine, setMine] = useState<MineDetail | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [page, setPage] = useState<{
    key: string;
    versions: ProjectVersion[];
    hasMore: boolean;
  } | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const query = useMemo(() => toQuery(filters), [filters]);
  const key = `${mineId}|${JSON.stringify(query)}`;

  useEffect(() => {
    let alive = true;
    Promise.all([api.mine(mineId), api.projects(mineId)])
      .then(async ([m, p]) => {
        const people = await api.members(m.mine.organizationId).catch(() => []);
        if (!alive) return;
        setMine(m);
        setProjects(p);
        setMembers(people);
      })
      .catch((err: unknown) => {
        if (alive) setError(workspaceErrorKey(err));
      });
    return () => {
      alive = false;
    };
  }, [mineId]);

  useEffect(() => {
    let alive = true;
    api.timeline(mineId, query).then(
      (tl) => {
        if (alive) setPage({ key, ...tl });
      },
      (err: unknown) => {
        if (alive) setError(workspaceErrorKey(err));
      },
    );
    return () => {
      alive = false;
    };
  }, [mineId, query, key]);

  const versions = page?.key === key ? page.versions : null;
  const loadMore = async () => {
    const last = versions?.at(-1);
    if (!last || !page) return;
    setLoadingMore(true);
    try {
      const more = await api.timeline(mineId, { ...query, before: last.id });
      setPage({ key, versions: [...page.versions, ...more.versions], hasMore: more.hasMore });
    } catch (err) {
      setError(workspaceErrorKey(err));
    } finally {
      setLoadingMore(false);
    }
  };

  // Agrupadas por día local, en el orden en que llegan (de la más nueva a la más vieja).
  const intlLocale = locale === 'es' ? 'es-ES' : 'en-US';
  const dayFormat = new Intl.DateTimeFormat(intlLocale, { dateStyle: 'full' });
  const timeFormat = new Intl.DateTimeFormat(intlLocale, { timeStyle: 'short' });
  const days: { day: string; items: ProjectVersion[] }[] = [];
  for (const v of versions ?? []) {
    const full = dayFormat.format(new Date(v.createdAt));
    const day = full.charAt(0).toUpperCase() + full.slice(1);
    const lastDay = days.at(-1);
    if (lastDay?.day === day) lastDay.items.push(v);
    else days.push({ day, items: [v] });
  }
  const set = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
  };

  return (
    <PageShell>
      <Link to={`/mines/${mineId}`} className="back-link">
        <ArrowLeft size={14} aria-hidden /> {t('projects.backToMine')}
      </Link>
      <h1>{mine ? t('history.mineTitle', { mine: mine.mine.name }) : t('history.mineLink')}</h1>
      <p className="muted">{t('history.mineHint')}</p>
      {error && (
        <p className="auth-error" role="alert">
          {t(error)}
        </p>
      )}

      <div className="inline-form filters">
        <select
          aria-label={t('history.filterProject')}
          value={filters.projectId}
          onChange={(e) => {
            set({ projectId: e.target.value });
          }}
        >
          <option value="">{t('history.allProjects')}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          aria-label={t('history.filterAuthor')}
          value={filters.authorId}
          onChange={(e) => {
            set({ authorId: e.target.value });
          }}
        >
          <option value="">{t('history.allAuthors')}</option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.name}
            </option>
          ))}
        </select>
        <label>
          <span className="muted">{t('history.from')}</span>
          <input
            type="date"
            value={filters.from}
            onChange={(e) => {
              set({ from: e.target.value });
            }}
          />
        </label>
        <label>
          <span className="muted">{t('history.to')}</span>
          <input
            type="date"
            value={filters.to}
            onChange={(e) => {
              set({ to: e.target.value });
            }}
          />
        </label>
      </div>

      {!versions && !error && <p className="muted">{t('workspace.loading')}</p>}
      {versions?.length === 0 && <p className="muted">{t('history.empty')}</p>}
      <ol className="timeline">
        {days.map((d) => (
          <li key={d.day}>
            <h3>{d.day}</h3>
            <ul>
              {d.items.map((v) => (
                <li key={v.id} className="timeline-entry">
                  <span className="muted timeline-time" title={fmtDate(v.createdAt)}>
                    {timeFormat.format(new Date(v.createdAt))}
                  </span>
                  <div>
                    <div>
                      <strong>{v.projectName}</strong> <span className="badge">v{v.number}</span>{' '}
                      <span className="muted">· {v.authorName}</span>
                    </div>
                    <div>{v.message || (v.number === 1 ? t('history.initial') : '')}</div>
                    {v.summary && (
                      <div className="muted">{summaryParts(v.summary, t).join(' · ')}</div>
                    )}
                  </div>
                  <div className="timeline-actions">
                    <Link
                      className="button-link"
                      to={`/projects/${v.projectId}/versions/${v.number}`}
                    >
                      {t('history.open')}
                    </Link>
                    <a
                      className="button-link"
                      href={api.versionDownloadUrl(v.projectId, v.number)}
                      title={t('history.download')}
                    >
                      <Download size={13} aria-hidden /> {t('history.download')}
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      {page?.key === key && page.hasMore && (
        <button disabled={loadingMore} onClick={() => void loadMore()}>
          {t('history.loadMore')}
        </button>
      )}
    </PageShell>
  );
}
