import {
  arched,
  circular,
  designFaceRound,
  designRing,
  horseshoe,
  rectangular,
  roundedShoulders,
  type ExcavationProfile,
  type Explosive,
  type FaceDesignResult,
  type ProductLibrary,
  type RingDesignResult,
  type UV,
} from '@cronos/core';

/**
 * Formularios de la herramienta subterránea (SI) y su cálculo puro: perfil, ronda del frente y
 * anillo. Todo es trivial frente a un diseño de superficie (decenas de taladros), así que corre en
 * el hilo principal con `useMemo`.
 */

export type ProfileChoice =
  'arched' | 'horseshoe' | 'rectangular' | 'roundedShoulders' | 'circular';
export const PROFILE_CHOICES: readonly ProfileChoice[] = [
  'arched',
  'horseshoe',
  'rectangular',
  'roundedShoulders',
  'circular',
];

const DEG = Math.PI / 180;

export interface FaceForm {
  profile: ProfileChoice;
  width: number;
  height: number;
  holeDiameter: number;
  reliefDiameter: number;
  reliefCount: number;
  /** null = el preferido de la biblioteca. */
  explosiveId: string | null;
  contourExplosiveId: string | null;
  /**
   * Diámetro del cartucho [m] (explosivo desacoplado, lo usual en frentes); 0 = a granel,
   * acoplado al taladro. Fija la carga lineal y con ella los burdens del método sueco.
   */
  cartridgeDiameter: number;
  rockConstant: number;
  maxDrill: number;
  smooth: boolean;
  /** Tiempo por número de retardo [s]. */
  delayInterval: number;
}

export const DEFAULT_FACE: FaceForm = {
  profile: 'arched',
  width: 4.5,
  height: 4.0,
  holeDiameter: 0.045,
  reliefDiameter: 0.102,
  reliefCount: 1,
  explosiveId: null,
  contourExplosiveId: null,
  // Emulsión encartuchada 1¼″ en taladros de 45 mm.
  cartridgeDiameter: 0.032,
  rockConstant: 0.4,
  // Viga de 14 pies del jumbo.
  maxDrill: 4.0,
  smooth: true,
  delayInterval: 0.1,
};

export interface RingForm {
  driveWidth: number;
  driveHeight: number;
  stopeWidth: number;
  /** Cotas del tajeo relativas al piso de la galería [m]. */
  stopeBottom: number;
  stopeTop: number;
  stopeOffset: number;
  pivotHeight: number;
  pivotOffset: number;
  mode: 'toeSpacing' | 'angle';
  toeSpacing: number;
  angleStep: number;
  standOff: number;
  maxLength: number;
  /** Semiancho de la zona sin taladros alrededor de la vertical hacia abajo [rad]. */
  deadZone: number;
  holeDiameter: number;
  explosiveId: string | null;
  burden: number;
  rockDensity: number;
  rings: number;
  holeInterval: number;
  ringInterval: number;
}

export const DEFAULT_RING: RingForm = {
  driveWidth: 4,
  driveHeight: 4,
  stopeWidth: 15,
  stopeBottom: -3,
  stopeTop: 20,
  stopeOffset: 0,
  pivotHeight: 1.6,
  pivotOffset: 0,
  mode: 'toeSpacing',
  toeSpacing: 2.5,
  angleStep: 7.5 * DEG,
  standOff: 0.3,
  maxLength: 30,
  deadZone: 30 * DEG,
  holeDiameter: 0.089,
  explosiveId: null,
  burden: 2.2,
  rockDensity: 2700,
  rings: 5,
  holeInterval: 0.025,
  ringInterval: 0.5,
};

/** Error de datos con un mensaje para la interfaz. */
export class InputError extends Error {}

/** Explosivo del formulario o el preferido para subterráneo: emulsión a granel, emulsión, ANFO. */
export function pickExplosive(lib: ProductLibrary, id: string | null): Explosive | null {
  const list = lib.explosives;
  return (
    list.find((e) => e.id === id) ??
    list.find((e) => e.family === 'emulsion' && e.form === 'bulk') ??
    list.find((e) => e.family === 'emulsion') ??
    list.find((e) => e.family === 'anfo') ??
    list[0] ??
    null
  );
}

/** Explosivo del frente: con cartuchos, prefiere una emulsión encartuchada. */
export function pickFaceExplosive(
  lib: ProductLibrary,
  form: Pick<FaceForm, 'explosiveId' | 'cartridgeDiameter'>,
): Explosive | null {
  const chosen = lib.explosives.find((e) => e.id === form.explosiveId);
  if (chosen || !(form.cartridgeDiameter > 0)) return chosen ?? pickExplosive(lib, null);
  // Un cartucho de catálogo más grueso que el pedido no entra en el taladro (2½″ en 45 mm).
  const fits = (e: Explosive) =>
    !e.cartridge || e.cartridge.diameter <= form.cartridgeDiameter + 0.002;
  return (
    lib.explosives.find((e) => e.family === 'emulsion' && e.form === 'packaged' && fits(e)) ??
    pickExplosive(lib, null)
  );
}

