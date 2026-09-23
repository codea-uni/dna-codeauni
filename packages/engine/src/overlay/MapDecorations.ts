import { cardinal, measure, type Vec2 } from '@blastlab/core';
import { formatCoordinate, formatDistance, niceStep, scaleBar, ticks } from '../cameras/mapScale';
import { compassRotationDeg } from './compass';

export interface DecorationSettings {
  grid: boolean;
  rulers: boolean;
  scaleBar: boolean;
  compass: boolean;
}

export const DEFAULT_DECORATIONS: DecorationSettings = {
  grid: true,
  rulers: true,
  scaleBar: true,
  compass: true,
};

const STYLE_ID = 'bl-map-style';
const CSS = `
.bl-map [hidden] { display: none !important; }
.bl-map { position: absolute; inset: 0; pointer-events: none; font: 10.5px ui-monospace, Menlo, Consolas, monospace; color: #c9d1d9; overflow: hidden; }
.bl-ruler { position: absolute; background: #0d1117c0; }
.bl-ruler.top { left: 22px; right: 0; top: 0; height: 20px; border-bottom: 1px solid #30363d; }
.bl-ruler.left { top: 20px; bottom: 0; left: 0; width: 22px; border-right: 1px solid #30363d; }
.bl-corner { position: absolute; left: 0; top: 0; width: 22px; height: 20px; background: #0d1117e0; border-right: 1px solid #30363d; border-bottom: 1px solid #30363d; font-size: 9px; color: #8b949e; display: grid; place-items: center; }
.bl-tick { position: absolute; white-space: nowrap; color: #8b949e; }
.bl-ruler.top .bl-tick { top: 0; height: 20px; border-left: 1px solid #58a6ff88; padding: 3px 0 0 3px; }
.bl-ruler.left .bl-tick { left: 0; width: 22px; border-top: 1px solid #58a6ff88; }
.bl-ruler.left .bl-tick span { position: absolute; left: 4px; top: 3px; transform-origin: 0 0; transform: rotate(90deg) translate(0, -12px); }
.bl-scale { position: absolute; left: 34px; bottom: 12px; padding: 4px 6px; background: #0d1117c0; border: 1px solid #30363d; border-radius: 4px; }
.bl-scale .bar { height: 5px; margin-top: 3px; border: 1.5px solid #c9d1d9; border-top: 0; background: linear-gradient(to right, #c9d1d9 50%, transparent 50%); }
.bl-scale small { display: block; color: #8b949e; font-size: 9.5px; margin-top: 2px; }
.bl-compass { position: absolute; right: 12px; top: 30px; width: 58px; height: 58px; }
.bl-measure { position: absolute; padding: 3px 6px; background: #0d1117e8; border: 1px solid #58d0ff; border-radius: 4px; color: #e6edf3; white-space: nowrap; transform: translate(10px, -130%); }
.bl-measure b { color: #58d0ff; font-weight: 600; }
`;

const COMPASS_SVG = `
<svg viewBox="-30 -30 60 60" width="58" height="58" aria-label="Brújula">
  <circle r="27" fill="#0d1117d0" stroke="#30363d"/>
  <g class="bl-rose">
    <path d="M0,-21 L5,0 L0,4 L-5,0 Z" fill="#ff5a4e"/>
    <path d="M0,21 L5,0 L0,-4 L-5,0 Z" fill="#8b949e"/>
    <text y="-22" dy="-0.2em" text-anchor="middle" font-size="9" font-weight="700" fill="#ff5a4e">N</text>
    <text y="22" dy="0.95em" text-anchor="middle" font-size="8" fill="#c9d1d9">S</text>
    <text x="23" dy="0.35em" text-anchor="start" font-size="8" fill="#c9d1d9">E</text>
    <text x="-23" dy="0.35em" text-anchor="end" font-size="8" fill="#c9d1d9">O</text>
  </g>
</svg>`;

export interface PlanFrame {
  /** Coordenadas de proyecto en los bordes de la vista [m]. */
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  metersPerPixel: number;
  width: number;
  height: number;
  /** Paso de la grilla menor [m]. */
  gridStep: number;
}

/**
 * Decoraciones del mapa como capa DOM liviana sobre el canvas (no React): reglas con coordenadas
 * Este/Norte, barra de escala con el paso de la grilla, brújula y etiqueta de medición.
 * Reutiliza los nodos de las marcas para que actualizar en cada frame de pan sea barato.
 */
export class MapDecorations {
  readonly root: HTMLDivElement;
  private readonly top: HTMLDivElement;
  private readonly left: HTMLDivElement;
  private readonly corner: HTMLDivElement;
  private readonly scale: HTMLDivElement;
  private readonly compass: HTMLDivElement;
  private readonly rose: SVGGElement | null;
  private readonly measureLabel: HTMLDivElement;
  private readonly topTicks: HTMLDivElement[] = [];
  private readonly leftTicks: HTMLDivElement[] = [];
  private settings: DecorationSettings = DEFAULT_DECORATIONS;
  private mode: 'plan' | '3d' = 'plan';

