import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api/hh': {
        target: 'https://api.hh.ru',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/hh/, ''),
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, _req, _res) => {
            // hh.ru отдаёт 403 на нестандартные User-Agent из браузерных сценариев.
            proxyReq.setHeader(
              'User-Agent',
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
            );
            proxyReq.setHeader('Accept', 'application/json');
          });
        },
      },
    },
  },
  build: {
    // Ensure sql.js WASM file is copied to dist
    assetsInlineLimit: 0,
  },
});