/** Aviso si el cartucho de catálogo del explosivo no entra en el taladro. */
export function cartridgeTooLarge(
  form: Pick<FaceForm, 'holeDiameter'>,
  explosive: Explosive,
): boolean {
  return !!explosive.cartridge && explosive.cartridge.diameter >= form.holeDiameter;
}

/** Carga lineal [kg/m] del cartucho, o undefined si va a granel (acoplado). */
export function cartridgeLinearCharge(
  form: Pick<FaceForm, 'cartridgeDiameter' | 'holeDiameter'>,
  explosive: Explosive,
): number | undefined {
  const dc = Math.min(form.cartridgeDiameter, form.holeDiameter);
  return dc > 0 ? (explosive.density * Math.PI * dc * dc) / 4 : undefined;
}

/**
 * Perfil del frente. Parámetros derivados: arco-D con hastiales hw = H − W/2; herradura con
 * flecha f = W/4 y hw = H − f; hombros redondeados de radio 0,5 m; circular de diámetro W.
 */
export function buildFaceProfile(form: Pick<FaceForm, 'profile' | 'width' | 'height'>) {
  const { width: W, height: H } = form;
  if (!(W > 0) || !(H > 0)) throw new InputError('W, H > 0');
  switch (form.profile) {
    case 'arched': {
      const hw = H - W / 2;
      if (hw <= 0.05) throw new InputError(`H > W/2 = ${(W / 2).toFixed(2)} m`);
      return arched(W, hw);
    }
    case 'horseshoe': {
      const f = W / 4;
      const hw = H - f;
      if (hw <= 0.05) throw new InputError(`H > W/4 = ${f.toFixed(2)} m`);
      return horseshoe(W, hw, f);
    }
    case 'rectangular':
      return rectangular(W, H);
    case 'roundedShoulders':
      return roundedShoulders(W, H, Math.min(0.5, W / 2, H));
    case 'circular':
      return circular(W / 2);
  }
}

export interface FaceComputation {
  profile: ExcavationProfile;
  design: FaceDesignResult;
}

export function computeFace(form: FaceForm, explosive: Explosive): FaceComputation {
  if (!(form.holeDiameter > 0) || !(form.reliefDiameter > 0)) throw new InputError('d, φ0 > 0');
  const profile = buildFaceProfile(form);
  const linearCharge = cartridgeLinearCharge(form, explosive);
  const design = designFaceRound({
    profile,
    holeDiameter: form.holeDiameter,
    reliefDiameter: form.reliefDiameter,
    reliefCount: form.reliefCount,
    explosiveDensity: explosive.density,
    rws: explosive.rws,
    ...(linearCharge !== undefined ? { linearCharge } : {}),
    rockConstant: form.rockConstant,
    maxDrillLength: form.maxDrill,
    smoothBlasting: form.smooth,
  });
  return { profile, design };
}

export interface RingComputation {
  drive: ExcavationProfile;
  boundary: UV[];
  pivot: UV;
  ring: RingDesignResult;
}

export function buildDriveProfile(form: Pick<RingForm, 'driveWidth' | 'driveHeight'>) {
  return buildFaceProfile({
    profile: 'arched',
    width: form.driveWidth,
    height: form.driveHeight,
  });
}

/** Contorno rectangular del tajeo en el plano del anillo (antihorario). */
export function stopeBoundary(form: RingForm): UV[] {
  const l = form.stopeOffset - form.stopeWidth / 2;
  const r = form.stopeOffset + form.stopeWidth / 2;
  return [
    { u: l, v: form.stopeBottom },
    { u: r, v: form.stopeBottom },
    { u: r, v: form.stopeTop },
    { u: l, v: form.stopeTop },
  ];
}

export function computeRing(form: RingForm, explosive: Explosive): RingComputation {
  if (!(form.stopeWidth > 0) || !(form.stopeTop > form.stopeBottom)) throw new InputError('stope');
  if (!(form.holeDiameter > 0) || !(form.burden > 0)) throw new InputError('d, B > 0');
  if (form.mode === 'angle' ? !(form.angleStep >= DEG / 2) : !(form.toeSpacing >= 0.2))
    throw new InputError('S, Δθ');
  const drive = buildDriveProfile(form);
  const boundary = stopeBoundary(form);
  const pivot = { u: form.pivotOffset, v: form.pivotHeight };
  const ring = designRing({
    pivot,
    boundary,
    drive: drive.points,
    mode: form.mode,
    toeSpacing: form.toeSpacing,
    angleStep: form.angleStep,
    standOff: form.standOff,
    maxLength: form.maxLength,
    deadZones: form.deadZone > 0 ? [{ center: Math.PI, halfWidth: form.deadZone }] : [],
    holeDiameter: form.holeDiameter,
    explosiveDensity: explosive.density,
    burden: form.burden,
    rockDensity: form.rockDensity,
    delayInterval: form.holeInterval,
  });
  return { drive, boundary, pivot, ring };
}
