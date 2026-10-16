import { describe, expect, it } from 'vitest';
import { chunkText } from './knowledge';

describe('chunkText', () => {
  it('abre un trozo por título y guarda la ruta de títulos', () => {
    const chunks = chunkText(
      '# Agua\n\nIntro.\n\n## Matriz\n\nANFO solo en seco.\n\n# Humos\n\nNOx naranja.',
    );
    expect(chunks).toEqual([
      { heading: 'Agua', text: 'Intro.' },
      { heading: 'Agua > Matriz', text: 'ANFO solo en seco.' },
      { heading: 'Humos', text: 'NOx naranja.' },
    ]);
  });

  it('un texto sin títulos se parte entre párrafos sin pasar del máximo', () => {
    const p = 'a'.repeat(60);
    const chunks = chunkText([p, p, p, p].join('\n\n'), 130);
    expect(chunks.map((c) => c.text.length)).toEqual([122, 122]);
    expect(chunks.every((c) => c.heading === null)).toBe(true);
  });

  it('un párrafo demasiado largo se corta entre frases', () => {
    const chunks = chunkText('Uno dos tres. Cuatro cinco seis. Siete ocho nueve.', 20);
    expect(chunks.map((c) => c.text)).toEqual(['Uno dos tres.', 'Cuatro cinco seis.', 'Siete ocho nueve.']);
  });

  it('ignora los títulos sin cuerpo', () => {
    expect(chunkText('# Vacío\n\n# Lleno\n\nTexto')).toEqual([{ heading: 'Lleno', text: 'Texto' }]);
  });
});
