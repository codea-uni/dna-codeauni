import type { Hole } from '@cronos/core';

export interface HoleResolution {
  hole: Hole;
  requested_label: string;
  resolved_label: string;
  resolution_note?: string;
}

/** Rango real, sin suponer que las etiquetas son consecutivas ni solamente numéricas. */
export function holeLabelRange(holes: readonly Hole[]): string {
  if (!holes.length) return 'No hay taladros en la malla.';
  const labels = holes
    .map((h) => h.label)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return `Las etiquetas existentes van de ${labels[0]} a ${labels.at(-1)} (${holes.length} taladros; posiciones 1–${holes.length}).`;
}

/** Etiqueta exacta primero; número por posición después, en el orden del documento. */
export function resolveHole(holes: readonly Hole[], requested: string): HoleResolution {
  const label = requested.trim();
  // Se conservan los prefijos dictados, pero nunca se pierde una etiqueta alfanumérica exacta.
  const digits = /^(?:taladro\s*|B)(\d+)$/i.exec(label)?.[1];
  const key = digits ?? label;
  const exact = holes.find((h) => h.label === label) ?? holes.find((h) => h.label === key);
  if (exact) return { hole: exact, requested_label: requested, resolved_label: exact.label };
  const n = /^\d+$/.test(key) ? Number(key) : NaN;
  const positional = Number.isSafeInteger(n) && n >= 1 ? holes[n - 1] : undefined;
  if (positional)
    return {
      hole: positional,
      requested_label: requested,
      resolved_label: positional.label,
      resolution_note: `No existe la etiqueta ${label}; se tomó el taladro por posición ${n}, cuya etiqueta es ${positional.label}.`,
    };
  throw new Error(`Taladro desconocido: ${label || '(sin etiqueta)'}. ${holeLabelRange(holes)}`);
}

/** Rangos con huecos conservan su semántica: incluyen los números resolubles del intervalo. */
export function resolveHoleLabels(holes: readonly Hole[], labels: readonly string[]) {
  const resolutions: HoleResolution[] = [];
  const missing: string[] = [];
  for (const raw of labels) {
    if (holes.some((h) => h.label === raw.trim())) {
      resolutions.push(resolveHole(holes, raw));
      continue;
    }
    const range = /^\D*(\d+)\s*(?:-|–|—|a|al|hasta)\s*\D*(\d+)$/i.exec(raw.trim());
    if (range?.[1] && range[2]) {
      const a = Math.min(Number(range[1]), Number(range[2]));
      const b = Math.max(Number(range[1]), Number(range[2]));
      // Recorrer candidatos limita el trabajo al tamaño de la malla, incluso con rangos enormes.
      const candidates = new Set(holes.flatMap((h, i) => [Number(h.label), i + 1]));
      const numbers = [...candidates]
        .filter((n) => Number.isSafeInteger(n) && n >= a && n <= b)
        .sort((x, y) => x - y);
      const start = resolutions.length;
      for (const n of numbers) {
        try {
          resolutions.push(resolveHole(holes, String(n)));
        } catch {
          /* Hueco del rango. */
        }
      }
      if (resolutions.length === start) missing.push(raw);
    } else {
      try {
        resolutions.push(resolveHole(holes, raw));
      } catch {
        missing.push(raw);
      }
    }
  }
  return { found: new Set(resolutions.map((r) => r.resolved_label)), missing, resolutions };
}

/** Normaliza los argumentos de etiqueta y conserva la explicación para el resultado y la voz. */
export function resolveHoleArguments(holes: readonly Hole[], args: Record<string, unknown>) {
  const resolutions: HoleResolution[] = [];
  const single = (value: string) => {
    const r = resolveHole(holes, value);
    resolutions.push(r);
    return r.resolved_label;
  };
  const target = (value: unknown): unknown => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const v = value as Record<string, unknown>;
    if (!Array.isArray(v.labels)) return value;
    const r = resolveHoleLabels(holes, v.labels as string[]);
    if (r.missing.length)
      throw new Error(`Etiquetas desconocidas: ${r.missing.join(', ')}. ${holeLabelRange(holes)}`);
    resolutions.push(...r.resolutions);
    return { ...v, labels: [...r.found] };
  };
  const resolved = { ...args };
  for (const k of ['hole', 'start_label'])
    if (typeof args[k] === 'string') resolved[k] = single(args[k]);
  for (const k of ['target', 'holes']) if (args[k]) resolved[k] = target(args[k]);
  if (Array.isArray(args.delays))
    resolved.delays = args.delays.map((v: { label: string; delay_ms: number }) => ({
      ...v,
      label: single(v.label),
    }));
  const labels = [...new Set(resolutions.map((r) => r.resolved_label))];
  const notes = [
    ...new Set(resolutions.flatMap((r) => (r.resolution_note ? [r.resolution_note] : []))),
  ];
  return {
    args: resolved,
    metadata: labels.length
      ? {
          ...(labels.length === 1 ? { resolved_label: labels[0] } : {}),
          resolved_labels: labels,
          ...(notes.length ? { resolution_note: notes.join(' ') } : {}),
        }
      : {},
  };
}
