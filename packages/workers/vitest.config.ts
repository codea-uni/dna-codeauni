import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'workers',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
