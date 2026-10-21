import {
  moveBelowGround,
  moveCentroidTo,
  movePoint,
  WORKING_KINDS,
  workingAxisPoints,
  axisLength,
  type CloudSurfaceOptions,
  type SurveyMove,
  type TopographySurvey,
  type Vec3,
  type WorkingKind,
} from '@cronos/core';
import { FileDown, Move3d, Waypoints } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { NumberField } from '../components/NumberField';
import { useProject } from '../hooks/useDocument';
import { formatDay, useFormat, useT } from '../i18n';
import { useUiStore } from '../stores/uiStore';
import {
  isTopographyLoaded,
  isWorkingKindHidden,
  loadedParts,
  setMovePreview,
  setWorkingKindHidden,
  surveyElevation,
  surveyWorkingDips,
  surveyWorkingKinds,
  topographyTin,
  WORKING_KIND_COLORS,
} from '../topography/session';
import {
  cloudToSurveySurface,
  exportSurveyDxf,
  frameMove,
  movePreviewMesh,
  moveSurvey,
  setWorkingKinds,
  surveyCentroid,
} from '../topography/surveyEdit';
import { clearKindsReview, needsKindsReview } from '../topography/workings';

/**
 * Herramientas de un levantamiento ya importado: moverlo o girarlo (también «bajar bajo la
 * topografía»), convertir una nube en superficie TIN, exportar a DXF y, en las labores, el tipo de
 * cada una (galería, rampa, tajeo…) con su leyenda y filtro en 3D.
 */
export function SurveyTools({ survey }: { survey: TopographySurvey }) {
  const t = useT();
  const [open, setOpen] = useState<'move' | 'surface' | null>(null);
  if (!isTopographyLoaded(survey.id)) return null;
  const a = survey.assets;
  const canMove = !!(a.tin ?? a.cloud ?? a.blocks ?? a.workings ?? a.lines);
  return (
    <>
      <div className="survey-actions">
        {canMove && (
          <button
            className={`small${open === 'move' ? ' active' : ''}`}
            aria-expanded={open === 'move'}
            onClick={() => {
              setOpen(open === 'move' ? null : 'move');
            }}
          >
            <Move3d size={14} aria-hidden />
            {t('topo.xform.open')}
          </button>
        )}
        {a.cloud && (
          <button
            className={`small${open === 'surface' ? ' active' : ''}`}
            aria-expanded={open === 'surface'}
            onClick={() => {
              setOpen(open === 'surface' ? null : 'surface');
            }}
          >
            <Waypoints size={14} aria-hidden />
            {t('topo.surface.open')}
          </button>
        )}
        {(a.tin ?? a.workings) && (
          <button
            className="small"
            title={t('topo.dxf.title')}
            onClick={() => {
              void exportSurveyDxf(survey);
            }}
          >
            <FileDown size={14} aria-hidden />
            {t('topo.dxf.export')}
          </button>
        )}
      </div>
      {survey.transforms && survey.transforms.length > 0 && (
        <div className="muted small">
          {t('topo.xform.history', {
            n: survey.transforms.length,
            date: formatDay(
              survey.transforms[survey.transforms.length - 1]?.date.slice(0, 10) ?? '',
            ),
          })}
        </div>
      )}
      {open === 'move' && (
        <SurveyMoveForm
          survey={survey}
          onClose={() => {
            setOpen(null);
          }}
        />
      )}
      {open === 'surface' && (
        <CloudSurfaceForm
          survey={survey}
          onClose={() => {
            setOpen(null);
          }}
        />
      )}
      {a.workings && <WorkingKindsList survey={survey} />}
    </>
  );
}

// ------------------------------------------------------------------ Mover / rotar

type MoveMode = 'vector' | 'to' | 'below';

