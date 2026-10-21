import {
  FACE_HOLE_TAG as FACE_TAG,
  RING_HOLE_TAG as RING_TAG,
  MINING_METHODS,
  projectForShot,
  resolveShot,
  shotTag,
  undergroundShots,
  type Blast,
  type Project,
} from '@cronos/core';
import { useMemo } from 'react';
import { useActiveBlast } from '../hooks/useDocument';
import { t as tr, useFormat, useT, type MessageKey } from '../i18n';
import { useProjectKind } from '../product/product';
import { isUndergroundPile } from '../analysis/visualize';
import { useAnalysisStore } from '../stores/analysisStore';
import { useUgAnalysisStore } from './analysisStore';
import { findTarget } from './location';
import { useUndergroundStore } from './store';
import './shots.css';

/**
 * Disparo analizado (A8): en subterránea cada diseño llevado al 3D (el frente, el set de abanicos,
 * cada plantilla por método) es una voladura distinta. La fragmentación, la vibración y la pestaña
 * Análisis de Subterránea calculan sobre el disparo elegido aquí (`useUgAnalysisStore.designTag`,
 * el mismo selector en todas las ventanas). Ver `projectForShot` en el núcleo.
 */

type Translate = typeof tr;

/** Labor donde se ubicó el diseño (nombre de la labor importada), si se eligió una. */
function workingName(tag: string): string | null {
  const tab = tag === FACE_TAG ? 'face' : tag === RING_TAG ? 'ring' : null;
  if (!tab) return null;
  const loc = useUndergroundStore.getState().locations[tab];
  // Abanicos en un tajeo: el nombre del tajeo, no el de la galería desde la que se perfora.
  const target = loc ? findTarget(loc.stopeId ?? loc.targetId) : undefined;
  return target && !target.id.startsWith('exc:') ? target.name : null;
}

/** Nombre del diseño/disparo para el usuario: «Frente de túnel · GL-420», «Abanicos · TJ-1». */
export function shotLabel(tag: string, t: Translate = tr): string {
  const base =
    tag === FACE_TAG
      ? t('ug.tab.face')
      : tag === RING_TAG
        ? t('ug.tab.ring')
        : (() => {
            const m = MINING_METHODS.find((x) => x.tag === tag);
            return m ? t(`ugm.m.${m.id}.name` as MessageKey) : tag;
          })();
  const where = workingName(tag);
  return where ? `${base} · ${where}` : base;
}

/** Nombre de una excavación de contexto de un diseño: «Frente de túnel · galería» (no «ug-face»). */
export function excavationLabel(
  tag: string,
  kind: 'drive' | 'round' | 'stope',
  t: Translate = tr,
): string {
  return `${shotLabel(tag, t)} · ${t(`uga.exc.${kind}`)}`;
}

/** Disparo elegido (resuelto contra la voladura): null si la voladura tiene un solo disparo. */
export function selectedShot(blast: Pick<Blast, 'holes'>): string | null {
  return resolveShot(blast, useUgAnalysisStore.getState().designTag);
}

/** Proyecto reducido al disparo elegido (para los cálculos del worker y el informe). */
export function shotProject(project: Project): Project {
  const blast = project.blasts[0];
  if (!blast) return project;
  return projectForShot(project, blast.id, selectedShot(blast));
}

/** Disparo elegido y sus taladros, en React. */
export function useShot() {
  const blast = useActiveBlast();
  const wanted = useUgAnalysisStore((s) => s.designTag);
  return useMemo(() => {
    const shots = blast ? undergroundShots(blast) : [];
    const tag = blast ? resolveShot(blast, wanted) : null;
    const holes = blast ? blast.holes.filter((h) => tag === null || shotTag(h) === tag) : [];
    return { shots, tag, holes, single: shots.length <= 1 ? (shots[0]?.tag ?? null) : null };
  }, [blast, wanted]);
}

/**
 * «Disparo: [Frente de túnel ▾]» y sobre qué taladros se calcula (cantidad y diámetros). Solo en
 * proyectos subterráneos con diseños en 3D; con un solo disparo muestra solo la línea informativa.
 */
export function ShotPicker({ what }: { what?: string }) {
  const t = useT();
  const fmt = useFormat();
  const kind = useProjectKind();
  const { shots, tag, holes, single } = useShot();
  const set = useUgAnalysisStore((s) => s.set);
  if (kind !== 'underground' || shots.length === 0) return null;
  const current = tag ?? single;
  const diameters = [...new Set(holes.map((h) => Math.round(h.diameter * 1000)))].sort(
    (a, b) => a - b,
  );
  const info = t('uga.shot.info', {
    n: holes.length,
    d: diameters.map((d) => fmt(d, 0)).join(' / '),
  });
  return (
    <div className="ug-shot">
      {shots.length > 1 ? (
        <label className="field">
          <span className="field-label">{t('uga.shot')}</span>
          <select
            value={current ?? ''}
            onChange={(e) => {
              set({ designTag: e.target.value, ringIndex: 0 });
              // La pila subterránea es por disparo: la del otro diseño deja de valer.
              const a = useAnalysisStore.getState();
              if (a.muckpile && isUndergroundPile(a.muckpile)) a.set({ muckpile: null });
            }}
          >
            {shots.map((s) => (
              <option key={s.tag} value={s.tag}>
                {shotLabel(s.tag, t)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <span className="field-label">
          {t('uga.shot')}: <strong>{current ? shotLabel(current, t) : '—'}</strong>
        </span>
      )}
      <span className="muted small">
        {what ? `${what} · ` : ''}
        {info}
      </span>
      {shots.length > 1 && <span className="muted small">{t('uga.shot.hint')}</span>}
    </div>
  );
}
