import {
  designByMethod,
  methodContextToWorld,
  methodDesignToHoles,
  methodParams,
  methodPointToWorld,
  MINING_METHODS,
  miningMethod,
  pickExplosiveByHint,
  type Explosive,
  type MethodDesign,
  type MiningMethodId,
  type ProductLibrary,
  type Project,
} from '@cronos/core';
import { t } from '../i18n';
import { session } from '../session';
import { useUiStore } from '../stores/uiStore';
import { useMethodStore } from './methodStore';
import {
  defaultPlacements,
  done,
  excavationOp,
  fly,
  frameOf,
  guard,
  products,
  replaceOps,
  type Placement,
} from './send';
import { useUndergroundStore } from './store';

/**
 * Cálculo y envío al 3D de una plantilla por método de minado. Igual que el frente y los
 * abanicos: un solo dispatch deshacible que reemplaza los taladros de la marca de la plantilla
 * (`ug-longhole`, `ug-raise`, …), tiempos electrónicos y la labor como contexto en 3D.
 */

const { document } = session;

/** Separación mínima entre taladros de una plantilla con electrónicos [s]. */
export const METHOD_HOLE_SEPARATION = 0.025;

/** Explosivo elegido para la plantilla o el sugerido por familia que entra en el taladro. */
export function methodExplosive(
  lib: ProductLibrary,
  id: MiningMethodId,
  explosiveId: string | undefined,
  holeDiameter: number,
): Explosive | null {
  return (
    lib.explosives.find((e) => e.id === explosiveId) ??
    pickExplosiveByHint(lib, miningMethod(id).explosive, holeDiameter)
  );
}

/** Explosivo del contorno sugerido (frentes con voladura suave, breasting). */
export function methodContourExplosive(
  lib: ProductLibrary,
  id: MiningMethodId,
  main: Explosive,
): Explosive {
  const hint = miningMethod(id).contourExplosive;
  return (hint && pickExplosiveByHint(lib, hint)) ?? main;
}

/** Diseño de la plantilla con los cambios guardados en la sesión. */
export function computeMethod(
  lib: ProductLibrary,
  id: MiningMethodId,
): { design: MethodDesign; explosive: Explosive } | null {
  const s = useMethodStore.getState();
  const patch = s.patches[id] ?? {};
  const params = methodParams(id, patch);
  const explosive = methodExplosive(lib, id, s.explosives[id], params.holeDiameter);
  if (!explosive) return null;
  return { design: designByMethod(id, patch, explosive), explosive };
}

/** Separación de las ubicaciones por defecto de las plantillas [m]. */
const STEP_X = 45;
const STEP_Y = 70;

/**
 * Ubicación por defecto de cada plantilla: a 60 m al oeste del frente y en una grilla por
 * plantilla, para que varias labores enviadas no se encimen. La rampa toma su pendiente.
 */
export function defaultMethodPlacement(project: Project, id: MiningMethodId): Placement {
  const base = defaultPlacements(project).face;
  const i = MINING_METHODS.findIndex((m) => m.id === id);
  const m = miningMethod(id);
  return {
    ...base,
    x: base.x - 60 - STEP_X * (i % 5),
    y: base.y + STEP_Y * Math.floor(i / 5),
    gradientPct: m.gradientPct ?? 0,
  };
}

export function methodPlacement(project: Project, id: MiningMethodId): Placement {
  return useMethodStore.getState().placements[id] ?? defaultMethodPlacement(project, id);
}

/** Taladros de una marca en la voladura activa. */
export function methodHolesInBlast(tag: string): number {
  return document.project.blasts[0]?.holes.filter((h) => h.tags?.includes(tag)).length ?? 0;
}

/** Envía la plantilla al 3D; devuelve los taladros creados (0 si no se pudo). */
export function sendMethod(
  id: MiningMethodId,
  design: MethodDesign,
  explosive: Explosive,
  placement: Placement,
): number {
  const blast = guard();
  if (!blast) return 0;
  const m = miningMethod(id);
  const lib = document.project.library;
  const prod = products(
    document.project,
    explosive.id,
    methodContourExplosive(lib, id, explosive).id,
  );
  if (!prod) {
    useUiStore.getState().notify(t('ug.noExplosive'), 'error');
    return 0;
  }
  const frame = frameOf(placement);
  const holes = methodDesignToHoles({
    design,
    frame,
    products: prod.products,
    tag: m.tag,
    labelPrefix: `${m.code.replace('-', '')}-`,
    // Electrónicos: secuencia continua (25 ms) para que ningún taladro salga acoplado con otro.
    holeSeparation: prod.electronic ? METHOD_HOLE_SEPARATION : 0,
  });
  const name = t(`ugm.m.${id}.name`);
  document.dispatch(
    [
      ...replaceOps(blast, m.tag, holes, prod.electronic),
      excavationOp(
        blast,
        m.tag,
        design.context.map((c) => ({
          tag: m.tag,
          kind: c.kind,
          sections: methodContextToWorld(frame, c),
        })),
      ),
    ],
    t('ugm.undo', { name, n: holes.length }),
  );
  done(holes.length, prod.hasDetonator);
  // Cámara: al centro de la caja de la labor, con un tamaño que la abarque.
  const { min, max } = design.envelope;
  const center = { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 };
  const size = Math.max(max.x - min.x, max.y - min.y, max.z - min.z) * 1.6 + 4;
  const at = methodPointToWorld(frame, center);
  const centered = frameOf({ ...placement, x: at.x, y: at.y, z: at.z, gradientPct: 0 });
  fly(centered, { u: 0, v: 0 }, 0, size, placement.azimuthDeg);
  return holes.length;
}

/**
 * Pasa una plantilla de frente o de abanico rectangular a las pestañas «Frente de túnel» o
 * «Abanicos» para afinarla allí (mismos parámetros).
 */
export function openInClassicTab(id: MiningMethodId, explosive: Explosive): void {
  const m = miningMethod(id);
  const p = methodParams(id, useMethodStore.getState().patches[id] ?? {});
  const ug = useUndergroundStore.getState();
  if (m.generator === 'face') {
    ug.patchFace({
      profile: p.profile,
      width: p.width,
      height: p.height,
      holeDiameter: p.holeDiameter,
      reliefDiameter: p.reliefDiameter,
      reliefCount: p.reliefCount,
      cartridgeDiameter: p.cartridgeDiameter,
      maxDrill: p.length,
      rockConstant: p.rockConstant,
      smooth: p.smooth,
      delayInterval: p.holeInterval,
      explosiveId: explosive.id,
    });
    ug.setTab('face');
  } else if (m.generator === 'ring') {
    ug.patchRing({
      driveWidth: p.driveWidth,
      driveHeight: p.driveHeight,
      stopeWidth: p.width,
      stopeBottom: p.stopeBottom,
      stopeTop: p.stopeTop,
      stopeOffset: 0,
      pivotHeight: p.pivotHeight,
      pivotOffset: 0,
      mode: 'toeSpacing',
      toeSpacing: p.toeSpacing > 0 ? p.toeSpacing : 1.3 * p.burden,
      standOff: p.standOff,
      maxLength: p.length,
      deadZone: p.deadZone,
      holeDiameter: p.holeDiameter,
      explosiveId: explosive.id,
      ...(p.burden > 0 ? { burden: p.burden } : {}),
      rockDensity: p.rockDensity,
      rings: p.rows,
      holeInterval: p.holeInterval,
      ringInterval: p.rowInterval,
    });
    ug.setTab('ring');
  } else return;
  useMethodStore.getState().setActive(false);
}