/** Vértice del TIN más cercano en planta a (x, y): un punto seguro sobre el terreno. */
function nearestTinPoint(surveyId: string, x: number, y: number): { x: number; y: number } | null {
  const tin = topographyTin(surveyId);
  if (!tin) return null;
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (let i = 0; i + 2 < tin.vertices.length; i += 3) {
    const vx = tin.vertices[i] ?? 0;
    const vy = tin.vertices[i + 1] ?? 0;
    const d = (vx - x) ** 2 + (vy - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = { x: vx, y: vy };
    }
  }
  return best;
}

function SurveyMoveForm({ survey, onClose }: { survey: TopographySurvey; onClose: () => void }) {
  const t = useT();
  const fmt = useFormat();
  const project = useProject();
  const centroid = useMemo(() => surveyCentroid(survey.id), [survey.id]);
  const grounds = project.topography.filter(
    (s) => s.id !== survey.id && s.assets.tin && isTopographyLoaded(s.id),
  );
  const benchTin = project.blasts[0]?.bench.topographyId;
  const [mode, setMode] = useState<MoveMode>(grounds.length > 0 ? 'below' : 'vector');
  const [vector, setVector] = useState<Vec3>({ x: 0, y: 0, z: 0 });
  const [target, setTarget] = useState<Vec3>(
    centroid ? { x: round(centroid.x), y: round(centroid.y), z: round(centroid.z) } : vector,
  );
  const [groundId, setGroundId] = useState<string>(
    grounds.find((s) => s.id === benchTin)?.id ?? grounds[0]?.id ?? '',
  );
  const [depth, setDepth] = useState(250);
  const groundAtCentroid =
    centroid && groundId ? surveyElevation(groundId, centroid.x, centroid.y) : null;
  // Si las labores no caen sobre la topografía en planta, se centran sobre ella.
  const [center, setCenter] = useState(groundAtCentroid === null);
  const [rotation, setRotation] = useState(0);
  const [busy, setBusy] = useState(false);

  const move: SurveyMove | null = useMemo(() => {
    if (!centroid) return null;
    const pivot = { x: centroid.x, y: centroid.y };
    if (mode === 'vector')
      return { dx: vector.x, dy: vector.y, dz: vector.z, rotationDeg: rotation, pivot };
    if (mode === 'to') return moveCentroidTo(centroid, target, rotation);
    if (!groundId) return null;
    const g = topographyTin(groundId) ? project.topography.find((s) => s.id === groundId) : null;
    let at: { x: number; y: number } | undefined;
    if (center && g) {
      const cx = (g.bounds.minX + g.bounds.maxX) / 2;
      const cy = (g.bounds.minY + g.bounds.maxY) / 2;
      at =
        surveyElevation(groundId, cx, cy) !== null
          ? { x: cx, y: cy }
          : (nearestTinPoint(groundId, cx, cy) ?? undefined);
    }
    return moveBelowGround(centroid, depth, (x, y) => surveyElevation(groundId, x, y), {
      ...(at ? { at } : {}),
      rotationDeg: rotation,
    });
  }, [centroid, mode, vector, target, groundId, depth, center, rotation, project.topography]);

  const after = centroid && move ? movePoint(centroid, move) : null;
  const groundAfter = after && groundId ? surveyElevation(groundId, after.x, after.y) : null;

  // Vista previa en 3D (amarillo) mientras el formulario está abierto.
  useEffect(() => {
    setMovePreview(move ? movePreviewMesh(survey, move) : null);
  }, [move, survey]);
  useEffect(
    () => () => {
      setMovePreview(null);
    },
    [],
  );

  if (!centroid) return <p className="hint">{t('topo.panel.missing')}</p>;

  const apply = async () => {
    if (!move) return;
    setBusy(true);
    try {
      const next = await moveSurvey(survey, move);
      if (next) {
        useUiStore.getState().notify(
          t('topo.xform.done', {
            name: survey.name,
            dx: fmt(move.dx, 1),
            dy: fmt(move.dy, 1),
            dz: fmt(move.dz, 1),
            rot: fmt(move.rotationDeg, 1),
          }),
        );
        if (after) frameMove(survey, centroid, after);
        onClose();
      }
    } finally {
      setBusy(false);
    }
  };

  const xyz = (p: Vec3) => t('topo.xform.xyz', { x: fmt(p.x, 1), y: fmt(p.y, 1), z: fmt(p.z, 1) });

  return (
    <div className="survey-tool">
      <p className="hint">{t('topo.xform.intro')}</p>
      <div className="muted small">
        {t('topo.xform.centroid')} {xyz(centroid)}
      </div>
      <div className="survey-modes" role="radiogroup" aria-label={t('topo.xform.mode')}>
        {(['vector', 'to', 'below'] as const).map((m) => (
          <button
            key={m}
            role="radio"
            aria-checked={mode === m}
            className={mode === m ? 'active' : undefined}
            disabled={m === 'below' && grounds.length === 0}
            title={m === 'below' && grounds.length === 0 ? t('topo.xform.noGround') : undefined}
            onClick={() => {
              setMode(m);
            }}
          >
            {t(`topo.xform.mode.${m}`)}
          </button>
        ))}
      </div>
      {mode === 'vector' && (
        <>
          <NumberField
            label={t('topo.xform.dx')}
            unit="m"
            decimals={2}
            value={vector.x}
            onCommit={(v) => {
              setVector({ ...vector, x: v });
            }}
          />
          <NumberField
            label={t('topo.xform.dy')}
            unit="m"
            decimals={2}
            value={vector.y}
            onCommit={(v) => {
              setVector({ ...vector, y: v });
            }}
          />
          <NumberField
            label={t('topo.xform.dz')}
            unit="m"
            decimals={2}
            value={vector.z}
            onCommit={(v) => {
              setVector({ ...vector, z: v });
            }}
          />
        </>
      )}
      {mode === 'to' && (
        <>
          <NumberField
            label={t('topo.xform.toX')}
            unit="m"
            decimals={2}
            value={target.x}
            onCommit={(v) => {
              setTarget({ ...target, x: v });
            }}
          />
          <NumberField
            label={t('topo.xform.toY')}
            unit="m"
            decimals={2}
            value={target.y}
            onCommit={(v) => {
              setTarget({ ...target, y: v });
            }}
          />
          <NumberField
            label={t('topo.xform.toZ')}
            unit="m"
            decimals={2}
            value={target.z}
            onCommit={(v) => {
              setTarget({ ...target, z: v });
            }}
          />
        </>
      )}
      {mode === 'below' && (
        <>
          <label className="field">
            <span className="field-label">{t('topo.xform.ground')}</span>
            <select
              value={groundId}
              onChange={(e) => {
                setGroundId(e.target.value);
              }}
            >
              {grounds.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          <NumberField
            label={t('topo.xform.depth')}
            unit="m"
            decimals={1}
            min={0}
            value={depth}
            onCommit={setDepth}
          />
          <label className="check small">
            <input
              type="checkbox"
              checked={center}
              onChange={(e) => {
                setCenter(e.target.checked);
              }}
            />
            {t('topo.xform.centerOnGround')}
          </label>
          {groundAtCentroid === null && !center && (
            <div className="warn small">{t('topo.xform.outside')}</div>
          )}
        </>
      )}
      <NumberField
        label={t('topo.xform.rotation')}
        unit="°"
        decimals={2}
        min={-360}
        max={360}
        value={rotation}
        onCommit={setRotation}
      />
      {after && move ? (
        <div className="survey-xform-result small">
          <div>
            <span className="muted">{t('topo.xform.newCentroid')}</span> {xyz(after)}
          </div>
          <div>
            <span className="muted">{t('topo.xform.offset')}</span>{' '}
            {t('topo.xform.offsetValue', {
              dx: fmt(move.dx, 1),
              dy: fmt(move.dy, 1),
              dz: fmt(move.dz, 1),
              d: fmt(Math.hypot(move.dx, move.dy, move.dz), 1),
            })}
            {move.rotationDeg !== 0 &&
              ` · ${t('topo.xform.rotValue', { deg: fmt(move.rotationDeg, 1) })}`}
          </div>
          {groundAfter !== null && (
            <div>
              <span className="muted">{t('topo.xform.groundAbove')}</span>{' '}
              {t('topo.xform.groundValue', {
                z: fmt(groundAfter, 1),
                depth: fmt(groundAfter - after.z, 1),
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="warn small">{t('topo.xform.outside')}</div>
      )}
      <div className="survey-tool-actions">
        <button
          className="small"
          disabled={!after}
          onClick={() => {
            if (after) frameMove(survey, centroid, after);
          }}
        >
          {t('topo.xform.view3d')}
        </button>
        <button className="small" onClick={onClose}>
          {t('topo.workings.cancel')}
        </button>
        <button
          className="small survey-apply"
          disabled={!move || busy}
          onClick={() => {
            void apply();
          }}
        >
          {busy ? t('topo.xform.applying') : t('topo.xform.apply')}
        </button>
      </div>
    </div>
  );
}

const round = (v: number) => Math.round(v * 100) / 100;

// ------------------------------------------------------------------ Nube → superficie

function CloudSurfaceForm({ survey, onClose }: { survey: TopographySurvey; onClose: () => void }) {
  const t = useT();
  const fmt = useFormat();
  const project = useProject();
  const [options, setOptions] = useState<CloudSurfaceOptions>({
    cell: 2,
    mode: 'min',
    trim: 'mask',
  });
  const [busy, setBusy] = useState(false);
  const points = loadedParts(survey.id)?.cloud?.positions.length ?? 0;
  const run = async () => {
    setBusy(true);
    const ui = useUiStore.getState();
    ui.notify(t('topo.surface.working', { name: survey.name }));
    try {
      const r = await cloudToSurveySurface(survey, options);
      if (!r) return;
      ui.notify(
        t('topo.surface.done', {
          name: r.survey.name,
          triangles: fmt(r.survey.stats.triangles),
          cell: fmt(r.cell, 1),
        }),
      );
      if (r.overhangRatio > 0.75)
        ui.notify(t('topo.surface.overhang', { pct: fmt(r.overhangRatio * 100, 0) }), 'error');
      onClose();
    } catch (err) {
      ui.notify(
        t('topo.surface.failed', { error: err instanceof Error ? err.message : String(err) }),
        'error',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="survey-tool">
      <p className="hint">{t('topo.surface.intro', { n: fmt(points / 3) })}</p>
      {project.kind === 'underground' && (
        <div className="warn small">{t('topo.surface.tunnelWarning')}</div>
      )}
      <NumberField
        label={t('topo.surface.cell')}
        unit="m"
        decimals={2}
        min={0.1}
        max={50}
        value={options.cell}
        onCommit={(cell) => {
          setOptions({ ...options, cell });
        }}
      />
      <label className="field">
        <span className="field-label">{t('topo.surface.modeLabel')}</span>
        <select
          value={options.mode}
          onChange={(e) => {
            const mode = (['min', 'mean', 'max'] as const).find((m) => m === e.target.value);
            if (mode) setOptions({ ...options, mode });
          }}
        >
          {(['min', 'mean', 'max'] as const).map((m) => (
            <option key={m} value={m}>
              {t(`topo.surface.mode.${m}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">{t('topo.surface.trimLabel')}</span>
        <select
          value={options.trim}
          onChange={(e) => {
            setOptions({ ...options, trim: e.target.value === 'convex' ? 'convex' : 'mask' });
          }}
        >
          <option value="mask">{t('topo.surface.trim.mask')}</option>
          <option value="convex">{t('topo.surface.trim.convex')}</option>
        </select>
      </label>
      <p className="hint">{t(`topo.surface.modeHint.${options.mode}`)}</p>
      <div className="survey-tool-actions">
        <button className="small" onClick={onClose}>
          {t('topo.workings.cancel')}
        </button>
        <button
          className="small survey-apply"
          disabled={busy}
          onClick={() => {
            void run();
          }}
        >
          {busy ? t('topo.surface.busy') : t('topo.surface.run')}
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Tipo de cada labor

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** Rumbo en 8 puntos (N, NE, E…) de un azimut en radianes. */
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
const compass = (az: number) => COMPASS[Math.round(((az * 180) / Math.PI / 45 + 8) % 8) % 8] ?? 'N';

function WorkingKindsList({ survey }: { survey: TopographySurvey }) {
  const t = useT();
  const fmt = useFormat();
  const [open, setOpen] = useState(() => needsKindsReview(survey.id));
  const [filter, setFilter] = useState('');
  const [, setHiddenVersion] = useState(0);
  const kinds = surveyWorkingKinds(survey.id);
  const dips = surveyWorkingDips(survey.id);
  const workings = loadedParts(survey.id)?.workings;
  const rows = useMemo(
    () =>
      workings
        ? workings.axes.map((a, i) => ({
            i,
            name: a.name,
            length: axisLength(workingAxisPoints(workings, i)),
          }))
        : [],
    [workings],
  );
  if (!workings || kinds.length === 0) return null;
  const counts = new Map<WorkingKind, number>();
  for (const k of kinds) counts.set(k, (counts.get(k) ?? 0) + 1);
  const stopes = counts.get('stope') ?? 0;
  const q = filter.trim().toLowerCase();
  const shown = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
  return (
    <details
      className="working-kinds"
      open={open}
      onToggle={(e) => {
        const next = e.currentTarget.open;
        setOpen(next);
        if (!next) clearKindsReview();
      }}
    >
      <summary>{t('topo.kind.summary', { n: fmt(kinds.length), stopes: fmt(stopes) })}</summary>
      <p className="hint">{t('topo.kind.hint')}</p>
      {/* Leyenda y filtro en 3D por tipo. */}
      <ul className="working-kind-legend">
        {WORKING_KINDS.filter((k) => counts.has(k)).map((k) => (
          <li key={k}>
            <label>
              <input
                type="checkbox"
                checked={!isWorkingKindHidden(k)}
                onChange={(e) => {
                  setWorkingKindHidden(k, !e.target.checked);
                  setHiddenVersion((v) => v + 1);
                }}
              />
              <span className="swatch" style={{ background: hex(WORKING_KIND_COLORS[k]) }} />
              {t(`topo.kind.${k}`)} ({counts.get(k)})
            </label>
          </li>
        ))}
      </ul>
      {rows.length > 8 && (
        <input
          type="search"
          className="working-kind-filter"
          placeholder={t('topo.kind.filter')}
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
          }}
        />
      )}
      <ul className="working-kind-rows">
        {shown.map((r) => {
          const kind = kinds[r.i] ?? 'other';
          return (
            <li key={r.i} className={kind === 'stope' ? 'stope' : undefined}>
              <span className="swatch" style={{ background: hex(WORKING_KIND_COLORS[kind]) }} />
              <span className="working-kind-name" title={r.name}>
                {r.name}
              </span>
              <span className="muted">
                {fmt(r.length, 0)} m
                {kind === 'stope' && dips[r.i] && (
                  <>
                    {' · '}
                    {t('topo.kind.dip', {
                      deg: fmt(((dips[r.i]?.dip ?? 0) * 180) / Math.PI, 0),
                      dir: compass(dips[r.i]?.dipAzimuth ?? 0),
                    })}
                  </>
                )}
              </span>
              <select
                aria-label={t('topo.kind.of', { name: r.name })}
                value={kind}
                onChange={(e) => {
                  const k = WORKING_KINDS.find((x) => x === e.target.value);
                  if (k) setWorkingKinds(survey, new Map([[r.i, k]]));
                }}
              >
                {WORKING_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`topo.kind.${k}`)}
                  </option>
                ))}
              </select>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
