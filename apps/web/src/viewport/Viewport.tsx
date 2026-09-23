import { Engine } from '@blastlab/engine';
import { useEffect, useRef } from 'react';
import { useUiStore } from '../stores/uiStore';

/** Monta el canvas y crea el Engine una sola vez. React no vuelve a tocar el render. */
export function Viewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new Engine(canvas, {
      onFps: (fps) => {
        useUiStore.getState().setFps(fps);
      },
    });
    return () => {
      engine.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className="viewport" />;
}
