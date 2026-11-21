import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import serviceWorker from './pwa/vite-plugin-sw.js';

export default defineConfig({
  plugins: [react(), serviceWorker()],
  server: {
    port: 5173,
    // Forward API calls, uploaded photos and the Socket.IO connection to the Express backend.
    proxy: {
      '/api': 'http://localhost:5000',
      '/uploads': 'http://localhost:5000',
      '/socket.io': { target: 'http://localhost:5000', ws: true },
    },
  },
});
