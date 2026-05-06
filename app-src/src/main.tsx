import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { setUnauthorizedHandler, serverLogout, API_HOSTS, getActiveApiHost } from './lib/api';
import { getSupabase, signOut, goToLanding } from './lib/auth';
import { startHealthPinger, getHealthSnapshot } from './lib/health';

// 토큰 만료(401) 처리:
//  1) supabase 명시적 refreshSession 시도 — autoRefreshToken=true 가 stale 한 케이스 회복
//  2) 성공시 logout 안 함 (사용자가 다음 클릭에서 새 access_token 자동 사용)
//  3) 실패 (refresh_token 도 만료) → 기존 동작: serverLogout + signOut + 랜딩 이동
setUnauthorizedHandler(async () => {
  try {
    const sb = await getSupabase();
    const { data, error } = await sb.auth.refreshSession();
    if (!error && data?.session) {
      console.log('[401] supabase session refreshed silently — logout 안 함');
      return;
    }
    console.log('[401] refresh 실패 → logout', error);
  } catch (e) {
    console.log('[401] refresh 시도 예외 → logout', e);
  }
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
