// Empaqueta el servidor en dist/ con todas sus dependencias (también los paquetes internos, que se
// consumen desde el fuente TS). La imagen de producción solo necesita Node y este directorio.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/main.ts', 'src/migrate.ts'],
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: true,
  // pg carga el cliente nativo solo si está instalado; no se usa.
  external: ['pg-native'],
  // Dependencias CommonJS dentro de un bundle ESM necesitan `require`.
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  logLevel: 'warning',
});
