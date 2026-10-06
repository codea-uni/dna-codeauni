import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  worker: {
    format: 'es',
  },
  server: {
    // Con VITE_API_URL=/api, el servidor de desarrollo pasa la API a `pnpm dev:server` (mismo origen).
    // `ws`: la sala de presentación en VR usa WebSocket (D-19).
    proxy: {
      '/api': { target: process.env.CRONOS_API_PROXY ?? 'http://localhost:3000', ws: true },
    },
  },
});
