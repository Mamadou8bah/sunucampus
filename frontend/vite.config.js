import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import serviceWorker from './pwa/vite-plugin-sw.js';

const backend = process.env.SUNUCAMPUS_API_PROXY || 'http://localhost:5000';

export default defineConfig({
  plugins: [react(), serviceWorker()],
  server: {
    port: 5173,
    // Forward API calls, uploaded photos and the Socket.IO connection to the Express backend.
    proxy: {
      '/api': backend,
      '/uploads': backend,
      '/socket.io': { target: backend, ws: true },
    },
  },
});
