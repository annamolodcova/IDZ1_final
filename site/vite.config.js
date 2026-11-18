import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const siteDbPath = path.resolve(__dirname, 'career-diary.sqlite');
const rootDbPath = path.resolve(__dirname, '..', 'career-diary.sqlite');

function sqliteSyncPlugin() {
  const handleDbMiddleware = (req, res, next) => {
    const rawUrl = req.url || '';
    const cleanUrl = rawUrl.split('?')[0];

    if (cleanUrl === '/api/db') {
      if (req.method === 'GET' || req.method === 'HEAD') {
        const targetPath = fs.existsSync(siteDbPath)
          ? siteDbPath
          : fs.existsSync(rootDbPath)
          ? rootDbPath
          : null;

        if (targetPath) {
          try {
            const data = fs.readFileSync(targetPath);
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Length', data.length);
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.statusCode = 200;
            if (req.method === 'HEAD') {
              res.end();
            } else {
              res.end(data);
            }
            return;
          } catch (readErr) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: readErr.message }));
            return;
          }
        }

        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'DB file not found' }));
        return;
      }

      if (req.method === 'POST') {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => {
          try {
            const buffer = Buffer.concat(chunks);
            // Атомарная запись через временный файл
            const tempPath = `${siteDbPath}.tmp`;
            fs.writeFileSync(tempPath, buffer);
            fs.renameSync(tempPath, siteDbPath);

            try {
              fs.writeFileSync(rootDbPath, buffer);
            } catch {
              // Игнорируем, если корень не доступен для прямой записи
            }

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, size: buffer.length }));
          } catch (writeErr) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: writeErr.message }));
          }
        });
        return;
      }
    }

    if (cleanUrl === '/api/db/status') {
      const exists = fs.existsSync(siteDbPath) || fs.existsSync(rootDbPath);
      const target = fs.existsSync(siteDbPath) ? siteDbPath : rootDbPath;
      const size = exists ? fs.statSync(target).size : 0;

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          ok: true,
          exists,
          size,
          path: 'career-diary.sqlite',
        }),
      );
      return;
    }

    next();
  };

  return {
    name: 'sqlite-local-file-sync',
    configureServer(server) {
      server.middlewares.use(handleDbMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handleDbMiddleware);
    },
  };
}

export default defineConfig({
  plugins: [react(), sqliteSyncPlugin()],
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
