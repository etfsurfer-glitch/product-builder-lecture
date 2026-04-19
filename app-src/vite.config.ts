import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { createReadStream, statSync } from 'node:fs';
import { resolve } from 'node:path';

// dev 전용: ../ (runto-online 루트)의 정적 파일(랜딩/about/member/...)을 같은 origin에서 서빙.
// 배포 시엔 Cloudflare Pages 가 루트를 서빙하므로 dev-only.
function landingPagePlugin(): PluginOption {
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
  return {
    name: 'serve-landing',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || '';
        // Vite 가 처리할 경로들은 패스
        if (
          url.startsWith('/app/') ||
          url.startsWith('/@') ||
          url.startsWith('/node_modules/') ||
          url.startsWith('/src/') ||
          url === '/app' // → Vite 가 /app/ 로 리다이렉트
        ) return next();

        let p = url.split('?')[0];
        if (p === '/' || p === '') p = '/index.html';
        const filePath = resolve(landingRoot, '.' + p);
        if (!filePath.startsWith(landingRoot)) return next(); // 경로 탈출 방지
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

// /app/ 아래 서빙. 빌드 결과는 ../app 에 저장 (git 커밋 대상).
export default defineConfig({
  base: '/app/',
  plugins: [
    landingPagePlugin(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'nfind — 아파트 매물관리시스템',
        short_name: 'nfind',
        description: '아파트 매물관리시스템',
        start_url: '/app/',
        scope: '/app/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#6c5ce7',
        icons: [
          { src: '/app/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/app/pwa-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        navigateFallback: '/app/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
    }),
  ],
  build: {
    outDir: '../app',
    emptyOutDir: true,
    target: 'es2020',
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