  constructor(host: HTMLElement) {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    const div = (cls: string, parent: HTMLElement) => {
      const d = document.createElement('div');
      d.className = cls;
      parent.appendChild(d);
      return d;
    };
    this.root = div('bl-map', host);
    this.top = div('bl-ruler top', this.root);
    this.left = div('bl-ruler left', this.root);
    this.corner = div('bl-corner', this.root);
    this.corner.textContent = 'm';
    this.corner.title = 'Coordenadas del proyecto: Este (arriba) y Norte (izquierda)';
    this.scale = div('bl-scale', this.root);
    this.compass = div('bl-compass', this.root);
    this.compass.innerHTML = COMPASS_SVG;
    this.rose = this.compass.querySelector('.bl-rose');
    this.measureLabel = div('bl-measure', this.root);
    this.measureLabel.hidden = true;
  }

  /** Espacio que ocupan las reglas (izquierda, arriba) en px, para encuadrar sin tapar datos. */
  get rulerInset(): { left: number; top: number } {
    return this.mode === 'plan' && this.settings.rulers
      ? { left: 22, top: 20 }
      : { left: 0, top: 0 };
  }

  setSettings(settings: DecorationSettings): void {
    this.settings = settings;
    this.applyVisibility();
  }

  setMode(mode: 'plan' | '3d'): void {
    this.mode = mode;
    this.applyVisibility();
  }

  /** Actualiza reglas y escala para la vista en planta. */
  updatePlan(f: PlanFrame): void {
    if (this.mode !== 'plan') return;
    if (this.settings.rulers) {
      // Marcas con al menos ~90 px (Este) y ~70 px (Norte) entre sí.
      const stepX = niceStep(90 * f.metersPerPixel);
      const xs = ticks(f.minX, f.maxX, stepX);
      this.fill(
        this.top,
        this.topTicks,
        xs,
        (v) => (v - f.minX) / f.metersPerPixel,
        (v) => formatCoordinate(v, stepX),
        'left',
      );
      const stepY = niceStep(70 * f.metersPerPixel);
      const ys = ticks(f.minY, f.maxY, stepY);
      this.fill(
        this.left,
        this.leftTicks,
        ys,
        (v) => (f.maxY - v) / f.metersPerPixel,
        (v) => formatCoordinate(v, stepY),
        'top',
      );
    }
    if (this.settings.scaleBar) {
      const bar = scaleBar(f.metersPerPixel, 120);
      this.scale.innerHTML = `${formatDistance(bar.meters)}<div class="bar" style="width:${bar.pixels.toFixed(1)}px"></div>${
        this.settings.grid
          ? `<small>grilla ${formatDistance(f.gridStep)} · ${formatDistance(f.gridStep * 10)}</small>`
          : ''
      }`;
    }
    this.setCompass(0);
  }

  /** Brújula en 3D según el rumbo de la cámara. */
  update3d(yaw: number): void {
    this.setCompass(compassRotationDeg('3d', yaw));
  }

  /** Etiqueta de medición junto a `screen`; null la oculta. */
  setMeasure(a: Vec2 | null, b: Vec2 | null, screen: { x: number; y: number } | null): void {
    if (!a || !b || !screen) {
      this.measureLabel.hidden = true;
      return;
    }
    const m = measure(a, b);
    const az = (m.azimuth * 180) / Math.PI;
    const c = (v: number, d: number) => v.toFixed(d).replace('.', ',').replace('-', '−');
    this.measureLabel.innerHTML = `<b>${formatDistance(m.distance)}</b> · ${c(az, 1)}° ${cardinal(m.azimuth)} · ΔE ${c(m.dx, 2)} · ΔN ${c(m.dy, 2)}`;
    this.measureLabel.style.left = `${screen.x}px`;
    this.measureLabel.style.top = `${screen.y}px`;
    this.measureLabel.hidden = false;
  }

  dispose(): void {
    this.root.remove();
  }

  private setCompass(deg: number): void {
    this.rose?.setAttribute('transform', `rotate(${deg.toFixed(1)})`);
  }

  private applyVisibility(): void {
    const plan = this.mode === 'plan';
    this.top.hidden = !plan || !this.settings.rulers;
    this.left.hidden = !plan || !this.settings.rulers;
    this.corner.hidden = !plan || !this.settings.rulers;
    this.scale.hidden = !plan || !this.settings.scaleBar;
    this.compass.hidden = !this.settings.compass;
    this.compass.style.top = plan && this.settings.rulers ? '30px' : '10px';
    if (!plan) this.measureLabel.hidden = true;
  }

  private fill(
    strip: HTMLDivElement,
    pool: HTMLDivElement[],
    values: number[],
    toPx: (v: number) => number,
    label: (v: number) => string,
    prop: 'left' | 'top',
  ): void {
    while (pool.length < values.length) {
      const d = document.createElement('div');
      d.className = 'bl-tick';
      d.appendChild(document.createElement('span'));
      strip.appendChild(d);
      pool.push(d);
    }
    pool.forEach((d, i) => {
      const v = values[i];
      if (v === undefined) {
        d.hidden = true;
        return;
      }
      d.hidden = false;
      d.style[prop] = `${toPx(v).toFixed(1)}px`;
      const span = d.firstChild as HTMLSpanElement;
      const text = label(v);
      if (span.textContent !== text) span.textContent = text;
    });
  }
}
