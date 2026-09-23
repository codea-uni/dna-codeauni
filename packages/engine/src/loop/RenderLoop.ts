/**
 * Loop de render propio con requestAnimationFrame, a demanda:
 * solo agenda un frame cuando algo lo invalida.
 */
export class RenderLoop {
  private frameHandle: number | null = null;
  private disposed = false;
  private framesInWindow = 0;
  private windowStart = performance.now();

  constructor(
    private readonly renderFrame: () => void,
    private readonly onFps?: (fps: number) => void,
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
    this.renderFrame();
    this.framesInWindow++;
    const elapsed = now - this.windowStart;
    if (elapsed >= 1000) {
      this.onFps?.((this.framesInWindow * 1000) / elapsed);
      this.framesInWindow = 0;
      this.windowStart = now;
    }
  };
}
