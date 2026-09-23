import { defineProject } from 'vitest/config';

/** Presupuestos de rendimiento: sin paralelismo entre archivos. */
export default defineProject({
  test: {
    name: 'perf',
    environment: 'node',
    include: ['src/**/*.perf.test.ts'],
    fileParallelism: false,
  },
});
