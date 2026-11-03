import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // En desarrollo, las llamadas a /api se redirigen al servidor Express.
    proxy: {
      '/api': 'http://127.0.0.1:3000',
    },
  },
});
