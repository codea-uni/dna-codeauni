import { aiGenerateResponseSchema } from '@cronos/api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, signedIn, TEST_ORIGIN } from '../test/testApp';
import { createTestDb, databaseAvailable, type TestDb } from '../test/testDb';

const turn = {
  systemInstruction: 'Eres el asistente.',
  contents: [{ role: 'user', parts: [{ text: 'malla cuadrada de 5 m' }] }],
  tools: [{ functionDeclarations: [{ name: 'generate_pattern', description: 'Genera la malla' }] }],
};

describe.runIf(await databaseAvailable())('asistente de IA (/api/ai/generate)', () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb();
  });
  afterAll(async () => {
    await t.drop();
  });

  it('pide sesión y, sin GEMINI_API_KEY, responde 503 ai_not_configured', async () => {
    const s = createTestApp(t);
    const anonymous = await s.app.inject({
      method: 'POST',
      url: '/api/ai/generate',
      headers: TEST_ORIGIN,
      payload: turn,
    });
    expect(anonymous.statusCode).toBe(401);
    const cookie = await signedIn(s, { email: 'sin-clave@mina.pe' });
    const res = await s.app.inject({
      method: 'POST',
      url: '/api/ai/generate',
      headers: { ...TEST_ORIGIN, cookie },
      payload: turn,
    });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ code: 'ai_not_configured' });
  });

  it('agrega la clave, reenvía la conversación y devuelve el turno del modelo tal cual', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const call = {
      functionCall: { name: 'generate_pattern', args: { kind: 'square', burden: 5 } },
    };
    const fake: typeof fetch = (url, init) => {
      calls.push({
        url: typeof url === 'string' ? url : url instanceof URL ? url.href : url.url,
        init: init ?? {},
      });
      return Promise.resolve(
        Response.json({
          candidates: [
            {
              content: { role: 'model', parts: [{ ...call, thoughtSignature: 'abc' }] },
              finishReason: 'STOP',
            },
          ],
        }),
      );
    };
    const s = createTestApp(t, {
      ai: { apiKey: 'clave-de-prueba', model: 'gemini-x' },
      fetch: fake,
    });
    const cookie = await signedIn(s, { email: 'con-clave@mina.pe' });
    const res = await s.app.inject({
      method: 'POST',
      url: '/api/ai/generate',
      headers: { ...TEST_ORIGIN, cookie },
      payload: turn,
    });
    expect(res.statusCode).toBe(200);
    expect(aiGenerateResponseSchema.parse(res.json())).toEqual({
      content: { role: 'model', parts: [{ ...call, thoughtSignature: 'abc' }] },
      finishReason: 'STOP',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-x:generateContent',
    );
    expect(new Headers(calls[0]?.init.headers).get('x-goog-api-key')).toBe('clave-de-prueba');
    const sent = JSON.parse(calls[0]?.init.body as string) as Record<string, unknown>;
    expect(sent).toMatchObject({
      systemInstruction: { parts: [{ text: turn.systemInstruction }] },
      contents: turn.contents,
      tools: turn.tools,
    });
  });

  it('un error de Gemini (clave inválida) llega como 502 ai_upstream con su mensaje', async () => {
    const fake: typeof fetch = () =>
      Promise.resolve(Response.json({ error: { message: 'API key not valid' } }, { status: 400 }));
    const s = createTestApp(t, { ai: { apiKey: 'mala', model: 'gemini-x' }, fetch: fake });
    const cookie = await signedIn(s, { email: 'clave-mala@mina.pe' });
    const res = await s.app.inject({
      method: 'POST',
      url: '/api/ai/generate',
      headers: { ...TEST_ORIGIN, cookie },
      payload: turn,
    });
    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({ code: 'ai_upstream', message: 'API key not valid' });
  });
});
