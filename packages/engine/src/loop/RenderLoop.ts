export interface FrameStats {
  /** Frames por segundo durante la actividad reciente. */
  fps: number;
  /** Tiempo de CPU medio por frame (JS + envío de comandos a la GPU) [ms]. */
  cpuMs: number;
}

/** Hueco entre frames a partir del cual se considera que la vista estaba en reposo. */
const IDLE_GAP_MS = 250;
const WINDOW_MS = 500;

/**
 * Loop de render propio con requestAnimationFrame, a demanda:
 * solo agenda un frame cuando algo lo invalida. Las estadísticas se miden solo
 * sobre ráfagas de actividad continua (en reposo no hay frames que medir).
 */
export class RenderLoop {
  private frameHandle: number | null = null;
  private disposed = false;
  private frames = 0;
  private cpuTotal = 0;
  private windowStart = 0;
  private lastFrame = -Infinity;

  constructor(
    private readonly renderFrame: () => void,
    private readonly onStats?: (stats: FrameStats) => void,
  ) {}

  /** Marca el frame como sucio; se renderiza en el próximo rAF. */
  invalidate(): void {
    if (this.frameHandle !== null || this.disposed) return;
    this.frameHandle = requestAnimationFrame(this.tick);
  }

  dispose(): void {
    this.disposed = true;
    if (this.frameHandle !== null) cancelAnimationFrame(this.frameHandle);
    this.frameHandle = null;
  }

  private readonly tick = (now: number): void => {
    this.frameHandle = null;
    const t0 = performance.now();
    this.renderFrame();
    const cpu = performance.now() - t0;

    if (now - this.lastFrame > IDLE_GAP_MS) {
      this.frames = 0;
      this.cpuTotal = 0;
      this.windowStart = now;
    } else {
      this.frames++;
      this.cpuTotal += cpu;
      const elapsed = now - this.windowStart;
      if (elapsed >= WINDOW_MS && this.frames >= 5) {
        this.onStats?.({ fps: (this.frames * 1000) / elapsed, cpuMs: this.cpuTotal / this.frames });
        this.frames = 0;
        this.cpuTotal = 0;
        this.windowStart = now;
      }
    }
    this.lastFrame = now;
  };
}
