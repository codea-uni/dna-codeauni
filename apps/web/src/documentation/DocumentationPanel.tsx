import { memo, useEffect, useRef, useState } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { useUiStore } from '../stores/uiStore';
import { useLocale, useT } from '../i18n';
import { tabAvailable, useWorkflow } from '../hooks/useWorkflow';
import { WORKSPACE_PANELS, openWorkspacePanel } from '../components/WorkspaceWindows';
import { chapters } from './content';
import './documentation.css';

const Formula = memo(function Formula({ tex, label }: { tex: string; label: string }) {
  // Only the bundled reference content is rendered. MathML accompanies the visual formula.
  const html = katex.renderToString(tex, {
    displayMode: true,
    output: 'htmlAndMathml',
    trust: false,
    strict: 'error',
    throwOnError: true,
  });
  return (
    <div
      className="docs-formula"
      role="group"
      aria-label={label}
      tabIndex={0}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export default function DocumentationPanel() {
  const locale = useLocale((s) => s.locale);
  const t = useT();
  const workflow = useWorkflow();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('conventions');
  const article = useRef<HTMLElement>(null);
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    search.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  const es = locale === 'es';
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  const matches = chapters.filter((chapter) => {
    const text = normalize(
      [
        chapter.title[locale],
        chapter.intro[locale],
        ...chapter.equations.flatMap((equation) => [
          equation.name[locale],
          equation.detail[locale],
        ]),
        ...chapter.notes.map((note) => note[locale]),
      ].join(' '),
    );
    return words.every((word) => text.includes(word));
  });
  const current = matches.find((chapter) => chapter.id === selected) ?? matches[0];
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
            es ? 'Buscar fórmula, variable o tema…' : 'Search formula, variable or topic…'
          }
          onChange={(event) => {
            setQuery(event.target.value);
            article.current?.scrollTo({ top: 0 });
          }}
        />
        <span role="status">
          {matches.length} / {chapters.length}
        </span>
      </div>
      <div className="docs-layout">
        <nav
          className="docs-index"
          aria-label={es ? 'Temas de documentación' : 'Documentation topics'}
        >
          <span className="docs-index-title">
            {es ? 'Referencia técnica' : 'Technical reference'}
          </span>
          {matches.map((chapter) => (
            <button
              key={chapter.id}
              aria-current={current?.id === chapter.id ? 'page' : undefined}
              onClick={() => {
                choose(chapter.id);
              }}
            >
              {chapter.title[locale]}
            </button>
          ))}
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
            {matches.map((chapter) => (
              <option key={chapter.id} value={chapter.id}>
                {chapter.title[locale]}
              </option>
            ))}
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
              <header className="docs-chapter-header">
                <h1 id="docs-heading">{current.title[locale]}</h1>
                <p>{current.intro[locale]}</p>
                <div className="docs-adjustments">
                  {current.panels.map((id) => {
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
              </header>
              {current.equations.map((equation) => (
                <section className="docs-equation" key={equation.name.en}>
                  <h2>{equation.name[locale]}</h2>
                  <Formula tex={equation.tex} label={equation.name[locale]} />
                  <p>{equation.detail[locale]}</p>
                </section>
              ))}
              {current.notes.length > 0 && (
                <section className="docs-notes">
                  <h2>{es ? 'Criterios de interpretación' : 'Interpretation notes'}</h2>
                  {current.notes.map((note) => (
                    <p key={note.en}>{note[locale]}</p>
                  ))}
                </section>
              )}
              <footer className="docs-footer">
                {es
                  ? 'Referencia de los modelos implementados en Kronos. Los coeficientes de sitio se ajustan en las herramientas del proyecto.'
                  : 'Reference for models implemented in Kronos. Site coefficients are adjusted in the project tools.'}
              </footer>
            </>
          ) : (
            <div className="docs-empty">
              <h1>{es ? 'No se encontraron temas' : 'No topics found'}</h1>
              <p>
                {es
                  ? 'Prueba con burden, SDOB, carga, PPV o fragmentación.'
                  : 'Try burden, SDOB, charge, PPV or fragmentation.'}
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
