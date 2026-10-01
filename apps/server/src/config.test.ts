import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

const BASE = {
  DATABASE_URL: 'postgres://x',
  BETTER_AUTH_SECRET: 's'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:3000',
};

describe('loadConfig', () => {
  it('aplica los valores por defecto', () => {
    expect(loadConfig(BASE)).toEqual({
      databaseUrl: 'postgres://x',
      host: '0.0.0.0',
      port: 3000,
      logLevel: 'info',
      authSecret: 's'.repeat(32),
      baseUrl: 'http://localhost:3000',
      demoData: true,
      initialAdmin: null,
    });
  });

  it('permite desactivar los datos predeterminados explícitamente', () => {
    expect(loadConfig({ ...BASE, CRONOS_DEMO_DATA: 'false' }).demoData).toBe(false);
    expect(() => loadConfig({ ...BASE, CRONOS_DEMO_DATA: 'typo' })).toThrow(/CRONOS_DEMO_DATA/);
  });

  it('arma el primer administrador solo con correo y contraseña', () => {
    const c = loadConfig({
      ...BASE,
      CRONOS_SUPERADMIN_EMAIL: 'a@b.pe',
      CRONOS_SUPERADMIN_PASSWORD: 'x'.repeat(10),
    });
    expect(c.initialAdmin).toEqual({
      email: 'a@b.pe',
      password: 'x'.repeat(10),
      name: 'Administrador de la plataforma',
    });
  });

  it('falla nombrando las variables faltantes o inválidas', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL.*BETTER_AUTH_SECRET.*BETTER_AUTH_URL/);
    expect(() => loadConfig({ ...BASE, BETTER_AUTH_SECRET: 'corto' })).toThrow(
      /BETTER_AUTH_SECRET/,
    );
  });

  it('acepta los nombres anteriores CRONOS_ADMIN_*', () => {
    const c = loadConfig({
      ...BASE,
      CRONOS_ADMIN_EMAIL: 'a@b.pe',
      CRONOS_ADMIN_PASSWORD: 'x'.repeat(10),
    });
    expect(c.initialAdmin?.email).toBe('a@b.pe');
  });
});
