// Tipos mínimos de laz-perf 0.0.7 (los del paquete dependen de @types/emscripten).
declare module 'laz-perf' {
  export interface LASZip {
    open(data: number, length: number): void;
    getPoint(dest: number): void;
    getCount(): number;
    getPointLength(): number;
    getPointFormat(): number;
    delete(): void;
  }
  export interface LazPerfModule {
    LASZip: new () => LASZip;
    HEAPU8: Uint8Array;
    _malloc(size: number): number;
    _free(ptr: number): void;
  }
  export function createLazPerf(options?: {
    locateFile?: (path: string, dir: string) => string;
  }): Promise<LazPerfModule>;
}

declare module '*.wasm?url' {
  const url: string;
  export default url;
}
