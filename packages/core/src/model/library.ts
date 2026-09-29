import { newId } from './ids';
import type { ProductLibrary } from './types';

/**
 * Librería inicial con valores típicos de referencia (catálogos genéricos, no de un fabricante).
 * El usuario debe reemplazarlos por los datos de sus productos. Sin ficha técnica son R0 (CT-01 en
 * docs/RULES.md): cada producto lo declara en `source` (DF-22).
 * Energías en J/kg (AWS); RWS relativo a ANFO = 1.0. Los agentes de voladura (ANFO, ANFO pesado y
 * emulsión a granel) necesitan booster (RM-05; glosario de R1, «agente de voladura»).
 */
const GENERIC = {
  source: 'Valor genérico de ejemplo, sin ficha técnica: reemplazar por la del fabricante (CT-01)',
  version: 'Cronos 0.1',
} as const;
export function createDefaultLibrary(): ProductLibrary {
  const emulsionId = newId<'Explosive'>();
  return {
    explosives: [
      {
        id: newId<'Explosive'>(),
        ...GENERIC,
        name: 'ANFO',
        family: 'anfo',
        form: 'bulk',
        needsBooster: true,
        density: 800,
        vod: 3800,
        energy: 3.7e6,
        rws: 1,
        waterResistance: 'none',
        costPerKg: 0.9,
      },
      {
        id: newId<'Explosive'>(),
        ...GENERIC,
        name: 'ANFO pesado 30/70',
        family: 'heavy-anfo',
        form: 'bulk',
        needsBooster: true,
        density: 1100,
        vod: 4500,
        energy: 3.55e6,
        rws: 0.96,
        waterResistance: 'none',
        costPerKg: 1.05,
      },
      {
        ...GENERIC,
        id: emulsionId,
        name: 'Emulsión bombeable',
        family: 'emulsion',
        form: 'bulk',
        needsBooster: true,
        density: 1200,
        vod: 5500,
        energy: 2.9e6,
        rws: 0.78,
        waterResistance: 'high',
        costPerKg: 1.2,
      },
      {
        id: newId<'Explosive'>(),
        ...GENERIC,
        name: 'Emulsión encartuchada 2½″×16″',
        family: 'emulsion',
        form: 'packaged',
        density: 1150,
        vod: 5000,
        energy: 3.0e6,
        rws: 0.81,
        waterResistance: 'high',
        cartridge: { diameter: 0.0635, length: 0.4064, mass: 1.48 },
        costPerKg: 2.1,
      },
    ],
    detonators: [
      {
        id: newId<'Detonator'>(),
        ...GENERIC,
        name: 'Nonel fondo 500 ms',
        type: 'nonel',
        nominalDelay: 0.5,
        delayScatter: 0.0075,
        costPerUnit: 4.5,
      },
      {
        id: newId<'Detonator'>(),
        ...GENERIC,
        name: 'Nonel fondo 400 ms',
        type: 'nonel',
        nominalDelay: 0.4,
        delayScatter: 0.006,
        costPerUnit: 4.5,
      },
      {
        id: newId<'Detonator'>(),
        ...GENERIC,
        name: 'Electrónico',
        type: 'electronic',
        nominalDelay: 0,
        delayScatter: 0.0001,
        programmableRange: { min: 0, max: 20, step: 0.001 },
        costPerUnit: 22,
      },
    ],
    surfaceConnectors: [
      {
        id: newId<'SurfaceConnector'>(),
        ...GENERIC,
        name: 'Nonel superficie 17 ms',
        type: 'nonel-surface',
        delay: 0.017,
        delayScatter: 0.0008,
        costPerUnit: 3,
      },
      {
        id: newId<'SurfaceConnector'>(),
        ...GENERIC,
        name: 'Nonel superficie 25 ms',
        type: 'nonel-surface',
        delay: 0.025,
        delayScatter: 0.001,
        costPerUnit: 3,
      },
      {
        id: newId<'SurfaceConnector'>(),
        ...GENERIC,
        name: 'Nonel superficie 42 ms',
        type: 'nonel-surface',
        delay: 0.042,
        delayScatter: 0.0015,
        costPerUnit: 3,
      },
      {
        id: newId<'SurfaceConnector'>(),
        ...GENERIC,
        name: 'Nonel superficie 65 ms',
        type: 'nonel-surface',
        delay: 0.065,
        delayScatter: 0.002,
        costPerUnit: 3,
      },
      {
        id: newId<'SurfaceConnector'>(),
        ...GENERIC,
        name: 'Nonel superficie 100 ms',
        type: 'nonel-surface',
        delay: 0.1,
        delayScatter: 0.003,
        costPerUnit: 3,
      },
    ],
    primers: [
      { ...GENERIC, id: newId<'Primer'>(), name: 'Booster 450 g', mass: 0.45, costPerUnit: 6 },
      { ...GENERIC, id: newId<'Primer'>(), name: 'Booster 900 g', mass: 0.9, costPerUnit: 10 },
    ],
    stemmingMaterials: [
      {
        ...GENERIC,
        id: newId<'StemmingMaterial'>(),
        name: 'Gravilla ⅜″',
        density: 1650,
        costPerM3: 12,
      },
      {
        id: newId<'StemmingMaterial'>(),
        ...GENERIC,
        name: 'Detrito de perforación',
        density: 1800,
        costPerM3: 0,
      },
    ],
  };
}
