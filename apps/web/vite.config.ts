import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  worker: {
    format: 'es',
  },
  server: {
    // Con VITE_API_URL=/api, el servidor de desarrollo pasa la API a `pnpm dev:server` (mismo origen).
    proxy: { '/api': process.env.CRONOS_API_PROXY ?? 'http://localhost:3000' },
  },
});
