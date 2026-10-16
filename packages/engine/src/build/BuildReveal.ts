import type { Hole, HoleId } from '@cronos/core';

/**
 * Pintado en vivo de los cambios del asistente: en vez de aparecer de golpe, los taladros nuevos
 * se perforan uno tras otro (en el orden en que avanzaría una perforadora: fila por fila, en
 * zigzag), la carga se llena desde el fondo y el amarre se dibuja en el orden en que viaja la señal.
 * Solo es presentación: el documento ya tiene el cambio completo desde el primer cuadro.
 *
 * Tiempo puro (sin Three): el engine pregunta en cada cuadro cuánto se ve de cada taladro.
 */

/** Duración de la perforación de un taladro [ms]. */
const DRILL_MS = 420;
/** Duración del llenado de la carga de un taladro [ms]. */
const FILL_MS = 520;
/** Separación entre el inicio de dos taladros seguidos [ms], según cuántos son. */
const STEP_MIN_MS = 18;
const STEP_MAX_MS = 110;
/** Duración total buscada de un lote (se recorta el paso para no pasarla) [ms]. */
const BATCH_TARGET_MS = 4200;
/** Amarre: duración según la cantidad de conexiones [ms]. */
const TIE_MIN_MS = 1400;
const TIE_MAX_MS = 6000;
const TIE_PER_CONNECTION_MS = 30;
/** Onda de tiempos: duración total (proporcional a los retardos) y destello de cada taladro [ms]. */
const PULSE_SPAN_MS = 2600;
const PULSE_MS = 420;
/** Trazo de un perímetro [ms por metro de contorno], con mínimo y máximo. */
const TRACE_MS_PER_M = 7;
const TRACE_MIN_MS = 900;
const TRACE_MAX_MS = 2600;
/** El trazo terminado queda visible un momento antes de apagarse [ms]. */
const TRACE_HOLD_MS = 450;

export type RevealKind = 'drill' | 'charge';

interface Entry {
  start: number;
  kind: RevealKind;
  /** La perforación incluye llenar la carga (taladro nuevo ya cargado). */
  filled: boolean;
  /** Ya se avisó que empezó. */
  shown: boolean;
}

/** Cuánto se ve de un taladro: perforado (0–1 de su largo) y cargado (0–1 desde el fondo). */
export interface HoleReveal {
  drill: number;
  fill: number;
  /** Destello de la onda de tiempos (1 al pasar, 0 nada). */
  flash: number;
  /** Empezó a dibujarse (su símbolo y etiqueta ya se muestran). */
  started: boolean;
}

const DONE: HoleReveal = { drill: 1, fill: 1, flash: 0, started: true };

/** Contorno que se traza (perímetro nuevo) o se borra (perímetro quitado), en coordenadas de render. */
export interface Trace {
  points: readonly { x: number; y: number }[];
  kind: 'add' | 'remove';
  start: number;
  duration: number;
}

function ease(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - x, 3);
}

/**
 * Orden de una perforadora: por fila (la 1 es la del frente) y, dentro de la fila, por columna
 * alternando el sentido. Los taladros sin fila van al final, por etiqueta.
 */
export function drillOrder(holes: readonly Hole[]): Hole[] {
  const label = (h: Hole) => h.label;
  return [...holes].sort((a, b) => {
    const ra = a.row ?? Number.MAX_SAFE_INTEGER;
    const rb = b.row ?? Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    const dir = ra % 2 === 0 ? -1 : 1;
    const ca = a.col ?? 0;
    const cb = b.col ?? 0;
    if (ca !== cb) return (ca - cb) * dir;
    return label(a).localeCompare(label(b), undefined, { numeric: true });
  });
}

