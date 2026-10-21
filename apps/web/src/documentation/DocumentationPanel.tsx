import { useEffect, useRef, useState } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import { METHOD_TOPICS, topicModels, type MethodModel, type MethodTopic } from '@cronos/core';
import { Formula } from '../components/Formula';
import { useUiStore } from '../stores/uiStore';
import { useLocale, useT, type Locale } from '../i18n';
import { tabAvailable, useWorkflow } from '../hooks/useWorkflow';
import { WORKSPACE_PANELS, openWorkspacePanel } from '../components/WorkspaceWindows';
import { chapters, type Chapter, type Text } from './content';
import { guideChapters, type GuideChapter } from './guide';
import { confidenceKey } from '../methods/confidence';
import { modelAnchor, useDocsNav } from './docsNav';
import './documentation.css';

const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

type Group = 'guide' | 'reference' | 'models';

/** Entrada del índice: una guía de uso, un capítulo de referencia o un tema de modelos. */
type Entry =
  | { group: 'guide'; id: string; title: Text; text: (l: Locale) => string; guide: GuideChapter }
  | { group: 'reference'; id: string; title: Text; text: (l: Locale) => string; chapter: Chapter }
  | {
      group: 'models';
      id: string;
      title: Text;
      text: (l: Locale) => string;
      topic: MethodTopic;
      models: MethodModel[];
    };

const GROUP_TITLE: Record<Group, Text> = {
  guide: { es: 'Funciones del programa', en: 'Program functions' },
  reference: { es: 'Referencia técnica', en: 'Technical reference' },
  models: { es: 'Modelos y fórmulas', en: 'Models and formulas' },
};
const GROUPS: Group[] = ['guide', 'reference', 'models'];

const ENTRIES: Entry[] = [
  ...guideChapters.map((g): Entry => ({
    group: 'guide',
    id: g.id,
    title: g.title,
    guide: g,
    text: (l) =>
      [
        g.title[l],
        g.intro[l],
        ...g.items.flatMap((i) => [i.title[l], i.purpose[l], ...i.steps.map((s) => s[l])]),
      ].join(' '),
  })),
  ...chapters.map((c): Entry => ({
    group: 'reference',
    id: c.id,
    title: c.title,
    chapter: c,
    text: (l) =>
      [
        c.title[l],
        c.intro[l],
        ...c.equations.flatMap((e) => [e.name[l], e.detail[l]]),
        ...c.notes.map((n) => n[l]),
      ].join(' '),
  })),
  ...METHOD_TOPICS.map((topic): Entry => {
    const models = topicModels(topic.id);
    return {
      group: 'models',
      id: `models.${topic.id}`,
      title: topic.title,
      topic,
      models,
      text: (l) =>
        [
          topic.title[l],
          topic.intro[l],
          ...models.flatMap((m) => [
            m.name[l],
            m.authors,
            m.reference,
            m.confidence,
            ...m.rules,
            ...m.variables.map((x) => x.name[l]),
            ...m.assumptions.map((a) => a[l]),
          ]),
        ].join(' '),
    };
  }),
];

