import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const shortBaseUrl = (process.env.SHORT_BASE_URL ?? 'https://synerry-redirect.onrender.com').replace(/\/+$/, '');

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __SHORT_BASE_URL__: JSON.stringify(shortBaseUrl) },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://localhost:3001' },
  },
});
