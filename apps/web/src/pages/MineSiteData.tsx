import type { MinePerimeter, MineSurvey } from '@cronos/api';
import { Layers, Shapes } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { formatDay, useFormat, useFormatDate, useT } from '../i18n';
import { projectPath } from '../product/product';
import type { ProjectKind } from '@cronos/core';

/** Filas que se ven antes de «Ver todos». */
const FOLD = 6;

/** Valor del filtro de perímetros que elige los dibujados sin topografía. */
const NO_TOPO = '-';

/**
 * Datos compartidos de la mina, cada uno con su historial: topografías (levantamientos) y
 * perímetros de todos los proyectos. Un perímetro es un contorno en planta: no queda atado a una
 * topografía, pero se muestra sobre cuál se dibujó para avisar si una más nueva cubre esa zona.
 */
export function MineSiteData({
  surveys,
  perimeters,
  tool,
}: {
  surveys: MineSurvey[];
  perimeters: MinePerimeter[] | null;
  tool: ProjectKind;
}) {
  const latestSurvey = surveys[0]?.survey.id ?? null;
  return (
    <div className="site-data">
      <SurveyHistory surveys={surveys} perimeters={perimeters ?? []} latest={latestSurvey} />
      <PerimeterHistory surveys={surveys} perimeters={perimeters} tool={tool} />
    </div>
  );
}

/** Tarjeta con título, ayuda y una lista que se pliega a las primeras filas. */
function SiteCard({
  id,
  icon,
  title,
  hint,
  tools,
  count,
  children,
}: {
  id: string;
  icon: ReactNode;
  title: string;
  hint: string;
  tools?: ReactNode;
  count: number;
  children: (limit: number) => ReactNode;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <section className="site-card" aria-labelledby={id}>
      <header className="site-card-head">
        <span className="site-card-icon" aria-hidden>
          {icon}
        </span>
        <div>
          <h2 id={id}>
            {title} <span className="site-card-count">{count}</span>
          </h2>
          <p className="muted">{hint}</p>
        </div>
      </header>
      {tools}
      {children(open ? Infinity : FOLD)}
      {count > FOLD && (
        <button
          type="button"
          className="link-button site-card-more"
          onClick={() => {
            setOpen((o) => !o);
          }}
        >
          {open ? t('topo.mine.showLess') : t('topo.mine.showAll', { n: count })}
        </button>
      )}
    </section>
  );
}

