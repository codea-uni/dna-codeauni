import { AxesHelper, Color, OrthographicCamera, Scene, WebGLRenderer } from 'three';
import type { PlanViewState } from './cameras/planView';
import { PlanControls } from './controls/PlanControls';
import { createGrid } from './layers/grid';
import { RenderLoop } from './loop/RenderLoop';

export interface EngineOptions {
  /** Se llama ~1 vez por segundo mientras haya frames renderizados. */
  onFps?: (fps: number) => void;
}

/**
 * Fachada del motor de render. Imperativo y desacoplado de React:
 * la app lo crea una vez sobre un canvas y le envía comandos.
 */
export class Engine {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera();
  private readonly loop: RenderLoop;
  private readonly controls: PlanControls;
  private readonly resizeObserver: ResizeObserver;
  private view: PlanViewState = { centerX: 0, centerY: 0, metersPerPixel: 0.25 };
  private width = 1;
  private height = 1;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    options: EngineOptions = {},
  ) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene.background = new Color(0x161b22);

    // Planta: cámara sobre el plano mirando hacia -Z, Norte (+Y) arriba.
    this.camera.position.set(0, 0, 10_000);
    this.camera.near = 0.1;
    this.camera.far = 20_000;
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(0, 0, 0);

    this.scene.add(createGrid());
    this.scene.add(new AxesHelper(20));

    this.loop = new RenderLoop(() => {
      this.renderer.render(this.scene, this.camera);
    }, options.onFps);

    this.controls = new PlanControls(
      canvas,
      () => this.view,
      (view) => {
        this.setPlanView(view);
      },
    );

    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
    });
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  getPlanView(): PlanViewState {
    return this.view;
  }

  setPlanView(view: PlanViewState): void {
    this.view = view;
    this.updateCamera();
  }

  dispose(): void {
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.loop.dispose();
    this.renderer.dispose();
  }

  private resize(): void {
    this.width = Math.max(1, this.canvas.clientWidth);
    this.height = Math.max(1, this.canvas.clientHeight);
    this.renderer.setSize(this.width, this.height, false);
    this.updateCamera();
  }

  private updateCamera(): void {
    const halfW = (this.width / 2) * this.view.metersPerPixel;
    const halfH = (this.height / 2) * this.view.metersPerPixel;
    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.position.x = this.view.centerX;
    this.camera.position.y = this.view.centerY;
    this.camera.updateProjectionMatrix();
    this.loop.invalidate();
  }
}
