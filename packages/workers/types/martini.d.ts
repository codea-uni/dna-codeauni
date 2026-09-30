// Tipos de @mapbox/martini 0.2 (el paquete no los trae): malla RTIN de una grilla (2^k+1)².
declare module '@mapbox/martini' {
  export interface MartiniMesh {
    /** x, y de cada vértice en coordenadas de grilla. */
    vertices: Uint16Array;
    triangles: Uint32Array;
  }
  export interface MartiniTile {
    getMesh(maxError?: number): MartiniMesh;
  }
  export default class Martini {
    constructor(gridSize?: number);
    createTile(terrain: Float32Array): MartiniTile;
  }
}
