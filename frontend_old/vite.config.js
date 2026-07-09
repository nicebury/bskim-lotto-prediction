import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 1989,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:8002',
      '/sitemap.xml': 'http://localhost:8002',
      '/robots.txt': 'http://localhost:8002',
    },
  },
});