export class BuildReveal {
  private readonly entries = new Map<HoleId, Entry>();
  /** Taladros en orden de dibujo (para el cabezal). */
  private readonly order: HoleId[] = [];
  /** Cuándo termina lo programado [ms]. */
  private queueEnd = 0;
  private tie: { start: number; duration: number } | null = null;
  /** Onda de tiempos: cuándo destella cada taladro. */
  private readonly pulses = new Map<HoleId, { start: number; shown: boolean }>();
  private readonly traceList: Trace[] = [];

  get active(): boolean {
    return (
      this.entries.size > 0 ||
      this.tie !== null ||
      this.pulses.size > 0 ||
      this.traceList.length > 0
    );
  }

  has(id: HoleId): boolean {
    return this.entries.has(id);
  }

  kindOf(id: HoleId): RevealKind | null {
    return this.entries.get(id)?.kind ?? null;
  }

  /** Taladros que se están dibujando, destellando o esperan turno. */
  ids(): HoleId[] {
    return [...new Set([...this.entries.keys(), ...this.pulses.keys()])];
  }

  clear(): void {
    this.entries.clear();
    this.order.length = 0;
    this.tie = null;
    this.pulses.clear();
    this.traceList.length = 0;
    this.queueEnd = 0;
  }

  /** Programa un lote de taladros (nuevos o recargados), en el orden dado, desde `now`. */
  schedule(holes: readonly { id: HoleId; filled: boolean }[], kind: RevealKind, now: number): void {
    if (holes.length === 0) return;
    const t0 = Math.max(now, this.queueEnd - 200);
    const step = Math.min(
      STEP_MAX_MS,
      Math.max(STEP_MIN_MS, BATCH_TARGET_MS / Math.max(1, holes.length)),
    );
    holes.forEach((h, i) => {
      this.entries.set(h.id, { start: t0 + i * step, kind, filled: h.filled, shown: false });
      this.order.push(h.id);
    });
    const last = t0 + (holes.length - 1) * step + (kind === 'drill' ? DRILL_MS + FILL_MS : FILL_MS);
    this.queueEnd = Math.max(this.queueEnd, last);
  }

  /** Programa el dibujo del amarre después de lo que ya está en cola. */
  scheduleTie(connections: number, now: number): void {
    if (connections === 0) return;
    const duration = Math.min(
      TIE_MAX_MS,
      Math.max(TIE_MIN_MS, connections * TIE_PER_CONNECTION_MS),
    );
    const start = Math.max(now, this.queueEnd - 300);
    this.tie = { start, duration };
    this.queueEnd = Math.max(this.queueEnd, start + duration);
  }

  /**
   * Onda de tiempos: cada taladro destella cuando le toca disparar (`at` = tiempo de disparo, en
   * cualquier unidad), comprimido a unos segundos.
   */
  schedulePulse(holes: readonly { id: HoleId; at: number }[], now: number): void {
    if (holes.length === 0) return;
    let min = Infinity;
    let max = -Infinity;
    for (const h of holes) {
      min = Math.min(min, h.at);
      max = Math.max(max, h.at);
    }
    const span = max - min;
    const t0 = Math.max(now, this.queueEnd - 200);
    for (const h of holes) {
      const start = t0 + (span > 0 ? ((h.at - min) / span) * PULSE_SPAN_MS : 0);
      this.pulses.set(h.id, { start, shown: false });
    }
    this.queueEnd = Math.max(this.queueEnd, t0 + PULSE_SPAN_MS + PULSE_MS);
  }

