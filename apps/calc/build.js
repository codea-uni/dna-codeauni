// Empaqueta el servicio de cálculo en dist/ (el hilo principal y el de los procesos de cálculo).
// Como el servidor: los paquetes internos se consumen desde el fuente TS.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/main.ts', 'src/worker.ts'],
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: true,
  external: ['pg-native'],
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  logLevel: 'warning',
});
