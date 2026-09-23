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
