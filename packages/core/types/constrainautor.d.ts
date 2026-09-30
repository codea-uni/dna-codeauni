/**
 * Tipos mínimos de @kninnug/constrainautor (ISC). El paquete publica sus tipos como fuente `.ts`,
 * que no compila con las opciones estrictas del proyecto; `tsconfig.json` (`paths`) apunta aquí.
 * En ejecución se usa el paquete real.
 */
interface DelaunatorLike {
  coords: ArrayLike<number>;
  triangles: Uint32Array | Int32Array;
  halfedges: Int32Array;
  hull: Uint32Array;
}

export default class Constrainautor {
  constructor(del: DelaunatorLike, edges?: readonly [number, number][]);
  constrainOne(segP1: number, segP2: number): number;
  delaunify(deep?: boolean): this;
}
