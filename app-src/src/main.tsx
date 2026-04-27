import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { setUnauthorizedHandler, serverLogout, API_HOSTS, getActiveApiHost } from './lib/api';
import { signOut, goToLanding } from './lib/auth';
import { startHealthPinger, getHealthSnapshot } from './lib/health';

// 토큰 만료(401) 시 자동 로그아웃 + 랜딩 페이지로 이동
setUnauthorizedHandler(async () => {
  try { await serverLogout(null); } catch { /* swallow */ }
  try { await signOut(); } catch { /* swallow */ }
  goToLanding();
});

// 멀티 호스트 백그라운드 헬스 체크 (단일 호스트 빌드면 no-op)
startHealthPinger(API_HOSTS);

// DevTools 디버깅 핸들 — `__nfindHealth()` 로 즉시 스냅샷 확인.
//   sticky 클리어: __nfindHealth.clearSticky()
//   현재 active 호스트: __nfindHealth.active()
declare global {
  interface Window {
    __nfindHealth?: {
      (): ReturnType<typeof getHealthSnapshot>;
      hosts: readonly string[];
      active: () => string;
      clearSticky: () => void;
    };
  }
}
const dbg = Object.assign(getHealthSnapshot, {
  hosts: API_HOSTS,
  active: getActiveApiHost,
  clearSticky: () => {
    try {
      localStorage.removeItem('runto_api_host_idx');
      localStorage.removeItem('runto_api_host_idx_exp');
      console.log('[__nfindHealth] sticky cleared');
    } catch { /* no-op */ }
  },
});
window.__nfindHealth = dbg;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
