/**
 * Uso por usuario: límite de corridas en una ventana y alerta ante un barrido (muchas corridas
 * seguidas del mismo módulo que cambian UN solo parámetro del diseño), la forma de reconstruir los
 * coeficientes de un modelo desde afuera. La alerta no bloquea: se anota en la corrida y en el log.
 */
import type { Blast, Project } from '@cronos/core';

export interface GuardOptions {
  /** Corridas por usuario dentro de la ventana. */
  maxRuns: number;
  windowMs: number;
  /** Corridas seguidas que cambian un solo parámetro para levantar la alerta. */
  sweepRuns: number;
}

export const DEFAULT_GUARD: GuardOptions = { maxRuns: 300, windowMs: 10 * 60_000, sweepRuns: 15 };

/** Parámetros del diseño que importan al cálculo, aplanados («patterns.0.burden» → 4.5). */
export type Signature = Record<string, string | number | boolean | null>;

function flatten(v: unknown, prefix: string, out: Signature, depth: number) {
  if (Object.keys(out).length > 400) return;
  if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    out[prefix] = v;
    return;
  }
  if (depth > 5 || typeof v !== 'object') return;
  if (Array.isArray(v)) {
    if (v.length > 40) {
      out[`${prefix}.length`] = v.length;
      return;
    }
    v.forEach((x, i) => {
      flatten(x, `${prefix}.${String(i)}`, out, depth + 1);
    });
    return;
  }
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (k === 'id' || k.endsWith('Id')) continue;
    flatten(x, prefix ? `${prefix}.${k}` : k, out, depth + 1);
  }
}

/**
 * Firma del diseño de una corrida: malla, parámetros de cálculo, roca, explosivos de la biblioteca
 * y opciones. Los taladros entran resumidos (cuántos y la carga declarada), no uno por uno.
 */
export function designSignature(project: Project, blast: Blast, options: unknown): Signature {
  const out: Signature = {};
  flatten(blast.patterns, 'pattern', out, 0);
  flatten(blast.calcParams, 'calc', out, 0);
  flatten(project.rockMasses.find((r) => r.id === blast.rockMassId) ?? null, 'rock', out, 0);
  flatten(project.library, 'library', out, 0);
  flatten(options ?? null, 'options', out, 0);
  out.holes = blast.holes.length;
  return out;
}

const changedKeys = (a: Signature, b: Signature) => {
  let n = 0;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (a[k] !== b[k]) n++;
  return n;
};

interface UserState {
  times: number[];
  last: Map<string, Signature>;
  streak: Map<string, number>;
}

export class UsageGuard {
  private readonly users = new Map<string, UserState>();
  constructor(private readonly opts: GuardOptions = DEFAULT_GUARD) {}

  private state(user: string): UserState {
    let s = this.users.get(user);
    if (!s) {
      s = { times: [], last: new Map(), streak: new Map() };
      this.users.set(user, s);
    }
    return s;
  }

  /** ¿Puede correr? Cuenta la corrida si sí. */
  admit(user: string, now = Date.now()): boolean {
    const s = this.state(user);
    s.times = s.times.filter((t) => now - t < this.opts.windowMs);
    if (s.times.length >= this.opts.maxRuns) return false;
    s.times.push(now);
    return true;
  }

  /** Anota la firma de la corrida; devuelve true si completa un barrido de un solo parámetro. */
  observe(user: string, module: string, sig: Signature): boolean {
    const s = this.state(user);
    const prev = s.last.get(module);
    const streak = prev && changedKeys(prev, sig) === 1 ? (s.streak.get(module) ?? 0) + 1 : 0;
    s.last.set(module, sig);
    s.streak.set(module, streak);
    return streak >= this.opts.sweepRuns;
  }
}
