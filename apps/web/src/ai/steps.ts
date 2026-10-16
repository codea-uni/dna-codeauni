/**
 * Últimos pasos de diseño que aplicó el asistente (herramienta + argumentos), para guardarlos como
 * preset y volver a aplicarlos en otro perímetro o proyecto. Sin imports: lo usa `runTool`.
 */

export interface RecordedStep {
  tool: string;
  args: Record<string, unknown>;
}

/** Herramientas que forman parte de un preset, en el orden en que se reaplican. */
export const PRESET_TOOLS = [
  'set_site_conditions',
  'generate_pattern',
  'design_presplit',
  'design_buffer',
  'set_charge',
  'set_tie_up',
  'set_electronic_timing',
] as const;

const last = new Map<string, RecordedStep>();

/** Quita lo que ata el paso a este diseño (perímetro, taladros puntuales). */
function portable(tool: string, args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...args };
  delete out.perimeter;
  if (tool === 'set_charge') {
    const target = (args.target ?? {}) as Record<string, unknown>;
    out.target = typeof target.group === 'string' ? { group: target.group } : { all: true };
  }
  return out;
}

export function recordStep(tool: string, args: unknown): void {
  if (!(PRESET_TOOLS as readonly string[]).includes(tool)) return;
  const a = (args ?? {}) as Record<string, unknown>;
  const p = portable(tool, a);
  // Una carga por grupo (producción, precorte, buffer); el resto, la última.
  const key =
    tool === 'set_charge' ? `${tool}:${(p.target as { group?: string }).group ?? 'all'}` : tool;
  // El amarre es uno solo: el último reemplaza al otro tipo.
  if (tool === 'set_tie_up') last.delete('set_electronic_timing');
  if (tool === 'set_electronic_timing') last.delete('set_tie_up');
  // Una malla nueva deja sin efecto la carga y el amarre anteriores en el preset.
  if (tool === 'generate_pattern')
    for (const k of [...last.keys()]) if (k.startsWith('set_charge') || k.startsWith('set_tie') || k === 'set_electronic_timing') last.delete(k);
  last.set(key, { tool, args: p });
}

/** Pasos grabados, en el orden de reaplicación. */
export function recordedSteps(): RecordedStep[] {
  const order = (t: string) => (PRESET_TOOLS as readonly string[]).indexOf(t);
  return [...last.values()].sort((a, b) => order(a.tool) - order(b.tool));
}

export function clearRecordedSteps(): void {
  last.clear();
}
