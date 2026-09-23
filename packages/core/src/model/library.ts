import { newId } from './ids';
import type { ProductLibrary } from './types';

/**
 * Librería inicial con valores típicos de referencia (catálogos genéricos, no de un fabricante).
 * El usuario debe reemplazarlos por los datos de sus productos.
 * Energías en J/kg (AWS); RWS relativo a ANFO = 1.0.
 */
export function createDefaultLibrary(): ProductLibrary {
  const emulsionId = newId<'Explosive'>();
  return {
    explosives: [
      {
        id: newId<'Explosive'>(),
        name: 'ANFO',
        family: 'anfo',
        form: 'bulk',
        density: 800,
        vod: 3800,
        energy: 3.7e6,
        rws: 1,
        waterResistant: false,
        costPerKg: 0.9,
      },
      {
        id: newId<'Explosive'>(),
        name: 'ANFO pesado 30/70',
        family: 'heavy-anfo',
        form: 'bulk',
        density: 1100,
        vod: 4500,
        energy: 3.55e6,
        rws: 0.96,
        waterResistant: false,
        costPerKg: 1.05,
      },
      {
        id: emulsionId,
        name: 'Emulsión bombeable',
        family: 'emulsion',
        form: 'bulk',
        density: 1200,
        vod: 5500,
        energy: 2.9e6,
        rws: 0.78,
        waterResistant: true,
        costPerKg: 1.2,
      },
      {
        id: newId<'Explosive'>(),
        name: 'Emulsión encartuchada 2½″×16″',
        family: 'emulsion',
        form: 'packaged',
        density: 1150,
        vod: 5000,
        energy: 3.0e6,
        rws: 0.81,
        waterResistant: true,
        cartridge: { diameter: 0.0635, length: 0.4064, mass: 1.48 },
        costPerKg: 2.1,
      },
    ],
    detonators: [
      {
        id: newId<'Detonator'>(),
        name: 'Nonel fondo 500 ms',
        type: 'nonel',
        nominalDelay: 0.5,
        delayScatter: 0.0075,
        costPerUnit: 4.5,
      },
      {
        id: newId<'Detonator'>(),
        name: 'Nonel fondo 400 ms',
        type: 'nonel',
        nominalDelay: 0.4,
        delayScatter: 0.006,
        costPerUnit: 4.5,
      },
      {
        id: newId<'Detonator'>(),
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
        name: 'Nonel superficie 17 ms',
        type: 'nonel-surface',
        delay: 0.017,
        delayScatter: 0.0008,
        costPerUnit: 3,
      },
      {
        id: newId<'SurfaceConnector'>(),
        name: 'Nonel superficie 25 ms',
        type: 'nonel-surface',
        delay: 0.025,
        delayScatter: 0.001,
        costPerUnit: 3,
      },
      {
        id: newId<'SurfaceConnector'>(),
        name: 'Nonel superficie 42 ms',
        type: 'nonel-surface',
        delay: 0.042,
        delayScatter: 0.0015,
        costPerUnit: 3,
      },
      {
        id: newId<'SurfaceConnector'>(),
        name: 'Nonel superficie 65 ms',
        type: 'nonel-surface',
        delay: 0.065,
        delayScatter: 0.002,
        costPerUnit: 3,
      },
      {
        id: newId<'SurfaceConnector'>(),
        name: 'Nonel superficie 100 ms',
        type: 'nonel-surface',
        delay: 0.1,
        delayScatter: 0.003,
        costPerUnit: 3,
      },
    ],
    primers: [
      { id: newId<'Primer'>(), name: 'Booster 450 g', mass: 0.45, costPerUnit: 6 },
      { id: newId<'Primer'>(), name: 'Booster 900 g', mass: 0.9, costPerUnit: 10 },
    ],
    stemmingMaterials: [
      { id: newId<'StemmingMaterial'>(), name: 'Gravilla ⅜″', density: 1650, costPerM3: 12 },
      {
        id: newId<'StemmingMaterial'>(),
        name: 'Detrito de perforación',
        density: 1800,
        costPerM3: 0,
      },
    ],
  };
}
