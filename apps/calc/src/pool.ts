/**
 * Grupo de procesos de cálculo (worker_threads): cada corrida va a un hilo libre, así una pila
 * pesada no frena a las demás. Cola FIFO, tiempo máximo por corrida (el hilo que se pasa se
 * termina y se reemplaza) y reinicio si un hilo se cae.
 */
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import type { Signature } from './guard';
import { runModule, InputError, type ModuleName, type RunRequest } from './modules';

export interface JobResult {
  ok: boolean;
  result?: unknown;
  /** Parámetros del diseño de la corrida (para detectar barridos); no sale del servicio. */
  signature?: Signature;
  error?: { code: string; message: string };
  /** Tiempo de cálculo dentro del hilo [ms] (sin la espera en cola). */
  ms: number;
}

export interface Executor {
  run(module: ModuleName, request: RunRequest): Promise<JobResult>;
  /** Corridas esperando un hilo libre y hilos ocupados (para /healthz y la prueba de carga). */
  stats(): { size: number; busy: number; queued: number };
  close(): Promise<void>;
}

/** Ejecuta en el mismo hilo (pruebas y depuración). */
export class InlineExecutor implements Executor {
  run(module: ModuleName, request: RunRequest): Promise<JobResult> {
    return Promise.resolve(execute(module, request));
  }
  stats() {
    return { size: 0, busy: 0, queued: 0 };
  }
  close() {
    return Promise.resolve();
  }
}

/** Lo que hace un hilo con una corrida (también lo usa `InlineExecutor`). */
export function execute(module: ModuleName, request: RunRequest): JobResult {
  const t0 = performance.now();
  try {
    const { result, signature } = runModule(module, request);
    return { ok: true, result, signature, ms: performance.now() - t0 };
  } catch (e) {
    const ms = performance.now() - t0;
    if (e instanceof InputError)
      return { ok: false, error: { code: e.code, message: e.message }, ms };
    return {
      ok: false,
      error: { code: 'calc_error', message: e instanceof Error ? e.message : 'Error de cálculo' },
      ms,
    };
  }
}

interface Job {
  id: number;
  module: ModuleName;
  request: RunRequest;
  resolve: (r: JobResult) => void;
}

interface Slot {
  worker: Worker;
  job: Job | null;
  timer: NodeJS.Timeout | null;
}

export interface ThreadPoolOptions {
  size?: number;
  /** Tiempo máximo de una corrida [ms]. */
  timeoutMs?: number;
  /** Corridas en cola como máximo; con más, se rechaza (el agente reintenta). */
  maxQueue?: number;
}

export class ThreadPool implements Executor {
  private readonly slots: Slot[] = [];
  private readonly queue: Job[] = [];
  private seq = 0;
  private closed = false;
  readonly size: number;
  private readonly timeoutMs: number;
  private readonly maxQueue: number;
  private readonly workerUrl: URL;

  constructor(opts: ThreadPoolOptions = {}) {
    this.size = Math.max(1, opts.size ?? Math.max(1, availableParallelism() - 1));
    this.timeoutMs = opts.timeoutMs ?? 60_000;
    this.maxQueue = opts.maxQueue ?? 200;
    // En desarrollo (tsx) el hilo es el .ts; en producción, el bundle de dist/.
    this.workerUrl = new URL(
      import.meta.url.endsWith('.ts') ? './worker.ts' : './worker.js',
      import.meta.url,
    );
    for (let i = 0; i < this.size; i++) this.slots.push(this.spawn());
  }

  private spawn(): Slot {
    const slot: Slot = { worker: new Worker(this.workerUrl), job: null, timer: null };
    slot.worker.on('message', (msg: { id: number } & JobResult) => {
      if (slot.job?.id !== msg.id) return;
      this.finish(slot, {
        ok: msg.ok,
        ms: msg.ms,
        ...(msg.result !== undefined ? { result: msg.result } : {}),
        ...(msg.signature ? { signature: msg.signature } : {}),
        ...(msg.error ? { error: msg.error } : {}),
      });
    });
    slot.worker.on('error', (err: unknown) => {
      this.replace(slot, {
        code: 'calc_crash',
        message: err instanceof Error ? err.message : 'El proceso de cálculo falló.',
      });
    });
    slot.worker.on('exit', (code) => {
      if (!this.closed && code !== 0)
        this.replace(slot, {
          code: 'calc_crash',
          message: `El proceso de cálculo terminó (${String(code)}).`,
        });
    });
    return slot;
  }

  private finish(slot: Slot, r: JobResult) {
    if (slot.timer) clearTimeout(slot.timer);
    const job = slot.job;
    slot.job = null;
    slot.timer = null;
    job?.resolve(r);
    this.pump();
  }

  /** El hilo se colgó o se cayó: se responde la corrida con error y se pone otro en su lugar. */
  private replace(slot: Slot, error: { code: string; message: string }) {
    const i = this.slots.indexOf(slot);
    if (i < 0) return;
    const job = slot.job;
    if (slot.timer) clearTimeout(slot.timer);
    slot.job = null;
    void slot.worker.terminate();
    if (this.closed) return;
    this.slots[i] = this.spawn();
    job?.resolve({ ok: false, error, ms: this.timeoutMs });
    this.pump();
  }

  private pump() {
    for (const slot of this.slots) {
      if (slot.job || !this.queue.length) continue;
      const job = this.queue.shift();
      if (!job) return;
      slot.job = job;
      slot.timer = setTimeout(() => {
        this.replace(slot, {
          code: 'calc_timeout',
          message: `La corrida superó ${String(this.timeoutMs / 1000)} s.`,
        });
      }, this.timeoutMs);
      slot.worker.postMessage({ id: job.id, module: job.module, request: job.request });
    }
  }

  run(module: ModuleName, request: RunRequest): Promise<JobResult> {
    if (this.closed)
      return Promise.resolve({
        ok: false,
        error: { code: 'closed', message: 'Servicio cerrándose.' },
        ms: 0,
      });
    if (this.queue.length >= this.maxQueue)
      return Promise.resolve({
        ok: false,
        error: {
          code: 'busy',
          message: 'Demasiadas corridas en cola; reintenta en unos segundos.',
        },
        ms: 0,
      });
    return new Promise((resolve) => {
      this.queue.push({ id: ++this.seq, module, request, resolve });
      this.pump();
    });
  }

  stats() {
    return {
      size: this.size,
      busy: this.slots.filter((s) => s.job).length,
      queued: this.queue.length,
    };
  }

  async close() {
    this.closed = true;
    await Promise.all(this.slots.map((s) => s.worker.terminate()));
  }
}
