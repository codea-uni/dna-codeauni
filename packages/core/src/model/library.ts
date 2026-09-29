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

/** Ficha técnica de Famesa Explosivos (Perú), descargada el 2026-09-29. */
const famesa = (code: string, rev: string, file: string) =>
  ({
    manufacturer: 'Famesa',
    source: `Famesa ${code}, https://www.famesaexplosivos.com/wp-content/uploads/${file}`,
    version: rev,
  }) as const;
const KCAL = 4184; // J/kcal

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
      // Productos con ficha técnica del fabricante (Famesa). «ANFO Pesado» es el sustituto de
      // HA73/HA64 de CR-04 (S-03): la guía no da su ficha y Famesa tiene un solo ANFO pesado.
      {
        id: newId<'Explosive'>(),
        ...famesa('FT-021-PE/ES', 'Rev. 02 (2023-07-24)', '2024/01/FT-ANFO-PESADO.pdf'),
        name: 'ANFO Pesado (Famesa)',
        family: 'heavy-anfo',
        form: 'bulk',
        needsBooster: true,
        density: 1230,
        densityRange: { min: 1168.5, max: 1291.5 },
        vod: 5000,
        // La ficha dice «3 140 cal/g»; con RWS 84 % frente al ANFO (≈ 3,8 MJ/kg) son kJ/kg (S-11).
        energy: 3.14e6,
        rws: 0.84,
        waterResistance: 'high',
      },
      {
        id: newId<'Explosive'>(),
        ...famesa('FT-019-PE/ES', 'Rev. 02 (2023-05-09)', '2025/01/FT-SUPERFAM-DOS-EN.pdf'),
        name: 'Superfam Dos (ANFO, Famesa)',
        family: 'anfo',
        form: 'bulk',
        needsBooster: true,
        density: 800,
        densityRange: { min: 750, max: 850 },
        vod: 4000, // confinado en tubo de 4″
        energy: 932 * KCAL,
        rws: 1,
        waterResistance: 'none',
        criticalDiameter: 0.038,
      },
      {
        id: newId<'Explosive'>(),
        ...famesa('FT-004-PE/ES', 'Rev. 02 (2023-04-01)', '2025/01/FT-SAN-G-AURUM.pdf'),
        name: 'SAN-G Aurum (emulsión gasificable, Famesa)',
        family: 'emulsion',
        form: 'bulk',
        needsBooster: true,
        // Matriz 1,38 g/cm³; sensibilizada 0,90–1,20: diseño al centro del rango.
        density: 1050,
        densityRange: { min: 900, max: 1200 },
        vod: 4000, // 3500–4500 m/s
        energy: 710 * KCAL,
        rws: 0.79,
        waterResistance: 'high',
        criticalDiameter: 0.032,
      },
      {
        id: newId<'Explosive'>(),
        ...famesa('FT-040-PE/ES', 'Rev. 08 (2023-07-11)', '2025/01/FT-EMULNOR.pdf'),
        name: 'Emulnor 3000 (Famesa)',
        family: 'emulsion',
        form: 'packaged',
        density: 1140,
        vod: 5700,
        energy: 920 * KCAL,
        rws: 1.02,
        waterResistance: 'high',
      },
      {
        id: newId<'Explosive'>(),
        ...famesa('FT-040-PE/ES', 'Rev. 08 (2023-07-11)', '2025/01/FT-EMULNOR.pdf'),
        name: 'Emulnor 5000 (Famesa)',
        family: 'emulsion',
        form: 'packaged',
        density: 1160,
        vod: 5500,
        energy: 1010 * KCAL,
        rws: 1.12,
        waterResistance: 'high',
      },
      {
        id: newId<'Explosive'>(),
        ...famesa('FT-041-PE/ES', 'Rev. 02 (2022-12-20)', '2025/01/FT-EMULGRAN.pdf'),
        name: 'Emulgran 600 (Famesa)',
        family: 'emulsion',
        form: 'packaged',
        density: 1280,
        vod: 4900,
        energy: 980 * KCAL,
        rws: 1.09,
        waterResistance: 'high',
      },
      {
        id: newId<'Explosive'>(),
        ...famesa('FT-052-PE/ES', 'Rev. 04 (2024-08-01)', '2025/01/FT-FAMECORTE-E-20.pdf'),
        name: 'Famecorte E-20 (precorte, Famesa)',
        family: 'emulsion',
        form: 'packaged',
        density: 1100,
        vod: 4200,
        // La ficha no da la energía: RWS 74 % × 932 kcal/kg del ANFO de la misma marca (S-11).
        energy: 0.74 * 932 * KCAL,
        rws: 0.74,
        waterResistance: 'limited',
        // Tubo Ø 17,5 × 512 mm; 144 piezas en 20 kg.
        cartridge: { diameter: 0.0175, length: 0.512, mass: 20 / 144 },
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
      {
        source: famesa('FT-024-PE/ES', '', '2023/12/FT-BOOSTER.pdf').source,
        version: 'Rev. 03 (2024-03-11)',
        id: newId<'Primer'>(),
        name: 'Booster HDP 1/3 (150 g, Famesa)',
        mass: 0.15,
      },
      {
        source: famesa('FT-024-PE/ES', '', '2023/12/FT-BOOSTER.pdf').source,
        version: 'Rev. 03 (2024-03-11)',
        id: newId<'Primer'>(),
        name: 'Booster HDP 1E (450 g, Famesa)',
        mass: 0.45,
      },
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