export default function DocumentationPanel() {
  const locale = useLocale((s) => s.locale);
  const [initial] = useState(() => useDocsNav.getState().target);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(() => initial?.chapter ?? 'guide.start');
  // Ancla pendiente (modelo pedido desde un «Detalle») y contador para volver a desplazarse.
  const pendingAnchor = useRef<string | null>(initial?.anchor ?? null);
  const [jump, setJump] = useState(0);
  const article = useRef<HTMLElement>(null);
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!useDocsNav.getState().target) search.current?.focus();
    // Consumido: al reabrir la ventana desde la cinta vuelve al inicio.
    useDocsNav.setState({ target: null });
    // «Ver en Documentación» con la ventana ya abierta.
    const off = useDocsNav.subscribe((st) => {
      const goal = st.target;
      if (!goal) return;
      pendingAnchor.current = goal.anchor ?? null;
      setQuery('');
      setSelected(goal.chapter);
      setJump((n) => n + 1);
      useDocsNav.setState({ target: null });
    });
    return () => {
      off();
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  const es = locale === 'es';
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  const matches = ENTRIES.filter((entry) => {
    const text = normalize(entry.text(locale));
    return words.every((word) => text.includes(word));
  });
  const current = matches.find((entry) => entry.id === selected) ?? matches[0];
  const currentId = current?.id;
  useEffect(() => {
    const anchor = pendingAnchor.current;
    if (!anchor) return;
    pendingAnchor.current = null;
    article.current
      ?.closest('.documentation')
      ?.querySelector('.docs-index [aria-current]')
      ?.scrollIntoView({ block: 'nearest' });
    const el = article.current?.querySelector(`#${CSS.escape(anchor)}`);
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ block: 'start' });
      el.focus({ preventScroll: true });
    }
  }, [jump, currentId]);
  function choose(id: string) {
    setSelected(id);
    article.current?.scrollTo({ top: 0 });
  }
  return (
    <div
      className="documentation"
      onKeyDown={(event) => {
        // Reading and selecting formulas must not trigger canvas editing shortcuts.
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          useUiStore.getState().dockPanel('workspace.documentation');
        }
      }}
    >
      <div className="docs-search">
        <Search size={16} aria-hidden="true" />
        <input
          ref={search}
          type="search"
          value={query}
          aria-label={es ? 'Buscar en la documentación' : 'Search documentation'}
          placeholder={
            es
              ? 'Buscar panel, fórmula, autor o regla (FC-24)…'
              : 'Search panel, formula, author or rule (FC-24)…'
          }
          onChange={(event) => {
            setQuery(event.target.value);
            article.current?.scrollTo({ top: 0 });
          }}
        />
        <span role="status">
          {matches.length} / {ENTRIES.length}
        </span>
      </div>
      <div className="docs-layout">
        <nav
          className="docs-index"
          aria-label={es ? 'Temas de documentación' : 'Documentation topics'}
        >
          {GROUPS.map((group) => {
            const items = matches.filter((entry) => entry.group === group);
            if (items.length === 0) return null;
            return (
              <div key={group} className="docs-index-group">
                <span className="docs-index-title">{GROUP_TITLE[group][locale]}</span>
                {items.map((entry) => (
                  <button
                    key={entry.id}
                    aria-current={current?.id === entry.id ? 'page' : undefined}
                    onClick={() => {
                      choose(entry.id);
                    }}
                  >
                    {entry.title[locale]}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="docs-mobile-index">
          <label htmlFor="docs-topic">{es ? 'Tema' : 'Topic'}</label>
          <select
            id="docs-topic"
            value={current?.id ?? ''}
            onChange={(event) => {
              choose(event.target.value);
            }}
          >
            {!current && <option value="">{es ? 'Sin resultados' : 'No results'}</option>}
            {GROUPS.map((group) => {
              const items = matches.filter((entry) => entry.group === group);
              if (items.length === 0) return null;
              return (
                <optgroup key={group} label={GROUP_TITLE[group][locale]}>
                  {items.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.title[locale]}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </div>
        <article
          ref={article}
          className="docs-article"
          aria-labelledby={current ? 'docs-heading' : undefined}
          tabIndex={0}
        >
          {current ? (
            <>
              {current.group === 'guide' && <GuideView guide={current.guide} locale={locale} />}
              {current.group === 'reference' && (
                <ReferenceView chapter={current.chapter} locale={locale} />
              )}
              {current.group === 'models' && (
                <ModelsView topic={current.topic} models={current.models} locale={locale} />
              )}
              <footer className="docs-footer">
                {es
                  ? 'Referencia de los modelos implementados en Cronos. Los coeficientes de sitio se ajustan en las herramientas del proyecto. Las reglas (FC-*, GE-*, VS-*, UG-*) están en docs/RULES.md con su estado y fuente.'
                  : 'Reference for models implemented in Cronos. Site coefficients are adjusted in the project tools. Rules (FC-*, GE-*, VS-*, UG-*) are listed in docs/RULES.md with their status and source.'}
              </footer>
            </>
          ) : (
            <div className="docs-empty">
              <h1>{es ? 'No se encontraron temas' : 'No topics found'}</h1>
              <p>
                {es
                  ? 'Prueba con burden, SDOB, carga, PPV, Holmberg o fragmentación.'
                  : 'Try burden, SDOB, charge, PPV, Holmberg or fragmentation.'}
              </p>
              <button
                onClick={() => {
                  setQuery('');
                }}
              >
                {es ? 'Mostrar todos los temas' : 'Show all topics'}
              </button>
            </div>
          )}
        </article>
      </div>
    </div>
  );
}

/** Botones «Ajustar en…» que abren la herramienta real del proyecto. */
function AdjustButtons({ panels }: { panels: readonly string[] }) {
  const t = useT();
  const workflow = useWorkflow();
  const es = useLocale((s) => s.locale) === 'es';
  if (panels.length === 0) return null;
  return (
    <div className="docs-adjustments">
      {panels.map((id) => {
        const panel =
          id === 'view'
            ? { label: 'sidebar.viewTitle' as const, requires: null }
            : WORKSPACE_PANELS.find((item) => item.id === id);
        if (!panel) return null;
        const available = tabAvailable(panel.requires, workflow);
        return (
          <button
            key={id}
            disabled={!available}
            title={
              available
                ? id === 'view'
                  ? es
                    ? 'Abrir Vista en el panel derecho'
                    : 'Open View in the right panel'
                  : t('workspace.openWindow')
                : t(panel.requires === 'charged' ? 'tabs.needCharge' : 'tabs.needHoles')
            }
            onClick={() => {
              if (id === 'view') {
                const ui = useUiStore.getState();
                ui.setSidebarCollapsed(false);
                ui.setRightTab('view');
              } else openWorkspacePanel(id);
            }}
          >
            <SlidersHorizontal size={14} aria-hidden="true" />
            {es ? 'Ajustar en' : 'Adjust in'} {t(panel.label)}
          </button>
        );
      })}
    </div>
  );
}

function ReferenceView({ chapter, locale }: { chapter: Chapter; locale: Locale }) {
  const es = locale === 'es';
  return (
    <>
      <header className="docs-chapter-header">
        <h1 id="docs-heading">{chapter.title[locale]}</h1>
        <p>{chapter.intro[locale]}</p>
        <AdjustButtons panels={chapter.panels} />
      </header>
      {chapter.equations.map((equation) => (
        <section className="docs-equation" key={equation.name.en}>
          <h2>{equation.name[locale]}</h2>
          <Formula tex={equation.tex} label={equation.name[locale]} />
          <p>{equation.detail[locale]}</p>
        </section>
      ))}
      {chapter.notes.length > 0 && (
        <section className="docs-notes">
          <h2>{es ? 'Criterios de interpretación' : 'Interpretation notes'}</h2>
          {chapter.notes.map((note) => (
            <p key={note.en}>{note[locale]}</p>
          ))}
        </section>
      )}
    </>
  );
}

function GuideView({ guide, locale }: { guide: GuideChapter; locale: Locale }) {
  const es = locale === 'es';
  return (
    <>
      <header className="docs-chapter-header">
        <h1 id="docs-heading">{guide.title[locale]}</h1>
        <p>{guide.intro[locale]}</p>
      </header>
      {guide.items.map((item) => (
        <section className="docs-guide-item" key={item.title.en}>
          <h2>{item.title[locale]}</h2>
          <p>{item.purpose[locale]}</p>
          <h3>{es ? 'Pasos típicos' : 'Typical steps'}</h3>
          <ol>
            {item.steps.map((step) => (
              <li key={step.en}>{step[locale]}</li>
            ))}
          </ol>
          {item.panel && <AdjustButtons panels={[item.panel]} />}
        </section>
      ))}
    </>
  );
}

function ModelsView({
  topic,
  models,
  locale,
}: {
  topic: MethodTopic;
  models: readonly MethodModel[];
  locale: Locale;
}) {
  const t = useT();
  const es = locale === 'es';
  const status = (m: MethodModel) =>
    m.status === 'planned'
      ? es
        ? 'Próximamente'
        : 'Coming soon'
      : m.status === 'visual'
        ? es
          ? 'Solo visual'
          : 'Visual only'
        : null;
  return (
    <>
      <header className="docs-chapter-header">
        <h1 id="docs-heading">{topic.title[locale]}</h1>
        <p>{topic.intro[locale]}</p>
        <p className="docs-model-hint">
          {es
            ? 'Esta ficha es la misma que muestra el botón «Detalle» en cada panel: allí se ven además los valores que usa el cálculo abierto.'
            : 'This entry is the same one shown by the «Details» button in each panel, which also shows the values used by the open calculation.'}
        </p>
      </header>
      {models.map((m) => (
        <section className="docs-model" key={m.id} id={modelAnchor(m.id)} tabIndex={-1}>
          <h2>
            {m.name[locale]}
            {status(m) && <span className="docs-model-status">{status(m)}</span>}
          </h2>
          <dl className="docs-model-meta">
            <div>
              <dt>{es ? 'Autor y año' : 'Author and year'}</dt>
              <dd>{m.authors}</dd>
            </div>
            <div>
              <dt>{es ? 'Referencia' : 'Reference'}</dt>
              <dd>{m.reference}</dd>
            </div>
            <div>
              <dt>{es ? 'Respaldo' : 'Backing'}</dt>
              <dd title={m.confidence}>{t(confidenceKey(m.confidence))}</dd>
            </div>
            <div>
              <dt>{es ? 'Reglas' : 'Rules'}</dt>
              <dd>{m.rules.join(' · ')}</dd>
            </div>
            <div>
              <dt>{es ? 'Dónde' : 'Where'}</dt>
              <dd>{m.where[locale]}</dd>
            </div>
          </dl>
          {m.formulas.map((f, i) => (
            <Formula key={f} tex={f} label={`${m.name[locale]} (${String(i + 1)})`} />
          ))}
          {m.variables.length > 0 && (
            <table className="docs-model-vars">
              <thead>
                <tr>
                  <th scope="col">{es ? 'Símbolo' : 'Symbol'}</th>
                  <th scope="col">{es ? 'Significado' : 'Meaning'}</th>
                  <th scope="col">{es ? 'Unidad' : 'Unit'}</th>
                </tr>
              </thead>
              <tbody>
                {m.variables.map((x) => (
                  <tr key={x.key}>
                    <td>
                      <Formula
                        tex={x.tex}
                        label={x.key}
                        className="docs-model-symbol"
                        display={false}
                      />
                    </td>
                    <td>
                      {x.output ? '→ ' : ''}
                      {x.name[locale]}
                    </td>
                    <td>{x.unit || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <h3>{es ? 'Supuestos y limitaciones' : 'Assumptions and limitations'}</h3>
          <ul>
            {m.assumptions.map((a) => (
              <li key={a.en}>{a[locale]}</li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
