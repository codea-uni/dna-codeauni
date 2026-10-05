import { ApiError } from '@cronos/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '@cronos/api';
import { resetAssistant, sendToAssistant, useAiStore } from './agent';
import { runTool } from './tools';

const { generate } = vi.hoisted(() => ({ generate: vi.fn<ApiClient['aiGenerate']>() }));
vi.mock('../server/api', () => ({ api: { aiGenerate: generate }, serverMode: true }));
vi.mock('./tools', () => ({
  AI_FUNCTION_DECLARATIONS: [{ name: 'generate_pattern', description: 'malla' }],
  READ_ONLY_TOOLS: new Set(['get_design']),
  designSummary: () => ({ holes: 0 }),
  runTool: vi.fn(() => Promise.resolve({ ok: true, result: { holes: 120, kind: 'square' } })),
}));

beforeEach(() => {
  resetAssistant();
  vi.clearAllMocks();
});

describe('bucle del asistente', () => {
  it('ejecuta la herramienta pedida, devuelve su resultado con el mismo id y termina en texto', async () => {
    const call = {
      functionCall: { id: 'c1', name: 'generate_pattern', args: { kind: 'square', burden: 5 } },
      thoughtSignature: 'firma',
    };
    generate
      .mockResolvedValueOnce({ content: { role: 'model', parts: [call] }, finishReason: 'STOP' })
      .mockResolvedValueOnce({
        content: {
          role: 'model',
          parts: [{ text: 'Listo: malla cuadrada de 5 m, 120 taladros.' }],
        },
        finishReason: 'STOP',
      });
    const answer = await sendToAssistant('malla cuadrada de 5 metros');
    expect(answer).toBe('Listo: malla cuadrada de 5 m, 120 taladros.');
    expect(runTool).toHaveBeenCalledWith('generate_pattern', { kind: 'square', burden: 5 });
    const second = generate.mock.calls[1]?.[0];
    // El turno del modelo vuelve tal cual (con su firma) y la respuesta lleva el id de la llamada.
    expect(second?.contents).toEqual([
      { role: 'user', parts: [{ text: 'malla cuadrada de 5 metros' }] },
      { role: 'model', parts: [call] },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              id: 'c1',
              name: 'generate_pattern',
              response: { result: { holes: 120, kind: 'square' } },
            },
          },
        ],
      },
    ]);
    expect(second?.systemInstruction).toContain('ALWAYS work on it');
    expect(useAiStore.getState().entries.map((e) => e.kind)).toEqual(['user', 'tool', 'assistant']);
    expect(useAiStore.getState().busy).toBe(false);
  });

  it('sin clave en el servidor: muestra el error y el próximo mensaje parte limpio', async () => {
    generate.mockRejectedValueOnce(
      new ApiError(503, 'ai_not_configured', 'GEMINI_API_KEY is not set'),
    );
    expect(await sendToAssistant('hola')).toBe('');
    expect(useAiStore.getState().entries.at(-1)).toMatchObject({
      kind: 'error',
      code: 'ai_not_configured',
    });
    generate.mockResolvedValueOnce({
      content: { role: 'model', parts: [{ text: 'Hola' }] },
      finishReason: 'STOP',
    });
    await sendToAssistant('de nuevo');
    expect(generate.mock.calls[1]?.[0].contents).toEqual([
      { role: 'user', parts: [{ text: 'de nuevo' }] },
    ]);
  });
});
