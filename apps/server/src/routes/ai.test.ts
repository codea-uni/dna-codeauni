import { aiGenerateResponseSchema, aiLiveTokenResponseSchema } from '@cronos/api';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, signedIn, TEST_ORIGIN } from '../test/testApp';
import { HourlyLimiter } from './ai';
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

  it('pide razonamiento corto y, si el modelo no lo admite, repite sin él', async () => {
    const bodies: Record<string, unknown>[] = [];
    const fake: typeof fetch = (_url, init) => {
      const body = JSON.parse(init?.body as string) as Record<string, unknown>;
      bodies.push(body);
      return Promise.resolve(
        JSON.stringify(body.generationConfig ?? {}).includes('thinkingConfig')
          ? Response.json(
              { error: { message: 'Thinking level is not supported' } },
              { status: 400 },
            )
          : Response.json({
              candidates: [{ content: { role: 'model', parts: [{ text: 'Listo.' }] } }],
            }),
      );
    };
    const s = createTestApp(t, { ai: { apiKey: 'clave', model: 'gemini-x' }, fetch: fake });
    const cookie = await signedIn(s, { email: 'sin-thinking@mina.pe' });
    const res = await s.app.inject({
      method: 'POST',
      url: '/api/ai/generate',
      headers: { ...TEST_ORIGIN, cookie },
      payload: turn,
    });
    expect(res.statusCode).toBe(200);
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toMatchObject({
      generationConfig: { thinkingConfig: { thinkingLevel: 'low' } },
    });
    expect(bodies[1]?.generationConfig).not.toHaveProperty('thinkingConfig');
    expect(bodies[1]).toMatchObject({ generationConfig: { maxOutputTokens: 8192 } });
  });

  it('5xx: un solo reintento; 4xx: ninguno; y cada llamada queda en el registro de uso sin texto', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aiuse-'));
    let n = 0;
    const fake: typeof fetch = () => {
      n++;
      return Promise.resolve(
        n === 1
          ? Response.json({ error: { message: 'overloaded' } }, { status: 503 })
          : Response.json({
              candidates: [{ content: { role: 'model', parts: [{ text: 'Listo.' }] } }],
              usageMetadata: {
                promptTokenCount: 1000,
                candidatesTokenCount: 10,
                cachedContentTokenCount: 800,
              },
            }),
      );
    };
    const s = createTestApp(t, {
      ai: { apiKey: 'clave', model: 'gemini-x', logDir: dir },
      fetch: fake,
    });
    const cookie = await signedIn(s, { email: 'reintento@mina.pe' });
    const res = await s.app.inject({
      method: 'POST',
      url: '/api/ai/generate',
      headers: { ...TEST_ORIGIN, cookie },
      payload: turn,
    });
    expect(res.statusCode).toBe(200);
    expect(n).toBe(2);
    const files = (await readdir(dir)).filter((f) => f.startsWith('usage-'));
    const raw = await readFile(join(dir, files[0] ?? ''), 'utf8');
    expect(raw).not.toContain('malla');
    const lines = raw
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      task: 'chat',
      model: 'gemini-x',
      retried: 'http_503',
      tokens: { in: 1000, out: 10, cached: 800 },
    });

    let m = 0;
    const bad: typeof fetch = () => {
      m++;
      return Promise.resolve(Response.json({ error: { message: 'quota' } }, { status: 429 }));
    };
    const s2 = createTestApp(t, { ai: { apiKey: 'clave', model: 'gemini-x' }, fetch: bad });
    const cookie2 = await signedIn(s2, { email: 'cuota@mina.pe' });
    const res2 = await s2.app.inject({
      method: 'POST',
      url: '/api/ai/generate',
      headers: { ...TEST_ORIGIN, cookie: cookie2 },
      payload: turn,
    });
    expect(res2.statusCode).toBe(502);
    expect(m).toBe(1);
  });

  it('respuesta vacía o cortada: un reintento con el modelo de respaldo', async () => {
    const models: string[] = [];
    const fake: typeof fetch = (url) => {
      const u = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
      models.push(u.split('/models/')[1]?.split(':')[0] ?? '');
      return Promise.resolve(
        models.length === 1
          ? Response.json({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [] } }] })
          : Response.json({
              candidates: [
                { content: { role: 'model', parts: [{ text: 'Listo.' }] }, finishReason: 'STOP' },
              ],
            }),
      );
    };
    const s = createTestApp(t, {
      ai: { apiKey: 'clave', model: 'gemini-x', limits: { fallbackModel: 'gemini-y' } },
      fetch: fake,
    });
    const cookie = await signedIn(s, { email: 'vacia@mina.pe' });
    const res = await s.app.inject({
      method: 'POST',
      url: '/api/ai/generate',
      headers: { ...TEST_ORIGIN, cookie },
      payload: turn,
    });
    expect(res.statusCode).toBe(200);
    expect(models).toEqual(['gemini-x', 'gemini-y']);
    expect(res.json()).toMatchObject({ finishReason: 'STOP' });
  });

  it('tope por usuario y hora: 429 ai_rate_limited sin llamar a Gemini', async () => {
    let n = 0;
    const fake: typeof fetch = () => {
      n++;
      return Promise.resolve(
        Response.json({ candidates: [{ content: { role: 'model', parts: [{ text: 'ok' }] } }] }),
      );
    };
    const s = createTestApp(t, {
      ai: { apiKey: 'clave', model: 'gemini-x', limits: { chatPerHour: 1 } },
      fetch: fake,
    });
    const cookie = await signedIn(s, { email: 'tope@mina.pe' });
    const send = () =>
      s.app.inject({
        method: 'POST',
        url: '/api/ai/generate',
        headers: { ...TEST_ORIGIN, cookie },
        payload: turn,
      });
    expect((await send()).statusCode).toBe(200);
    const second = await send();
    expect(second.statusCode).toBe(429);
    expect(second.json()).toMatchObject({ code: 'ai_rate_limited' });
    expect(n).toBe(1);
  });

  it('voz: el mismo texto sale de la caché exacta sin volver a pagarlo', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aitts-'));
    let n = 0;
    const fake: typeof fetch = () => {
      n++;
      return Promise.resolve(
        Response.json({
          candidates: [
            { content: { parts: [{ inlineData: { mimeType: 'audio/wav', data: 'UklGRg==' } }] } },
          ],
        }),
      );
    };
    const s = createTestApp(t, {
      ai: { apiKey: 'clave', model: 'gemini-x', logDir: dir },
      fetch: fake,
    });
    const cookie = await signedIn(s, { email: 'cache-voz@mina.pe' });
    const say = (text: string) =>
      s.app.inject({
        method: 'POST',
        url: '/api/ai/speech',
        headers: { ...TEST_ORIGIN, cookie },
        payload: { text },
      });
    const a = await say('Listo, lo calculo.');
    const b = await say('Listo, lo calculo.');
    const c = await say('Listo, lo calculo');
    expect(a.json()).toEqual(b.json());
    expect(c.statusCode).toBe(200);
    expect(n).toBe(2);
    const usage = (await readdir(dir)).filter((f) => f.startsWith('usage-'));
    const lines = (await readFile(join(dir, usage[0] ?? ''), 'utf8')).trim().split('\n');
    expect(lines.map((l) => (JSON.parse(l) as { cacheHit?: boolean }).cacheHit ?? false)).toEqual([
      false,
      true,
      false,
    ]);
  });

  it('voz en vivo: informa el uso del turno (solo números) y fija el recorte de contexto', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ailive-'));
    const calls: string[] = [];
    const fake: typeof fetch = (_url, init) => {
      calls.push(init?.body as string);
      return Promise.resolve(Response.json({ name: 'auth_tokens/abc' }));
    };
    const s = createTestApp(t, {
      ai: { apiKey: 'clave', model: 'gemini-x', logDir: dir },
      fetch: fake,
    });
    const cookie = await signedIn(s, { email: 'vivo-uso@mina.pe' });
    await s.app.inject({
      method: 'POST',
      url: '/api/ai/live-token',
      headers: { ...TEST_ORIGIN, cookie },
      payload: { systemInstruction: 'x', tools: [] },
    });
    expect(JSON.parse(calls[0] ?? '{}')).toMatchObject({
      bidiGenerateContentSetup: {
        contextWindowCompression: { triggerTokens: 32000, slidingWindow: { targetTokens: 16000 } },
      },
    });
    const res = await s.app.inject({
      method: 'POST',
      url: '/api/ai/usage',
      headers: { ...TEST_ORIGIN, cookie },
      payload: {
        model: 'gemini-3.1-flash-live-preview',
        usage: {
          promptTokenCount: 20000,
          responseTokenCount: 300,
          promptTokensDetails: [
            { modality: 'TEXT', tokenCount: 19000 },
            { modality: 'AUDIO', tokenCount: 1000 },
          ],
          responseTokensDetails: [{ modality: 'AUDIO', tokenCount: 300 }],
        },
      },
    });
    expect(res.statusCode).toBe(204);
    const usage = (await readdir(dir)).filter((f) => f.startsWith('usage-'));
    const line = JSON.parse((await readFile(join(dir, usage[0] ?? ''), 'utf8')).trim()) as Record<
      string,
      unknown
    >;
    // 19k texto × 0,50 + 1k audio × 3 + 300 audio × 12 (USD por millón).
    expect(line).toMatchObject({
      task: 'live',
      tokens: { in: 20000, audioIn: 1000, audioOut: 300 },
    });
    expect(line.costUsd).toBeCloseTo(0.0161, 4);
  });

  it('voz: pide audio a Gemini TTS con la clave y devuelve el audio tal cual', async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fake: typeof fetch = (url, init) => {
      calls.push({
        url: typeof url === 'string' ? url : url instanceof URL ? url.href : url.url,
        body: JSON.parse(init?.body as string) as unknown,
      });
      return Promise.resolve(
        Response.json({
          candidates: [
            { content: { parts: [{ inlineData: { mimeType: 'audio/wav', data: 'UklGRg==' } }] } },
          ],
        }),
      );
    };
    const s = createTestApp(t, {
      ai: { apiKey: 'clave', model: 'gemini-x', ttsModel: 'gemini-tts-x' },
      fetch: fake,
    });
    const cookie = await signedIn(s, { email: 'voz@mina.pe' });
    const res = await s.app.inject({
      method: 'POST',
      url: '/api/ai/speech',
      headers: { ...TEST_ORIGIN, cookie },
      payload: { text: 'Listo, subí el taco a 3 m.' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ mimeType: 'audio/wav', data: 'UklGRg==' });
    expect(calls[0]?.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-tts-x:generateContent',
    );
    expect(calls[0]?.body).toMatchObject({
      contents: [{ parts: [{ text: 'Listo, subí el taco a 3 m.' }] }],
      generationConfig: { responseModalities: ['AUDIO'] },
    });
  });

  it('voz en vivo: pide un token de un uso con modelo, voz, instrucciones y herramientas fijados', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fake: typeof fetch = (url, init) => {
      calls.push({
        url: typeof url === 'string' ? url : url instanceof URL ? url.href : url.url,
        init: init ?? {},
      });
      return Promise.resolve(Response.json({ name: 'auth_tokens/abc' }));
    };
    const s = createTestApp(t, {
      ai: { apiKey: 'clave', model: 'gemini-x', liveModel: 'live-x', liveVoice: 'Voz' },
      fetch: fake,
    });
    const cookie = await signedIn(s, { email: 'vivo@mina.pe' });
    const res = await s.app.inject({
      method: 'POST',
      url: '/api/ai/live-token',
      headers: { ...TEST_ORIGIN, cookie },
      payload: { systemInstruction: turn.systemInstruction, tools: turn.tools },
    });
    expect(res.statusCode).toBe(200);
    expect(aiLiveTokenResponseSchema.parse(res.json())).toEqual({
      token: 'auth_tokens/abc',
      model: 'live-x',
    });
    expect(calls[0]?.url).toBe('https://generativelanguage.googleapis.com/v1alpha/auth_tokens');
    expect(new Headers(calls[0]?.init.headers).get('x-goog-api-key')).toBe('clave');
    const sent = JSON.parse(calls[0]?.init.body as string) as Record<string, unknown>;
    expect(sent).toMatchObject({
      uses: 1,
      bidiGenerateContentSetup: {
        model: 'models/live-x',
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Voz' } } },
        },
        systemInstruction: { parts: [{ text: turn.systemInstruction }] },
        tools: turn.tools,
        realtimeInputConfig: { automaticActivityDetection: { disabled: true } },
      },
    });
  });

  it('registro: guarda cada evento en el JSONL del día con quién lo dijo', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ailog-'));
    const s = createTestApp(t, { ai: { apiKey: 'clave', model: 'gemini-x', logDir: dir } });
    const cookie = await signedIn(s, { email: 'registro@mina.pe' });
    const res = await s.app.inject({
      method: 'POST',
      url: '/api/ai/log',
      headers: { ...TEST_ORIGIN, cookie },
      payload: {
        conversation: 'c1',
        surface: 'xr',
        projectName: 'Tajo',
        events: [
          { at: '2026-10-09T20:00:00Z', kind: 'user', text: 'elimina el B8' },
          { at: '2026-10-09T20:00:01Z', kind: 'tool', name: 'delete_holes', ok: true },
        ],
      },
    });
    expect(res.statusCode).toBe(204);
    const files = await readdir(dir);
    expect(files).toHaveLength(1);
    const lines = (await readFile(join(dir, files[0] ?? ''), 'utf8')).trim().split('\n');
    expect(lines.map((l) => JSON.parse(l) as Record<string, unknown>)).toMatchObject([
      { user: 'registro@mina.pe', conversation: 'c1', surface: 'xr', kind: 'user' },
      { kind: 'tool', name: 'delete_holes', ok: true },
    ]);
  });

  it('registro: sin carpeta configurada no guarda nada', async () => {
    const s = createTestApp(t, { ai: { apiKey: 'clave', model: 'gemini-x' } });
    const cookie = await signedIn(s, { email: 'sinlog@mina.pe' });
    const res = await s.app.inject({
      method: 'POST',
      url: '/api/ai/log',
      headers: { ...TEST_ORIGIN, cookie },
      payload: { conversation: 'c', surface: 'web', events: [{ at: 'x', kind: 'user' }] },
    });
    expect(res.statusCode).toBe(204);
  });

  it('voz en vivo: sin sesión 401', async () => {
    const s = createTestApp(t, { ai: { apiKey: 'clave', model: 'gemini-x' } });
    const res = await s.app.inject({
      method: 'POST',
      url: '/api/ai/live-token',
      headers: TEST_ORIGIN,
      payload: { systemInstruction: 'x', tools: [] },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('HourlyLimiter', () => {
  it('admite el tope por hora y vuelve a admitir cuando sale de la ventana', () => {
    let now = 0;
    const limiter = new HourlyLimiter(2, () => now);
    expect(limiter.take('u')).toBe(true);
    expect(limiter.take('u')).toBe(true);
    expect(limiter.take('u')).toBe(false);
    expect(limiter.take('otro')).toBe(true);
    now = 3_600_001;
    expect(limiter.take('u')).toBe(true);
  });
});
