import type {
  CalibrationResult,
  MuckpileProfile,
  MuckpileResult,
  SurfaceComparison,
  Vec2,
  BlastAnalysis,
  EnergyMetric,
  EnergyResult,
  FragmentationResult,
  KuzRamInputs,
  VibrationMetric,
  VibrationResult,
} from '@cronos/core';
import type { EngineLayer } from '@cronos/engine';
import type { PhysicsFrames } from '@cronos/workers';
import { create } from 'zustand';

export type ColorBy =
  'none' | 'time' | 'kg' | 'powderFactor' | 'effectiveBurden' | 'sdob' | 'group';
export type LabelBy = 'label' | 'time' | 'kg';
/**
 * Color de la pila (A7): desplazamiento, tamaño de fragmento, dominio (dilución), tiempo de salida
 * o error frente a un levantamiento post-voladura (calibración; solo la superficie).
 */
export type MuckpileColorBy = 'displacement' | 'fragment' | 'domain' | 'launch' | 'error';

interface AnalysisState {
  analysis: BlastAnalysis | null;
  /** Versión del documento a la que corresponde `analysis`. */
  version: number;
  computing: boolean;
  /** 0 = automático. */
  isochroneIntervalMs: number;
  colorBy: ColorBy;
  labelBy: LabelBy;
  layers: Record<EngineLayer, boolean>;
  sequenceTime: number | null;
  sequencePlaying: boolean;
  /** Segundos de secuencia por segundo real. */
  sequenceSpeed: number;
  /** Energía: se calcula solo si está habilitada. */
  energyEnabled: boolean;
  energyMetric: EnergyMetric;
  /** Cota del plano [m]; null = mitad del banco. */
  energyElevation: number | null;
  /** Con topografía: evaluar sobre el terreno (true) o en el plano a `energyElevation` (false). */
  energyOnTerrain: boolean;
  energyCellSize: number;
  energyCutoff: number;
  energySigma: number;
  /** Niveles de contorno en unidades de presentación (mm/s o kg/m³); vacío = automáticos. */
  energyLevels: number[];
  /** Contornos de daño en múltiplos de VPPc (FC-33) en vez de los niveles del usuario. */
  energyDamage: boolean;
  energyOpacity: number;
  energy: EnergyResult | null;
  energyComputing: boolean;
  /** Fragmentación: entradas automáticas desde la voladura mientras `fragAuto`. */
  fragAuto: boolean;
  fragInputs: KuzRamInputs | null;
  /** Tamaño máximo Swebrec [m]; null = min(B, S). */
  fragXmax: number | null;
  fragOversize: number;
  fragFines: number;
  frag: FragmentationResult | null;
  /** Vibración: se calcula solo si está habilitada. */
  vibEnabled: boolean;
  vibMetric: VibrationMetric;
  vibLawId: string | null;
  /** Radio de cálculo [m]; 0 = automático. */
  vibExtent: number;
  /** Niveles en unidades de presentación (mm/s o dB); vacío = por defecto. */
  vibLevels: number[];
  vibOpacity: number;
  vibration: VibrationResult | null;
  vibComputing: boolean;
  /** Pila de material (A7): se calcula a pedido (botón), no en cada edición. */
  muckpile: MuckpileResult | null;
  /** Versión del documento con la que se calculó (distinta = desactualizada). */
  muckpileVersion: number;
  muckpileComputing: boolean;
  /** Pedido de cálculo (contador): el runner lo atiende. */
  muckpileRequest: number;
  muckpileColorBy: MuckpileColorBy;
  muckpileOpacity: number;
  /** Animación: interpolar trayectorias (rápido) o reproducir la simulación física (Rapier). */
  muckpileMode: 'fast' | 'physics';
  muckpileFrames: PhysicsFrames | null;
  /** Avance de la simulación física (0–1) o null si no está corriendo. */
  muckpilePhysicsProgress: number | null;
  /** Sección trazada y su perfil. */
  muckpileSection: { a: Vec2; b: Vec2 } | null;
  muckpileProfile: MuckpileProfile | null;
  /** Comparación con un levantamiento post-voladura y calibración de k, n. */
  muckpileCompare: SurfaceComparison | null;
  muckpileCalibration: CalibrationResult | null;
  muckpileCalibrating: number | null;
  /** Topografía: intervalo de curvas [m] (0 = automático) y opacidad del sombreado. */
  topoContourInterval: number;
  topoShadeOpacity: number;
  /** Opacidad de la ortofoto en planta. */
  topoImageOpacity: number;
  /** Opacidad de la topografía en 3D: menos de 1 deja ver los taladros bajo el terreno. */
  topoOpacity3d: number;
  set: (patch: Partial<Omit<AnalysisState, 'set' | 'setLayer'>>) => void;
  setLayer: (layer: EngineLayer, visible: boolean) => void;
}

export const useAnalysisStore = create<AnalysisState>()((set) => ({
  analysis: null,
  version: -1,
  computing: false,
  isochroneIntervalMs: 0,
  colorBy: 'none',
  labelBy: 'label',
  layers: {
    labels: true,
    traces: true,
    connections: true,
    isochrones: false,
    energy: true,
    vibration: true,
    flyrock: true,
    displacement: false,
    topoImage: true,
    topoShade: true,
    topoContours: true,
    topoLines: true,
    muckpile: true,
    muckpileBefore: false,
    muckpileVectors: true,
    muckpileBlocks: true,
    domains: true,
    faces: true,
    benchPlanes: true,
  },
  sequenceTime: null,
  sequencePlaying: false,
  sequenceSpeed: 0.1,
  energyEnabled: false,
  energyMetric: 'nearFieldPpv',
  energyElevation: null,
  energyOnTerrain: true,
  energyCellSize: 0,
  energyCutoff: 0,
  energySigma: 2,
  energyLevels: [],
  energyDamage: false,
  energyOpacity: 0.6,
  energy: null,
  energyComputing: false,
  fragAuto: true,
  fragInputs: null,
  fragXmax: null,
  fragOversize: 1,
  fragFines: 0.01,
  frag: null,
  vibEnabled: false,
  vibMetric: 'ppv',
  vibLawId: null,
  vibExtent: 0,
  vibLevels: [],
  vibOpacity: 0.45,
  vibration: null,
  vibComputing: false,
  muckpile: null,
  muckpileVersion: -1,
  muckpileComputing: false,
  muckpileRequest: 0,
  muckpileColorBy: 'fragment',
  muckpileOpacity: 0.85,
  muckpileMode: 'fast',
  muckpileFrames: null,
  muckpilePhysicsProgress: null,
  muckpileSection: null,
  muckpileProfile: null,
  muckpileCompare: null,
  muckpileCalibration: null,
  muckpileCalibrating: null,
  topoContourInterval: 0,
  topoShadeOpacity: 0.85,
  topoImageOpacity: 1,
  topoOpacity3d: 0.85,
  set: (patch) => {
    set(patch);
  },
  setLayer: (layer, visible) => {
    set((s) => ({ layers: { ...s.layers, [layer]: visible } }));
  },
}));
