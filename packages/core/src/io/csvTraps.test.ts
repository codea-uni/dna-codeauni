/**
 * Trampas de importación de `docs/theory/03 §5` y el caso CR-04 sintético (`docs/theory/04`):
 * 180 taladros sin encabezado «ID;Este;Norte;Cota», separador `;`, miles con coma, UTM 18S.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BENCH } from '../model/factories';
import {
  checkHolePositions,
  decodeText,
  DEFAULT_CSV_UNITS,
  importHolesFromCsv,
  makeGroup,
  parseCsv,
  positionalHoleMapping,
  type HoleCsvDefaults,
} from './csv';

const UTM_18S = 32718;
const noCrs: HoleCsvDefaults = {
  diameter: 0.31115,
  subdrill: 2,
  bench: DEFAULT_BENCH,
  startNumber: 1,
};
const defaults: HoleCsvDefaults = { ...noCrs, epsg: UTM_18S };

function importText(text: string, extra: Partial<HoleCsvDefaults> = {}, base = defaults) {
  const table = parseCsv(text);
  const mapping = positionalHoleMapping(table.rows[0] ?? []);
  return importHolesFromCsv(table, mapping, DEFAULT_CSV_UNITS, { ...base, ...extra });
}

const cr04 = readFileSync(new URL('./fixtures/cr04-sintetico.csv', import.meta.url));

describe('CR-04 sintético', () => {
  it('se importa completo, en su posición y sin avisos', () => {
    const { text, encoding } = decodeText(cr04);
    expect(encoding).toBe('utf-8');
    const table = parseCsv(text);
    expect(table.delimiter).toBe(';');
    expect(table.hasHeader).toBe(false);
    expect(positionalHoleMapping(table.rows[0] ?? [])).toEqual({ label: 0, x: 1, y: 2, z: 3 });

    const r = importText(text, { groupFromPrefix: true });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.holes).toHaveLength(180);
    const count = (p: RegExp) => r.holes.filter((h) => p.test(h.label)).length;
    expect([count(/^A\d/), count(/^B\d/), count(/^C\d/), count(/^BF/)]).toEqual([32, 32, 32, 84]);
    expect(r.holes[0]).toMatchObject({
      label: 'A1',
      collar: { x: 274600, y: 8944820, z: 4254 },
    });
    // Grupo desde el prefijo del ID: A, B, C y BF (este se reconoce como buffer)
    expect(r.groups.map((g) => [g.name, g.kind])).toEqual([
      ['A', 'other'],
      ['B', 'other'],
      ['C', 'other'],
      ['BF', 'buffer'],
    ]);
  });
});

describe('trampas de importación (03 §5)', () => {
  it('codificación ISO-8859-1 / Windows-1252: acentos y ñ legibles', () => {
    const latin1 = Uint8Array.from([0x4e, 0xba, 0x3b, 0xd1, 0x31, 0x0a]); // "Nº;Ñ1\n"
    expect(decodeText(latin1)).toEqual({ text: 'Nº;Ñ1\n', encoding: 'windows-1252' });
    expect(decodeText(new TextEncoder().encode('Nº;Ñ1\n')).encoding).toBe('utf-8');
  });

  it('miles con coma a nivel de archivo: «274,600» es 274600 si otra celda trae 272,345.578', () => {
    expect(importText('A1;274,600;8,944,820.5;4254\n').holes[0]?.collar.x).toBe(274600);
    // Sin evidencia de miles en el archivo, la coma sola es decimal
    expect(importText('A1;274,6;8944820;4254\n').holes[0]?.collar.x).toBe(274.6);
  });

  it('Norte y Este intercambiados: aviso con CRS UTM y sin él', () => {
    const swapped = 'A1;8,944,820.0;274,600.0;4254\nA2;8,944,820.0;274,610.0;4254\n';
    expect(importText(swapped).warnings.map((w) => w.kind)).toEqual(['swapXY']);
    expect(importText(swapped, {}, noCrs).warnings.map((w) => w.kind)).toEqual(['swapXY']);
    // Coordenadas locales con CRS UTM: fuera de rango, sin sugerir intercambio
    expect(importText('A1;10;20;5\n').warnings.map((w) => w.kind)).toEqual(['outOfCrs']);
  });

  it('IDs duplicados: error con la línea del primero; no se importa el repetido', () => {
    const r = importText(
      'A1;274600;8944820;4254\nA2;274610;8944820;4254\nA1;274620;8944820;4254\n',
    );
    expect(r.holes.map((h) => h.label)).toEqual(['A1', 'A2']);
    expect(r.errors).toEqual([{ line: 3, message: 'ID duplicado «A1» (ya en la línea 1)' }]);
    const again = importText('A2;274630;8944820;4254\n', { existingLabels: ['A2'] });
    expect(again.errors[0]?.message).toContain('ya existe en la voladura');
  });

  it('cota ausente o cero: aviso con los taladros afectados', () => {
    const r = importText('A1;274600;8944820;\nA2;274610;8944820;0\nA3;274620;8944820;4254\n');
    expect(r.warnings.map((w) => [w.kind, w.labels])).toEqual([
      ['noZ', ['A1']],
      ['zeroZ', ['A2']],
    ]);
    expect(r.holes[0]?.collar.z).toBe(DEFAULT_BENCH.floorElevation + DEFAULT_BENCH.height);
  });

  it('atípicos: un taladro a kilómetros del resto', () => {
    const holes = Array.from({ length: 20 }, (_, i) => ({
      label: `A${String(i + 1)}`,
      collar: { x: 274600 + 10 * i, y: 8944820, z: 4254 },
    }));
    holes.push({ label: 'X', collar: { x: 279600, y: 8944820, z: 4254 } });
    expect(checkHolePositions(holes, UTM_18S)).toEqual([
      expect.objectContaining({ kind: 'outlier', labels: ['X'] }),
    ]);
  });

  it('el tipo de grupo se infiere del nombre (RM-18)', () => {
    expect(['Precorte', 'Buffer', 'Producción', 'Fila A'].map((n) => makeGroup(n, 0).kind)).toEqual(
      ['presplit', 'buffer', 'production', 'other'],
    );
  });
});
