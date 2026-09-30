import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  it('aplica los valores por defecto', () => {
    expect(loadConfig({ DATABASE_URL: 'postgres://x' })).toEqual({
      databaseUrl: 'postgres://x',
      host: '0.0.0.0',
      port: 3000,
      logLevel: 'info',
    });
  });

  it('falla nombrando la variable faltante', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });
});
