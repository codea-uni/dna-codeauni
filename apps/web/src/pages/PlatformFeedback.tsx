import {
  ApiError,
  FEEDBACK_KINDS,
  FEEDBACK_STATUSES,
  type FeedbackDetail,
  type FeedbackItem,
  type FeedbackKind,
  type FeedbackList,
  type FeedbackStatus,
  type FeedbackSummary,
  type PlatformOrganization,
} from '@cronos/api';
import { Bug, ChevronLeft, ChevronRight, CircleHelp, Lightbulb, Sparkles, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useFormatDate, useT, type MessageKey } from '../i18n';
import { api } from '../server/api';
import { workspaceErrorKey } from '../stores/workspaceStore';

const PAGE = 25;

const KIND_ICON: Record<FeedbackKind, typeof Bug> = {
  bug: Bug,
  idea: Lightbulb,
  question: CircleHelp,
};

const kindKey = (k: FeedbackKind): MessageKey => `feedback.kind.${k}`;
const statusKey = (s: FeedbackStatus): MessageKey => `feedback.status.${s}`;

/** Errores de la IA con su texto propio; el resto como en las demás páginas. */
function feedbackErrorKey(err: unknown): MessageKey {
  if (err instanceof ApiError) {
    if (err.code === 'ai_not_configured') return 'feedback.error.aiNotConfigured';
    if (err.code.startsWith('ai_')) return 'feedback.error.ai';
  }
  return workspaceErrorKey(err);
}

function toolLabel(tool: string | null, t: ReturnType<typeof useT>): string | null {
  if (tool === 'surface') return t('feedback.tool.surface');
  if (tool === 'underground') return t('feedback.tool.underground');
  return tool;
}

function KindTag({ kind }: { kind: FeedbackKind }) {
  const t = useT();
  const Icon = KIND_ICON[kind];
  return (
    <span className={`fb-kind fb-kind-${kind}`}>
      <Icon size={14} aria-hidden />
      {t(kindKey(kind))}
    </span>
  );
}

interface Filters {
  status: FeedbackStatus | '';
  kind: FeedbackKind | '';
  organizationId: string;
  q: string;
}

/**
 * Buzón de mejoras (consola de la plataforma): filtros, lista de pedidos, detalle con su contexto
 * y revisión (estado, tema y nota), y agrupación con IA de los pedidos abiertos.
 */
