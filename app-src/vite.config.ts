import { defineConfig, loadEnv, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { createReadStream, statSync } from 'node:fs';
import { resolve } from 'node:path';

// dev 전용: ../ (runto-online 루트)의 정적 파일(랜딩/about/member/...)을 같은 origin에서 서빙.
// 배포 시엔 Cloudflare Pages 가 루트를 서빙하므로 dev-only.
function landingPagePlugin(appBase: string): PluginOption {
  const landingRoot = resolve(__dirname, '..');
  const MIME: Record<string, string> = {
    html: 'text/html; charset=utf-8',
    css: 'text/css; charset=utf-8',
    js: 'text/javascript; charset=utf-8',
    mjs: 'text/javascript; charset=utf-8',
    json: 'application/json; charset=utf-8',
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    ico: 'image/x-icon',
    webp: 'image/webp',
    woff: 'font/woff',
    woff2: 'font/woff2',
  };
  const appPrefix = appBase.replace(/\/$/, ''); // '/app' or '/app-test'
  return {
    name: 'serve-landing',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || '';
        if (
          url.startsWith(`${appPrefix}/`) ||
          url.startsWith('/@') ||
          url.startsWith('/node_modules/') ||
          url.startsWith('/src/') ||
          url === appPrefix
        ) return next();

        let p = url.split('?')[0];
        if (p === '/' || p === '') p = '/index.html';
        const filePath = resolve(landingRoot, '.' + p);
        if (!filePath.startsWith(landingRoot)) return next();
        try {
          const st = statSync(filePath);
          if (!st.isFile()) return next();
        } catch {
          return next();
        }
        const ext = p.split('.').pop()?.toLowerCase() || '';
        res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
        createReadStream(filePath).pipe(res);
      });
    },
  };
}

// mode 별 빌드:
//   vite build           → prod  (.env.production → ../app)
//   vite build --mode test → test (.env.test     → ../app-test)
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  const appBase = env.VITE_APP_BASE || '/app/';       // '/app/' | '/app-test/'
  const isTest = env.VITE_IS_TEST_BUILD === '1';
  const outDir = isTest ? '../app-test' : '../app';
  const pwaName = isTest ? 'nfind [TEST] — 아파트 매물관리시스템' : 'nfind — 아파트 매물관리시스템';
  const pwaShort = isTest ? 'nfind-test' : 'nfind';

  return {
    base: appBase,
    plugins: [
      landingPagePlugin(appBase),
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg'],
        manifest: {
          name: pwaName,
          short_name: pwaShort,
          description: '아파트 매물관리시스템',
          start_url: appBase,
          scope: appBase,
          display: 'standalone',
          background_color: '#ffffff',
          theme_color: isTest ? '#e74c3c' : '#6c5ce7',
          icons: [
            { src: `${appBase}pwa-192.png`, sizes: '192x192', type: 'image/png' },
            { src: `${appBase}pwa-512.png`, sizes: '512x512', type: 'image/png' },
          ],
        },
        workbox: {
          navigateFallback: `${appBase}index.html`,
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        },
      }),
    ],
    build: {
      outDir,
      emptyOutDir: true,
      target: 'es2020',
    },
    server: {
      port: 5173,
      strictPort: true,
    },
  };
});
