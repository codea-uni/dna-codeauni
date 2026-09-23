import { defineProject } from 'vitest/config';

/** Presupuestos de rendimiento del engine: sin paralelismo entre archivos. */
export default defineProject({
  test: {
    name: 'perf-engine',
    environment: 'node',
    include: ['src/**/*.perf.test.ts'],
    fileParallelism: false,
  },
});
