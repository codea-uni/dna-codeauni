import { createComputeClient } from '@blastlab/workers';
import { useEffect } from 'react';
import { useUiStore } from './stores/uiStore';
import { Viewport } from './viewport/Viewport';

export function App() {
  const fps = useUiStore((s) => s.fps);
  const workerStatus = useUiStore((s) => s.workerStatus);

  useEffect(() => {
    const client = createComputeClient();
    const { setWorkerStatus } = useUiStore.getState();
    client.api
      .ping('BlastLab')
      .then((reply) => {
        console.info(`[worker] ${reply}`);
        setWorkerStatus(reply);
      })
      .catch((err: unknown) => {
        console.error('[worker] error', err);
        setWorkerStatus('error');
      });
    return () => {
      client.terminate();
    };
  }, []);

  return (
    <div className="app">
      <Viewport />
      <footer className="statusbar">
        <span>BlastLab</span>
        <span>Worker: {workerStatus}</span>
        <span>{fps.toFixed(0)} fps</span>
      </footer>
    </div>
  );
}
