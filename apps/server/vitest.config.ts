import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'server',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Cada archivo crea su propio esquema de PostgreSQL; en serie para no saturar la conexión.
    fileParallelism: false,
  },
});
