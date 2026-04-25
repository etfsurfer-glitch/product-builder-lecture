import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { setUnauthorizedHandler, serverLogout } from './lib/api';
import { signOut, goToLanding } from './lib/auth';

// 토큰 만료(401) 시 자동 로그아웃 + 랜딩 페이지로 이동
setUnauthorizedHandler(async () => {
  try { await serverLogout(null); } catch { /* swallow */ }
  try { await signOut(); } catch { /* swallow */ }
  goToLanding();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