export function FeedbackInbox({
  orgs,
  onNewCount,
}: {
  orgs: PlatformOrganization[] | null;
  onNewCount: (n: number) => void;
}) {
  const t = useT();
  const fmtDate = useFormatDate();
  const [filters, setFilters] = useState<Filters>({
    status: '',
    kind: '',
    organizationId: '',
    q: '',
  });
  const [q, setQ] = useState('');
  const [themeFilter, setThemeFilter] = useState<{ theme: string; ids: string[] } | null>(null);
  const [offset, setOffset] = useState(0);
  const [list, setList] = useState<FeedbackList | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [summary, setSummary] = useState<FeedbackSummary | null>(null);
  const [grouping, setGrouping] = useState(false);

  // La búsqueda espera a que se deje de escribir.
  useEffect(() => {
    const id = setTimeout(() => {
      setFilters((f) => (f.q === q ? f : { ...f, q }));
      setOffset(0);
    }, 300);
    return () => {
      clearTimeout(id);
    };
  }, [q]);

  useEffect(() => {
    let alive = true;
    api
      .platformFeedback({
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.kind ? { kind: filters.kind } : {}),
        ...(filters.organizationId ? { organizationId: filters.organizationId } : {}),
        ...(filters.q.trim() ? { q: filters.q.trim() } : {}),
        ...(themeFilter ? { ids: themeFilter.ids.join(',') } : {}),
        limit: PAGE,
        offset,
      })
      .then(
        (l) => {
          if (!alive) return;
          setList(l);
          onNewCount(l.newCount);
        },
        (err: unknown) => {
          if (alive) setError(feedbackErrorKey(err));
        },
      );
    return () => {
      alive = false;
    };
  }, [filters, themeFilter, offset, onNewCount]);

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setOffset(0);
  };

  const replaceItem = (item: FeedbackItem) => {
    setList((l) => {
      if (!l) return l;
      const was = l.items.find((i) => i.id === item.id);
      const delta = (item.status === 'new' ? 1 : 0) - (was?.status === 'new' ? 1 : 0);
      const next = {
        ...l,
        newCount: l.newCount + delta,
        items: l.items.map((i) => (i.id === item.id ? item : i)),
      };
      onNewCount(next.newCount);
      return next;
    });
  };

  const group = () => {
    setGrouping(true);
    setError(null);
    api
      .summarizePlatformFeedback()
      .then(setSummary, (err: unknown) => {
        setError(feedbackErrorKey(err));
      })
      .finally(() => {
        setGrouping(false);
      });
  };

  const total = list?.total ?? 0;
  const orgName = (item: FeedbackItem) => item.organizationName ?? t('feedback.noCompany');

  return (
    <section className="section fb-inbox">
      <div className="section-head">
        <p>{t('feedback.intro')}</p>
        <button className="primary-inline fb-group" onClick={group} disabled={grouping}>
          <Sparkles size={15} aria-hidden />
          {t(grouping ? 'feedback.ai.grouping' : 'feedback.ai.group')}
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {t(error)}
        </p>
      )}

      {summary && (
        <div className="fb-themes">
          <div className="section-head">
            <h3>{t('feedback.ai.themes', { n: summary.considered })}</h3>
            <button
              className="icon"
              aria-label={t('settings.close')}
              onClick={() => {
                setSummary(null);
              }}
            >
              <X size={16} />
            </button>
          </div>
          {summary.themes.length === 0 ? (
            <p className="muted">{t('feedback.ai.none')}</p>
          ) : (
            <>
              <p className="muted">{t('feedback.ai.hint')}</p>
              <ul className="fb-theme-list">
                {summary.themes.map((th) => (
                  <li key={th.theme}>
                    <button
                      className="fb-theme"
                      aria-pressed={themeFilter?.theme === th.theme}
                      onClick={() => {
                        setThemeFilter({ theme: th.theme, ids: th.ids });
                        setFilters({ status: '', kind: '', organizationId: '', q: '' });
                        setQ('');
                        setOffset(0);
                      }}
                    >
                      <strong>{th.theme}</strong>
                      <span className="fb-theme-count">
                        {t('feedback.ai.count', { n: th.count })}
                      </span>
                      <span>{th.summary}</span>
                      {th.suggestion && (
                        <span className="muted">
                          {t('feedback.ai.suggestion')}: {th.suggestion}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <div className="fb-filters form-grid">
        <label>
          {t('feedback.filter.status')}
          <select
            value={filters.status}
            onChange={(e) => {
              setFilter('status', e.target.value as Filters['status']);
            }}
          >
            <option value="">{t('feedback.filter.all')}</option>
            {FEEDBACK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(statusKey(s))}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('feedback.filter.kind')}
          <select
            value={filters.kind}
            onChange={(e) => {
              setFilter('kind', e.target.value as Filters['kind']);
            }}
          >
            <option value="">{t('feedback.filter.all')}</option>
            {FEEDBACK_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(kindKey(k))}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('feedback.filter.company')}
          <select
            value={filters.organizationId}
            onChange={(e) => {
              setFilter('organizationId', e.target.value);
            }}
          >
            <option value="">{t('feedback.filter.allCompanies')}</option>
            {orgs?.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('feedback.filter.search')}
          <input
            type="search"
            value={q}
            placeholder={t('feedback.filter.searchPlaceholder')}
            onChange={(e) => {
              setQ(e.target.value);
            }}
          />
        </label>
      </div>
      {themeFilter && (
        <p className="fb-theme-filter">
          <span>{t('feedback.filter.theme', { theme: themeFilter.theme })}</span>
          <button
            className="icon"
            aria-label={t('feedback.filter.clearTheme')}
            onClick={() => {
              setThemeFilter(null);
              setOffset(0);
            }}
          >
            <X size={14} />
          </button>
        </p>
      )}

      {!list && !error && <p className="muted">{t('workspace.loading')}</p>}
      {list?.items.length === 0 && (
        <p className="empty">
          <strong>{t('feedback.emptyTitle')}</strong>
          {t('feedback.empty')}
        </p>
      )}
      {list && list.items.length > 0 && (
        <table className="page-table fb-table">
          <thead>
            <tr>
              <th>{t('feedback.col.date')}</th>
              <th>{t('feedback.col.company')}</th>
              <th>{t('feedback.col.user')}</th>
              <th>{t('feedback.col.kind')}</th>
              <th>{t('feedback.col.text')}</th>
              <th>{t('feedback.col.where')}</th>
              <th>{t('feedback.col.status')}</th>
            </tr>
          </thead>
          <tbody>
            {list.items.map((item) => (
              <tr
                key={item.id}
                className={item.status === 'new' ? 'is-new' : undefined}
                tabIndex={0}
                onClick={() => {
                  setOpenId(item.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setOpenId(item.id);
                  }
                }}
              >
                <td className="fb-date">{fmtDate(item.createdAt)}</td>
                <td className="fb-org">{orgName(item)}</td>
                <td className="fb-user">{item.userName ?? item.userEmail ?? '—'}</td>
                <td className="fb-kind-cell">
                  <KindTag kind={item.kind} />
                </td>
                <td className="fb-text">
                  <span>{item.text}</span>
                  {item.theme && <span className="fb-theme-tag">{item.theme}</span>}
                </td>
                <td className="fb-where">
                  {[toolLabel(item.tool, t), item.screen].filter(Boolean).join(' · ') || '—'}
                </td>
                <td className="fb-status-cell">
                  <span className={`fb-status fb-status-${item.status}`}>
                    {t(statusKey(item.status))}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {list && total > PAGE && (
        <div className="fb-pager">
          <button
            disabled={offset === 0}
            onClick={() => {
              setOffset(Math.max(0, offset - PAGE));
            }}
          >
            <ChevronLeft size={15} aria-hidden />
            {t('feedback.prev')}
          </button>
          <span className="muted">
            {t('feedback.range', {
              from: offset + 1,
              to: Math.min(total, offset + PAGE),
              total,
            })}
          </span>
          <button
            disabled={offset + PAGE >= total}
            onClick={() => {
              setOffset(offset + PAGE);
            }}
          >
            {t('feedback.next')}
            <ChevronRight size={15} aria-hidden />
          </button>
        </div>
      )}

      {openId && (
        <FeedbackDetailDialog
          id={openId}
          onClose={() => {
            setOpenId(null);
          }}
          onSaved={replaceItem}
        />
      )}
    </section>
  );
}

/** Detalle de un pedido: texto, captura, contexto legible y revisión. */
function FeedbackDetailDialog({
  id,
  onClose,
  onSaved,
}: {
  id: string;
  onClose: () => void;
  onSaved: (item: FeedbackItem) => void;
}) {
  const t = useT();
  const fmtDate = useFormatDate();
  const [detail, setDetail] = useState<FeedbackDetail | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [form, setForm] = useState<{ status: FeedbackStatus; theme: string; note: string }>({
    status: 'new',
    theme: '',
    note: '',
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    let alive = true;
    api.platformFeedbackDetail(id).then(
      (d) => {
        if (!alive) return;
        setDetail(d);
        setForm({ status: d.status, theme: d.theme ?? '', note: d.adminNote ?? '' });
      },
      (err: unknown) => {
        if (alive) setError(feedbackErrorKey(err));
      },
    );
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (zoom) setZoom(false);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [zoom, onClose]);

  const save = () => {
    if (!detail) return;
    setBusy(true);
    setSaved(false);
    setError(null);
    api
      .updatePlatformFeedback(detail.id, {
        status: form.status,
        theme: form.theme.trim() || null,
        adminNote: form.note.trim() || null,
      })
      .then(
        (item) => {
          setDetail({ ...detail, ...item });
          onSaved(item);
          setSaved(true);
        },
        (err: unknown) => {
          setError(feedbackErrorKey(err));
        },
      )
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={t('feedback.detail.heading')}
      onClick={onClose}
    >
      <div
        className="modal dialog-wide fb-detail"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <header>
          <h2>
            {detail
              ? t('feedback.detail.title', { date: fmtDate(detail.createdAt) })
              : t('workspace.loading')}
          </h2>
          <button className="icon" onClick={onClose} aria-label={t('settings.close')}>
            <X size={16} />
          </button>
        </header>
        {error && (
          <p className="form-error" role="alert">
            {t(error)}
          </p>
        )}
        {detail && (
          <div className="dialog-body">
            <div className="fb-detail-head">
              <KindTag kind={detail.kind} />
              <span className="muted">
                {t('feedback.detail.from', {
                  user: detail.userName
                    ? `${detail.userName}${detail.userEmail ? ` <${detail.userEmail}>` : ''}`
                    : (detail.userEmail ?? '—'),
                  company: detail.organizationName ?? t('feedback.noCompany'),
                })}
              </span>
            </div>
            <p className="fb-full-text">{detail.text}</p>

            {detail.screenshot && (
              <figure className="fb-shot">
                <button
                  className="fb-shot-thumb"
                  aria-label={t('feedback.detail.screenshotZoom')}
                  onClick={() => {
                    setZoom(true);
                  }}
                >
                  <img src={detail.screenshot} alt={t('feedback.detail.screenshot')} />
                </button>
                <figcaption className="muted">{t('feedback.detail.screenshot')}</figcaption>
              </figure>
            )}

            <ContextView detail={detail} />

            <div className="fb-triage">
              <h3>{t('feedback.detail.triage')}</h3>
              <div className="form-grid">
                <label>
                  {t('feedback.col.status')}
                  <select
                    value={form.status}
                    onChange={(e) => {
                      setForm({ ...form, status: e.target.value as FeedbackStatus });
                      setSaved(false);
                    }}
                  >
                    {FEEDBACK_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {t(statusKey(s))}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('feedback.detail.theme')}
                  <input
                    maxLength={80}
                    value={form.theme}
                    placeholder={t('feedback.detail.themePlaceholder')}
                    onChange={(e) => {
                      setForm({ ...form, theme: e.target.value });
                      setSaved(false);
                    }}
                  />
                </label>
              </div>
              <label className="fb-note">
                {t('feedback.detail.note')}
                <textarea
                  rows={3}
                  maxLength={4000}
                  value={form.note}
                  onChange={(e) => {
                    setForm({ ...form, note: e.target.value });
                    setSaved(false);
                  }}
                />
              </label>
            </div>
          </div>
        )}
        <footer>
          {saved && (
            <span className="ok" role="status">
              {t('feedback.detail.saved')}
            </span>
          )}
          <button onClick={onClose}>{t('settings.close')}</button>
          <button className="primary-inline" disabled={!detail || busy} onClick={save}>
            {t('feedback.detail.save')}
          </button>
        </footer>
      </div>
      {zoom && detail?.screenshot && (
        <div
          className="fb-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={t('feedback.detail.screenshot')}
          onClick={(e) => {
            e.stopPropagation();
            setZoom(false);
          }}
        >
          <img src={detail.screenshot} alt={t('feedback.detail.screenshot')} />
        </div>
      )}
    </div>
  );
}

const KNOWN = new Set([
  'screen',
  'tool',
  'windows',
  'recentActions',
  'recentErrors',
  'viewport',
  'appVersion',
  'userAgent',
  'conversation',
  'locale',
]);

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const field = (v: unknown, key: string): unknown =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>)[key] : undefined;

/** Contexto del pedido como lo leería una persona (no el JSON crudo). */
function ContextView({ detail }: { detail: FeedbackDetail }) {
  const t = useT();
  const fmtDate = useFormatDate();
  const c = detail.context;
  const rows: [MessageKey, ReactNode][] = [];
  const tool = toolLabel(str(c.tool), t);
  if (tool) rows.push(['feedback.detail.tool', tool]);
  if (str(c.screen)) rows.push(['feedback.detail.screen', str(c.screen)]);
  if (detail.mineName) rows.push(['feedback.detail.mine', detail.mineName]);
  if (detail.projectName) rows.push(['feedback.detail.project', detail.projectName]);
  const vw = field(c.viewport, 'width');
  const vh = field(c.viewport, 'height');
  if (typeof vw === 'number' && typeof vh === 'number') {
    const dpr = field(c.viewport, 'dpr');
    rows.push([
      'feedback.detail.viewport',
      `${String(vw)} × ${String(vh)} px${typeof dpr === 'number' ? ` · ×${String(dpr)}` : ''}`,
    ]);
  }
  if (str(c.appVersion)) rows.push(['feedback.detail.version', str(c.appVersion)]);
  if (str(c.userAgent)) rows.push(['feedback.detail.browser', str(c.userAgent)]);

  const windows = arr(c.windows)
    .map(str)
    .filter((w): w is string => w !== null);
  const actions = arr(c.recentActions)
    .map((a) => ({ at: str(field(a, 'at')), label: str(field(a, 'label')) ?? str(a) }))
    .filter((a) => a.label);
  const errors = arr(c.recentErrors)
    .map((e) => ({ at: str(field(e, 'at')), message: str(field(e, 'message')) ?? str(e) }))
    .filter((e) => e.message);
  const conversation = arr(c.conversation)
    .map((m) => ({ role: str(field(m, 'role')), text: str(field(m, 'text')) }))
    .filter((m) => m.text);
  const others = Object.entries(c).filter(([k]) => !KNOWN.has(k));
  const time = (at: string | null) => (at && !Number.isNaN(Date.parse(at)) ? fmtDate(at) : at);

  const nothing =
    rows.length === 0 &&
    windows.length === 0 &&
    actions.length === 0 &&
    errors.length === 0 &&
    conversation.length === 0 &&
    others.length === 0;

  return (
    <div className="fb-context">
      <h3>{t('feedback.detail.context')}</h3>
      {nothing && <p className="muted">{t('feedback.detail.noContext')}</p>}
      {rows.length > 0 && (
        <dl className="fb-facts">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{t(label)}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {windows.length > 0 && (
        <div>
          <h4>{t('feedback.detail.windows')}</h4>
          <ul className="chips">
            {windows.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      {actions.length > 0 && (
        <div>
          <h4>{t('feedback.detail.actions')}</h4>
          <ol className="fb-log">
            {actions.map((a, i) => (
              <li key={i}>
                {a.at && <span className="muted">{time(a.at)}</span>}
                <span>{a.label}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {errors.length > 0 && (
        <div>
          <h4>{t('feedback.detail.errors')}</h4>
          <ul className="fb-log fb-errors">
            {errors.map((e, i) => (
              <li key={i}>
                {e.at && <span className="muted">{time(e.at)}</span>}
                <code>{e.message}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
      {conversation.length > 0 && (
        <div>
          <h4>{t('feedback.detail.conversation')}</h4>
          <ul className="fb-chat">
            {conversation.map((m, i) => (
              <li key={i} className={m.role === 'assistant' ? 'from-ai' : 'from-user'}>
                <small>
                  {t(m.role === 'assistant' ? 'feedback.detail.assistant' : 'feedback.detail.you')}
                </small>
                <span>{m.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {others.length > 0 && (
        <div>
          <h4>{t('feedback.detail.other')}</h4>
          <dl className="fb-facts">
            {others.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{typeof v === 'string' ? v : JSON.stringify(v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
