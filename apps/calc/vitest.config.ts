import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'calc',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
