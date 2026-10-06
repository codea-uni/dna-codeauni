import { afterEach, describe, expect, it, vi } from 'vitest';
import { RenderLoop } from './RenderLoop';

describe('loop de render en XR', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('en XR dibuja con setAnimationLoop y al salir vuelve al render a demanda', () => {
    const raf = vi.fn(() => 1);
    vi.stubGlobal('requestAnimationFrame', raf);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const render = vi.fn();
    const loop = new RenderLoop(render);
    const xr: { tick: ((t: number) => void) | null } = { tick: null };
    const host = {
      setAnimationLoop: vi.fn((cb: ((t: number) => void) | null) => {
        xr.tick = cb;
      }),
    };

    loop.setXr(host);
    loop.invalidate();
    expect(raf).not.toHaveBeenCalled();
    xr.tick?.(16);
    xr.tick?.(32);
    expect(render).toHaveBeenCalledTimes(2);

    loop.setXr(null);
    expect(host.setAnimationLoop).toHaveBeenLastCalledWith(null);
    expect(raf).toHaveBeenCalledTimes(1);
  });
});
