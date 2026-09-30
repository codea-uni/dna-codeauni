import { meSchema } from '@cronos/api';
import { getMigrations } from 'better-auth/db/migration';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUserWithPassword } from '../auth/auth';
import { seedInitialAdmin } from '../auth/seed';
import {
  cookieHeader,
  createTestApp,
  signIn,
  signedIn,
  TEST_ORIGIN,
  type TestApp,
} from '../test/testApp';
import { createTestDb, databaseAvailable, type TestDb } from '../test/testDb';

describe.runIf(await databaseAvailable())('login (H-801, NF-07)', () => {
  let t: TestDb;
  let s: TestApp;
  beforeAll(async () => {
    t = await createTestDb();
    s = createTestApp(t);
  });
  afterAll(async () => {
    await t.drop();
  });

  it('la migración cubre todo el esquema que pide Better Auth', async () => {
    const m = await getMigrations(s.auth.options);
    expect(m.toBeCreated).toEqual([]);
    expect(m.toBeAdded).toEqual([]);
  });

  it('entra con la contraseña correcta y /api/me devuelve el usuario', async () => {
    const cookie = await signedIn(s, { email: 'Ana@Mina.pe', name: 'Ana', locale: 'en' });
    const res = await s.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(meSchema.parse(res.json()).user).toMatchObject({
      name: 'Ana',
      email: 'ana@mina.pe',
      locale: 'en',
      mustChangePassword: false,
    });
  });

  it('rechaza una contraseña incorrecta y un /api/me sin sesión', async () => {
    await createUserWithPassword(s.auth, {
      email: 'luis@mina.pe',
      name: 'Luis',
      password: 'clave-correcta',
    });
    const bad = await s.app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: TEST_ORIGIN,
      payload: { email: 'luis@mina.pe', password: 'otra-clave-mala' },
    });
    expect(bad.statusCode).toBe(401);
    expect(bad.headers['set-cookie']).toBeUndefined();
    const me = await s.app.inject({ method: 'GET', url: '/api/me' });
    expect(me.statusCode).toBe(401);
    expect(me.json()).toMatchObject({ code: 'unauthorized' });
  });

  it('no hay registro público: las rutas no listadas de Better Auth responden 404', async () => {
    const res = await s.app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: TEST_ORIGIN,
      payload: { email: 'intruso@x.pe', password: 'contraseña-larga', name: 'X' },
    });
    expect(res.statusCode).toBe(404);
    const reset = await s.app.inject({ method: 'POST', url: '/api/auth/request-password-reset' });
    expect(reset.statusCode).toBe(404);
  });

  it('cerrar sesión invalida la cookie', async () => {
    const cookie = await signedIn(s, { email: 'rosa@mina.pe' });
    const out = await s.app.inject({
      method: 'POST',
      url: '/api/auth/sign-out',
      headers: { ...TEST_ORIGIN, cookie },
      payload: {},
    });
    expect(out.statusCode).toBe(200);
    const me = await s.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(me.statusCode).toBe(401);
  });

  it('cambiar la contraseña temporal quita la marca y la anterior deja de servir', async () => {
    await createUserWithPassword(s.auth, {
      email: 'nuevo@mina.pe',
      name: 'Nuevo',
      password: 'temporal-123',
    });
    const cookie = await signIn(s.app, 'nuevo@mina.pe', 'temporal-123');
    const me = await s.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(meSchema.parse(me.json()).user.mustChangePassword).toBe(true);

    const wrong = await s.app.inject({
      method: 'POST',
      url: '/api/me/password',
      headers: { ...TEST_ORIGIN, cookie },
      payload: { currentPassword: 'no-es-esta', newPassword: 'definitiva-456' },
    });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json()).toMatchObject({ code: 'invalid_password' });

    const ok = await s.app.inject({
      method: 'POST',
      url: '/api/me/password',
      headers: { ...TEST_ORIGIN, cookie },
      payload: { currentPassword: 'temporal-123', newPassword: 'definitiva-456' },
    });
    expect(ok.statusCode).toBe(200);
    const fresh = cookieHeader(ok.headers['set-cookie']);
    const after = await s.app.inject({ method: 'GET', url: '/api/me', headers: { cookie: fresh } });
    expect(meSchema.parse(after.json()).user.mustChangePassword).toBe(false);
    await expect(signIn(s.app, 'nuevo@mina.pe', 'temporal-123')).rejects.toThrow(/401/);
    await expect(signIn(s.app, 'nuevo@mina.pe', 'definitiva-456')).resolves.toContain('=');
  });

  it('una contraseña nueva corta se rechaza', async () => {
    const cookie = await signedIn(s, { email: 'corta@mina.pe' });
    const res = await s.app.inject({
      method: 'POST',
      url: '/api/me/password',
      headers: { ...TEST_ORIGIN, cookie },
      payload: { currentPassword: 'contraseña-segura', newPassword: 'corta' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'password_too_short' });
  });

  it('PATCH /api/me cambia el idioma', async () => {
    const cookie = await signedIn(s, { email: 'idioma@mina.pe' });
    const res = await s.app.inject({
      method: 'PATCH',
      url: '/api/me',
      headers: { ...TEST_ORIGIN, cookie },
      payload: { locale: 'en' },
    });
    expect(meSchema.parse(res.json()).user.locale).toBe('en');
  });

  it('no se crean dos cuentas con el mismo correo', async () => {
    await expect(
      createUserWithPassword(s.auth, {
        email: 'ANA@mina.pe',
        name: 'Otra',
        password: 'contraseña-segura',
      }),
    ).rejects.toThrow('email_taken');
  });
});

describe.runIf(await databaseAvailable())('primer administrador y límite de intentos', () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb();
  });
  afterAll(async () => {
    await t.drop();
  });

  it('se crea una sola vez, con contraseña temporal', async () => {
    const s = createTestApp(t);
    const admin = {
      email: 'admin@empresa.pe',
      password: 'admin-inicial',
      name: 'Admin',
      organization: 'Minera Sur',
    };
    expect(await seedInitialAdmin(t.db, s.auth, admin)).toEqual(expect.any(String));
    expect(await seedInitialAdmin(t.db, s.auth, admin)).toBeNull();
    const cookie = await signIn(s.app, 'admin@empresa.pe', 'admin-inicial');
    const me = await s.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(meSchema.parse(me.json()).user.mustChangePassword).toBe(true);
  });

  it('bloquea el sexto intento de inicio de sesión en un minuto (429)', async () => {
    const s = createTestApp(t, { rateLimit: true });
    const attempt = () =>
      s.app.inject({
        method: 'POST',
        url: '/api/auth/sign-in/email',
        headers: { ...TEST_ORIGIN, 'x-real-ip': '203.0.113.7' },
        payload: { email: 'admin@empresa.pe', password: 'mala-mala-mala' },
      });
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await attempt()).statusCode);
    expect(codes.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(codes[5]).toBe(429);
  });
});
