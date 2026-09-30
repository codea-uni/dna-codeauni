/**
 * Textos visibles del engine (nombres para deshacer, brújula, reglas). Por defecto en español; la
 * app los traduce con `Engine.setText` (G8). `{nombre}` se reemplaza con `vars`.
 */
export const ENGINE_TEXT = {
  'undo.addHole': 'Agregar taladro',
  'undo.addNamed': 'Agregar {name}',
  'undo.deleteNamed': 'Borrar {name}',
  'undo.drawNamed': 'Dibujar {name}',
  'undo.moveHole': 'Mover taladro',
  'undo.moveHoles': 'Mover {n} taladros',
  'undo.deleteConnection': 'Borrar conexión',
  'undo.connectHoles': 'Conectar taladros',
  'undo.initiationPoint': 'Punto de inicio',
  'undo.freeFace': 'Cara libre',
  /** Nombre de un dominio de material nuevo (A7). */
  'domain.defaultName': 'Dominio {n}',
  'map.compass': 'Brújula',
  /** Letra del Oeste en la brújula y en los rumbos de medición. */
  'map.west': 'O',
  'map.rulerCorner': 'Coordenadas del proyecto: Este (arriba) y Norte (izquierda)',
  'map.grid': 'grilla',
  /** Pendiente entre los extremos de una medición sobre la topografía. */
  'map.slope': 'pendiente {deg}°',
  /** Separador decimal de los números del mapa. */
  'map.decimal': ',',
};

export type EngineTextKey = keyof typeof ENGINE_TEXT;
export type EngineText = (key: EngineTextKey, vars?: Record<string, string | number>) => string;

export const defaultEngineText: EngineText = (key, vars) =>
  ENGINE_TEXT[key].replace(/\{(\w+)\}/g, (m, k: string) => String(vars?.[k] ?? m));