function SurveyHistory({
  surveys,
  perimeters,
  latest,
}: {
  surveys: MineSurvey[];
  perimeters: MinePerimeter[];
  latest: string | null;
}) {
  const t = useT();
  const fmt = useFormat();
  const fmtDate = useFormatDate();
  const drawn = new Map<string, number>();
  for (const p of perimeters)
    if (p.topography) drawn.set(p.topography.id, (drawn.get(p.topography.id) ?? 0) + 1);
  return (
    <SiteCard
      id="surveys-title"
      icon={<Layers size={18} />}
      title={t('topo.mine.surveysTitle')}
      hint={t('topo.mine.surveysHint')}
      count={surveys.length}
    >
      {(limit) =>
        surveys.length === 0 ? (
          <p className="muted site-empty">{t('topo.mine.empty')}</p>
        ) : (
          <ol className="site-list">
            {surveys.slice(0, limit).map(({ survey: s, createdAt, createdBy }) => {
              const n = drawn.get(s.id) ?? 0;
              return (
                <li key={s.id} className="site-item">
                  <span className="site-date">{formatDay(s.surveyDate)}</span>
                  <div className="site-body">
                    <span className="site-title">
                      <strong>{s.name}</strong>
                      {s.id === latest && <span className="site-tag">{t('topo.mine.latest')}</span>}
                    </span>
                    <span className="site-meta">
                      {t(`topo.format.${s.source.format}`)} ·{' '}
                      {t('topo.panel.stats', {
                        points: fmt(s.stats.points),
                        triangles: fmt(s.stats.triangles),
                        lines: fmt(s.stats.lines),
                      })}
                    </span>
                    <span className="site-meta">
                      {t('topo.mine.uploaded', {
                        date: fmtDate(createdAt),
                        author: createdBy?.name ?? '—',
                      })}
                      {n > 0 &&
                        ` · ${n === 1 ? t('topo.mine.perimetersOnOne') : t('topo.mine.perimetersOn', { n })}`}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        )
      }
    </SiteCard>
  );
}

function PerimeterHistory({
  surveys,
  perimeters,
  tool,
}: {
  surveys: MineSurvey[];
  perimeters: MinePerimeter[] | null;
  tool: ProjectKind;
}) {
  const t = useT();
  const fmt = useFormat();
  const fmtDate = useFormatDate();
  const [filter, setFilter] = useState('');
  const shown = (perimeters ?? []).filter((p) =>
    filter === '' ? true : filter === NO_TOPO ? !p.topography : p.topography?.id === filter,
  );
  const usedSurveys = surveys.filter((s) =>
    (perimeters ?? []).some((p) => p.topography?.id === s.survey.id),
  );
  const anyWithout = (perimeters ?? []).some((p) => !p.topography);
  const showFilter = usedSurveys.length + (anyWithout ? 1 : 0) > 1;
  return (
    <SiteCard
      id="perimeters-title"
      icon={<Shapes size={18} />}
      title={t('topo.mine.perimetersTitle')}
      hint={t('topo.mine.perimetersHint')}
      count={shown.length}
      tools={
        showFilter && (
          <select
            className="site-filter"
            aria-label={t('topo.mine.filterLabel')}
            title={t('topo.mine.filterLabel')}
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
            }}
          >
            <option value="">{t('topo.mine.filterAll')}</option>
            {usedSurveys.map(({ survey: s }) => (
              <option key={s.id} value={s.id}>
                {s.name} · {formatDay(s.surveyDate)}
              </option>
            ))}
            {anyWithout && <option value={NO_TOPO}>{t('topo.mine.filterNone')}</option>}
          </select>
        )
      }
    >
      {(limit) =>
        perimeters === null ? (
          <p className="muted site-empty">{t('topo.mine.loading')}</p>
        ) : shown.length === 0 ? (
          <p className="muted site-empty">{t('topo.mine.perimetersEmpty')}</p>
        ) : (
          <ol className="site-list">
            {shown.slice(0, limit).map((p) => {
              const newer = newerSurveyOver(p, surveys);
              return (
                <li key={`${p.project.id}:${p.id}`} className="site-item">
                  <Outline points={p.outline} />
                  <div className="site-body">
                    <span className="site-title">
                      <strong>{p.name}</strong>
                      <span className="site-meta">
                        {t('topo.mine.area', { area: fmt(p.area) })}
                        {p.floorElevation !== null &&
                          ` · ${t('topo.mine.floor', { z: fmt(p.floorElevation, 1) })}`}
                      </span>
                    </span>
                    <span className="site-meta">
                      {t('topo.mine.inProject')}{' '}
                      <Link
                        className="site-project"
                        to={projectPath(p.project.id, p.project.kind, tool)}
                      >
                        {p.project.name}
                      </Link>{' '}
                      <span className="version-tag">v{p.version}</span>
                    </span>
                    <span
                      className={newer ? 'site-meta site-warn' : 'site-meta'}
                      title={
                        newer
                          ? t('topo.mine.olderSurvey', {
                              name: newer.name,
                              date: formatDay(newer.surveyDate),
                            })
                          : undefined
                      }
                    >
                      {p.topography
                        ? t('topo.mine.drawnOn', {
                            name: p.topography.name,
                            date: formatDay(p.topography.surveyDate),
                          })
                        : t('topo.mine.drawnOnNone')}
                      {newer && ` · ${t('topo.mine.olderShort')}`}
                    </span>
                    <span className="site-meta">
                      {t('projects.by', { date: fmtDate(p.updatedAt), author: p.authorName })}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        )
      }
    </SiteCard>
  );
}

/** Formatos que no son superficie del terreno (no cambian la cota de un perímetro). */
const NOT_GROUND = new Set(['workings', 'blockmodel']);

/**
 * La topografía más nueva que la del perímetro y que cubre su centro: el terreno pudo cambiar ahí
 * (avance del minado). Una más nueva en otra zona de la mina no cuenta.
 */
function newerSurveyOver(p: MinePerimeter, surveys: MineSurvey[]) {
  if (!p.topography || p.outline.length === 0) return null;
  const xs = p.outline.map((v) => v[0]);
  const ys = p.outline.map((v) => v[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const since = p.topography.surveyDate;
  const found = surveys.find(
    ({ survey: s }) =>
      s.id !== p.topography?.id &&
      s.surveyDate > since &&
      !NOT_GROUND.has(s.source.format) &&
      cx >= s.bounds.minX &&
      cx <= s.bounds.maxX &&
      cy >= s.bounds.minY &&
      cy <= s.bounds.maxY,
  );
  return found?.survey ?? null;
}

/** Miniatura del contorno en planta (norte arriba). */
function Outline({ points }: { points: [number, number][] }) {
  const size = 44;
  const pad = 4;
  if (points.length < 3) return <span className="site-outline" aria-hidden />;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxY = Math.max(...ys);
  const span = Math.max(Math.max(...xs) - minX, maxY - Math.min(...ys), 1e-6);
  const k = (size - 2 * pad) / span;
  const d = points
    .map(
      ([x, y], i) =>
        `${i === 0 ? 'M' : 'L'}${(pad + (x - minX) * k).toFixed(1)} ${(pad + (maxY - y) * k).toFixed(1)}`,
    )
    .join(' ');
  return (
    <svg className="site-outline" viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <path d={`${d} Z`} />
    </svg>
  );
}
