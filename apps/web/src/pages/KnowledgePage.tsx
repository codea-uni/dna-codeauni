import {
  ApiError,
  KNOWLEDGE_CATEGORIES,
  permissions,
  type CompanyExplosive,
  type KnowledgeCategory,
  type KnowledgeDoc,
  type KnowledgeLayer,
  type Mine,
  type ProjectSummary,
} from '@cronos/api';
import { createDefaultLibrary, newId } from '@cronos/core';
import { FileUp, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useFormat, useFormatDate, useT, type MessageKey } from '../i18n';
import { api, useAuth, useWorkspace } from '../server/api';
import { PageShell } from './PageShell';

type Tab = KnowledgeLayer | 'explosives';
const TABS: readonly Tab[] = ['general', 'organization', 'mine', 'project', 'explosives'];

/** Mensaje de un error de la API para la línea de error de la página. */
function errorText(e: unknown): string {
  return e instanceof ApiError || e instanceof Error ? e.message : String(e);
}

/**
 * Capas de conocimiento del agente (general, empresa, sitio, proyecto) y catálogo de explosivos de
 * la empresa. El superadministrador solo ve la general (no pertenece a ninguna empresa, D-14).
 */
export function KnowledgePage() {
  const t = useT();
  const organization = useWorkspace((s) => s.organization);
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab') as Tab | null;
  const tabs = organization ? TABS : (['general'] as const);
  const tab: Tab = requested && tabs.includes(requested) ? requested : 'general';
  const mineId = params.get('mine') ?? '';
  const projectId = params.get('project') ?? '';

  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  return (
    <PageShell>
      <header className="page-head">
        <h1>{t('kb.title')}</h1>
        <p className="lede">{t('kb.lede')}</p>
      </header>
      <div className="admin-tabs" role="tablist">
        {tabs.map((id) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => {
              set({ tab: id === 'general' ? '' : id });
            }}
          >
            {t(`kb.layer.${id}` as MessageKey)}
          </button>
        ))}
      </div>
      {!organization && <p className="muted">{t('kb.noOrg')}</p>}
      <p className="muted">{t(`kb.hint.${tab}` as MessageKey)}</p>
      {tab === 'explosives' && organization ? (
        <Explosives orgId={organization.id} />
      ) : (
        <LayerTab
          layer={tab as KnowledgeLayer}
          orgId={organization?.id ?? null}
          mineId={mineId}
          projectId={projectId}
          onMine={(id) => {
            set({ mine: id, project: '' });
          }}
          onProject={(id) => {
            set({ project: id });
          }}
        />
      )}
    </PageShell>
  );
}