  /** Trazo de un contorno: los perímetros nuevos se dibujan antes que sus taladros. */
  scheduleTrace(
    points: readonly { x: number; y: number }[],
    kind: Trace['kind'],
    now: number,
  ): void {
    if (points.length < 2) return;
    let length = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      if (a && b) length += Math.hypot(b.x - a.x, b.y - a.y);
    }
    const duration = Math.min(TRACE_MAX_MS, Math.max(TRACE_MIN_MS, length * TRACE_MS_PER_M));
    const start = kind === 'add' ? Math.max(now, this.queueEnd - 200) : now;
    this.traceList.push({ points, kind, start, duration });
    if (kind === 'add') this.queueEnd = Math.max(this.queueEnd, start + duration);
  }

  /** Trazos en curso con su avance (0–1) y cuánto se ven (se apagan al terminar). */
  traces(now: number): { trace: Trace; progress: number; alpha: number }[] {
    return this.traceList.map((trace) => {
      const t = now - trace.start;
      const progress = Math.min(1, Math.max(0, t / trace.duration));
      const fade = (t - trace.duration) / TRACE_HOLD_MS;
      return { trace, progress, alpha: t < 0 ? 0 : 1 - Math.min(1, Math.max(0, fade)) };
    });
  }

  /** Fracción del amarre dibujada (1 = completo o sin animación). */
  tieProgress(now: number): number {
    if (!this.tie) return 1;
    return Math.min(1, Math.max(0, (now - this.tie.start) / this.tie.duration));
  }

  reveal(id: HoleId, now: number): HoleReveal {
    const p = this.pulses.get(id);
    const tp = p ? (now - p.start) / PULSE_MS : -1;
    const flash = tp >= 0 && tp <= 1 ? 1 - tp : 0;
    const e = this.entries.get(id);
    if (!e) return flash > 0 ? { ...DONE, flash } : DONE;
    const t = now - e.start;
    if (e.kind === 'charge') {
      return { drill: 1, fill: ease(t / FILL_MS), flash, started: true };
    }
    const drill = ease(t / DRILL_MS);
    const fill = e.filled ? ease((t - DRILL_MS) / FILL_MS) : 1;
    return { drill, fill, flash, started: t >= 0 };
  }

  /** ¿El taladro tiene algo animado (dibujo o destello)? */
  animating(id: HoleId): boolean {
    return this.entries.has(id) || this.pulses.has(id);
  }

  /**
   * Avanza el reloj: quita lo terminado y devuelve los taladros que empezaron en este cuadro (para
   * mostrar su etiqueta) y si algo cambió.
   */
  advance(now: number): { started: HoleId[]; finished: HoleId[]; pulsed: HoleId[] } {
    const started: HoleId[] = [];
    const finished: HoleId[] = [];
    const pulsed: HoleId[] = [];
    for (const [id, p] of this.pulses) {
      const t = now - p.start;
      if (t >= 0 && !p.shown) {
        p.shown = true;
        pulsed.push(id);
      }
      if (t > PULSE_MS) {
        this.pulses.delete(id);
        if (!this.entries.has(id)) finished.push(id);
      }
    }
    for (let i = this.traceList.length - 1; i >= 0; i--) {
      const tr = this.traceList[i];
      if (tr && now > tr.start + tr.duration + TRACE_HOLD_MS) this.traceList.splice(i, 1);
    }
    for (const [id, e] of this.entries) {
      const t = now - e.start;
      const total = e.kind === 'charge' ? FILL_MS : DRILL_MS + (e.filled ? FILL_MS : 0);
      if (t >= total) {
        this.entries.delete(id);
        finished.push(id);
      }
      if (t >= 0 && !e.shown) {
        e.shown = true;
        started.push(id);
      }
    }
    if (this.entries.size === 0) this.order.length = 0;
    if (this.tie && now >= this.tie.start + this.tie.duration) this.tie = null;
    return { started, finished, pulsed };
  }

  /** Taladro que se está dibujando ahora (el último que empezó), para el cabezal y la cámara. */
  current(now: number): HoleId | null {
    let best: HoleId | null = null;
    let bestStart = -Infinity;
    for (const id of this.order) {
      const e = this.entries.get(id);
      if (!e || e.start > now) continue;
      if (e.start > bestStart) {
        bestStart = e.start;
        best = id;
      }
    }
    return best;
  }

  /** ¿Hay que ocultar el símbolo del taladro (todavía no empezó)? */
  hidden(id: HoleId, now: number): boolean {
    const e = this.entries.get(id);
    return e?.kind === 'drill' && now < e.start;
  }
}
