import type { MessageKey } from '../i18n';

/** Primer nivel de respaldo que aparece en el texto del catálogo («R1 · [CG]» → R1). */
export function confidenceKey(raw: string): MessageKey {
  const m = /R[0-4]|\[(?:V|CG|P)\]/.exec(raw);
  const level = m?.[0].replace(/[[\]]/g, '') ?? '';
  const keys: Record<string, MessageKey> = {
    R0: 'md.level.R0',
    R1: 'md.level.R1',
    R2: 'md.level.R2',
    R3: 'md.level.R3',
    R4: 'md.level.R4',
    V: 'md.level.V',
    CG: 'md.level.CG',
    P: 'md.level.P',
  };
  return keys[level] ?? 'md.level.unknown';
}
