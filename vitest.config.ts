import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/*/vitest.config.ts',
      'apps/*/vitest.config.ts',
      'packages/core/vitest.perf.config.ts',
      'packages/engine/vitest.perf.config.ts',
    ],
    // Cobertura del motor de cálculo (NF-12, ≥ 85 % de líneas): `pnpm test:coverage`, que corre
    // solo el proyecto core. Las rutas son relativas a la raíz de cada proyecto.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts'],
      reporter: ['text-summary', 'html'],
      thresholds: { lines: 85 },
    },
  },
});