function LayerTab(props: {
  layer: KnowledgeLayer;
  orgId: string | null;
  mineId: string;
  projectId: string;
  onMine: (id: string) => void;
  onProject: (id: string) => void;
}) {
  const { layer, orgId, mineId, projectId } = props;
  const t = useT();
  const [mines, setMines] = useState<Mine[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);

  useEffect(() => {
    if (!orgId || (layer !== 'mine' && layer !== 'project')) return;
    void api.mines(orgId).then(setMines, () => {
      setMines([]);
    });
  }, [orgId, layer]);
  useEffect(() => {
    if (layer !== 'project' || !mineId) return;
    void api.projects(mineId).then(setProjects, () => {
      setProjects([]);
    });
  }, [layer, mineId]);

  const ownerId =
    layer === 'general'
      ? null
      : layer === 'organization'
        ? orgId
        : layer === 'mine'
          ? mineId || null
          : projectId || null;

  return (
    <>
      {(layer === 'mine' || layer === 'project') && (
        <div className="form-grid">
          <label>
            {t('kb.mine')}
            <select
              value={mineId}
              onChange={(e) => {
                props.onMine(e.target.value);
              }}
            >
              <option value="">{t('kb.choose')}</option>
              {mines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          {layer === 'project' && (
            <label>
              {t('kb.project')}
              <select
                value={projectId}
                disabled={!mineId}
                onChange={(e) => {
                  props.onProject(e.target.value);
                }}
              >
                <option value="">{t('kb.choose')}</option>
                {(mineId ? projects : []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      {(layer === 'general' || ownerId) && <Docs layer={layer} ownerId={ownerId} />}
    </>
  );
}

function Docs({ layer, ownerId }: { layer: KnowledgeLayer; ownerId: string | null }) {
  const t = useT();
  const fmt = useFormat();
  const fmtDate = useFormatDate();
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [canWrite, setCanWrite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<{ id: string; content: string } | null>(null);

  const reload = useCallback(() => {
    api.knowledge(layer, ownerId).then(
      (r) => {
        setDocs(r.docs);
        setCanWrite(r.canWrite);
        setError(null);
      },
      (e: unknown) => {
        setDocs([]);
        setError(errorText(e));
      },
    );
  }, [layer, ownerId]);
  useEffect(reload, [reload]);

  return (
    <section className="section">
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {docs.length === 0 ? (
        <p className="muted">{t('kb.empty')}</p>
      ) : (
        <ul className="rows kb-docs">
          {docs.map((d) => (
            <li key={d.id} className="kb-doc">
              <span className="row-title">
                <strong>{d.title}</strong>
                <span className="row-meta">
                  {t(`kb.cat.${d.category}` as MessageKey)}
                  {d.source ? ` · ${d.source}` : ''}
                </span>
                <span className="row-meta">
                  {t('kb.meta', {
                    chunks: fmt(d.chunks),
                    chars: fmt(d.chars),
                    date: fmtDate(d.updatedAt),
                  })}
                  {d.createdBy ? ` · ${d.createdBy.name}` : ''}
                </span>
              </span>
              <span className="actions">
                <button
                  type="button"
                  onClick={() => {
                    if (open?.id === d.id) setOpen(null);
                    else
                      void api.knowledgeDoc(d.id).then((r) => {
                        setOpen({ id: d.id, content: r.content });
                      });
                  }}
                >
                  {open?.id === d.id ? t('kb.hide') : t('kb.view')}
                </button>
                {canWrite && (
                  <button
                    type="button"
                    aria-label={t('kb.delete')}
                    title={t('kb.delete')}
                    onClick={() => {
                      if (!window.confirm(t('kb.confirmDelete', { title: d.title }))) return;
                      api.deleteKnowledgeDoc(d.id).then(reload, (e: unknown) => {
                        setError(errorText(e));
                      });
                    }}
                  >
                    <Trash2 size={15} aria-hidden />
                  </button>
                )}
              </span>
              {open?.id === d.id && <pre className="kb-content">{open.content}</pre>}
            </li>
          ))}
        </ul>
      )}
      {canWrite ? (
        <AddDoc layer={layer} ownerId={ownerId} onAdded={reload} onError={setError} />
      ) : (
        <p className="muted">{t('kb.readOnly', { who: t(`kb.who.${layer}` as MessageKey) })}</p>
      )}
    </section>
  );
}

const DEFAULT_CATEGORY: Record<KnowledgeLayer, KnowledgeCategory> = {
  general: 'theory',
  organization: 'procedure',
  mine: 'procedure',
  project: 'lesson',
};

function AddDoc(props: {
  layer: KnowledgeLayer;
  ownerId: string | null;
  onAdded: () => void;
  onError: (e: string) => void;
}) {
  const t = useT();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<KnowledgeCategory>(DEFAULT_CATEGORY[props.layer]);
  const [source, setSource] = useState('');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  return (
    <form
      className="form-panel"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        api
          .createKnowledgeDoc({
            layer: props.layer,
            ownerId: props.ownerId,
            category,
            title: title.trim(),
            source: source.trim() || null,
            content,
          })
          .then(
            () => {
              setTitle('');
              setSource('');
              setContent('');
              props.onAdded();
            },
            (err: unknown) => {
              props.onError(errorText(err));
            },
          )
          .finally(() => {
            setBusy(false);
          });
      }}
    >
      <div className="form-grid">
        <label>
          {t('kb.docTitle')}
          <input
            required
            maxLength={200}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
            }}
          />
        </label>
        <label>
          {t('kb.category')}
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as KnowledgeCategory);
            }}
          >
            {KNOWLEDGE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`kb.cat.${c}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('kb.source')}
          <input
            maxLength={500}
            placeholder={t('kb.sourceHint')}
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
            }}
          />
        </label>
      </div>
      <label className="kb-text">
        {t('kb.content')}
        <textarea
          required
          rows={8}
          placeholder={t('kb.contentHint')}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
          }}
        />
      </label>
      <div className="actions">
        <button type="button" onClick={() => file.current?.click()}>
          <FileUp size={15} aria-hidden /> {t('kb.loadFile')}
        </button>
        <input
          ref={file}
          type="file"
          accept=".md,.markdown,.txt,text/plain,text/markdown"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            void f.text().then((text) => {
              setContent(text);
              if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
            });
          }}
        />
        <button className="primary" type="submit" disabled={busy || !title.trim() || !content.trim()}>
          <Plus size={15} aria-hidden /> {t('kb.add')}
        </button>
      </div>
    </form>
  );
}

function Explosives({ orgId }: { orgId: string }) {
  const t = useT();
  const fmt = useFormat();
  const role = useAuth((s) => s.organization?.role ?? null);
  const canWrite = role ? permissions.manageMembers(role) : false;
  const [list, setList] = useState<CompanyExplosive[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState('');

  const reload = useCallback(() => {
    api.companyExplosives(orgId).then(setList, (e: unknown) => {
      setError(errorText(e));
    });
  }, [orgId]);
  useEffect(reload, [reload]);

  // Una sola vez: cada llamada crea ids nuevos y la opción elegida se perdería al redibujar.
  const defaults = useMemo(() => createDefaultLibrary().explosives, []);
  const standard = defaults.filter(
    (e) => !list.some((c) => c.explosive.name.toLowerCase() === e.name.toLowerCase()),
  );

  return (
    <section className="section">
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {list.length === 0 ? (
        <p className="muted">{t('kb.ex.empty')}</p>
      ) : (
        <table className="page-table">
          <thead>
            <tr>
              <th>{t('kb.ex.name')}</th>
              <th>{t('kb.ex.family')}</th>
              <th>{t('kb.ex.density')}</th>
              <th>{t('kb.ex.vod')}</th>
              <th>{t('kb.ex.rws')}</th>
              <th>{t('kb.ex.water')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map(({ explosive: e }) => (
              <tr key={e.id}>
                <td>
                  {e.name}
                  {e.manufacturer ? <span className="row-meta"> · {e.manufacturer}</span> : null}
                </td>
                <td>{e.family}</td>
                <td>{fmt(e.density)}</td>
                <td>{fmt(e.vod)}</td>
                <td>{fmt(e.rws)}</td>
                <td>{t(`kb.ex.water.${e.waterResistance}` as MessageKey)}</td>
                <td>
                  {canWrite && (
                    <button
                      type="button"
                      aria-label={t('kb.delete')}
                      title={t('kb.delete')}
                      onClick={() => {
                        if (!window.confirm(t('kb.confirmDelete', { title: e.name }))) return;
                        api.deleteCompanyExplosive(orgId, e.id).then(reload, (err: unknown) => {
                          setError(errorText(err));
                        });
                      }}
                    >
                      <Trash2 size={15} aria-hidden />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {canWrite ? (
        standard.length > 0 && (
          <form
            className="form-panel"
            onSubmit={(ev) => {
              ev.preventDefault();
              const base = standard.find((e) => e.id === pick);
              if (!base) return;
              api.saveCompanyExplosive(orgId, { ...base, id: newId<'Explosive'>() }).then(
                () => {
                  setPick('');
                  reload();
                },
                (err: unknown) => {
                  setError(errorText(err));
                },
              );
            }}
          >
            <div className="form-grid">
              <label title={t('kb.ex.addStandardHint')}>
                {t('kb.ex.addStandard')}
                <select
                  value={pick}
                  onChange={(e) => {
                    setPick(e.target.value);
                  }}
                >
                  <option value="">{t('kb.choose')}</option>
                  {standard.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="actions">
              <button className="primary" type="submit" disabled={!pick}>
                <Plus size={15} aria-hidden /> {t('kb.ex.add')}
              </button>
            </div>
          </form>
        )
      ) : (
        <p className="muted">{t('kb.ex.adminOnly')}</p>
      )}
    </section>
  );
}
