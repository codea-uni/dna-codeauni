/**
 * Globales mínimos disponibles en navegadores, Web Workers y Node ≥ 19.
 * core compila sin lib DOM, así que declaramos solo lo que usa.
 */
declare const crypto: {
  getRandomValues<T extends ArrayBufferView>(array: T): T;
};

declare const performance: {
  now(): number;
};

/** Descompresión nativa (navegador, workers y Node ≥ 18): solo lo que usa el ejemplo de mina. */
declare const DecompressionStream: new (format: 'deflate' | 'deflate-raw' | 'gzip') => object;

declare class Response {
  constructor(body: Uint8Array | object);
  readonly body: { pipeThrough(transform: object): object } | null;
  arrayBuffer(): Promise<ArrayBuffer>;
}
