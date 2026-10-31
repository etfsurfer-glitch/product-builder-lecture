// 서비스 공지 팝업 — 로그인 후 브라우저 세션당 1회 노출. '다시 보지 않기' 없음.
// 새 공지를 낼 때는 키의 버전만 올리면 됨.
import { useEffect, useState } from 'react';

const NOTICE_KEY = 'nfind_notice_paid_hold_v1';

export default function ServiceNotice() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(NOTICE_KEY) === '1') return;
      setShow(true);
    } catch { /* private mode: 그냥 노출 */ setShow(true); }
  }, []);

  if (!show) return null;

  function close() {
    try { sessionStorage.setItem(NOTICE_KEY, '1'); } catch { /* 무시 */ }
    setShow(false);
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
         role="dialog" aria-modal="true" aria-labelledby="service-notice-title">
      <div className="w-full max-w-sm rounded-2xl bg-white border border-[color:var(--color-border)] shadow-xl p-6 space-y-4">
        <div className="text-xs font-bold text-red-700">서비스 공지</div>
        <h2 id="service-notice-title" className="text-xl font-extrabold tracking-tight">유료 서비스 보류 안내</h2>
        <p className="text-sm">
          데이터 수집 경로가 다시 막혔습니다.<br />
          이에 따라 <b>유료 서비스를 보류합니다.</b>
        </p>
        <button onClick={close}
                className="w-full h-11 rounded-xl bg-[color:var(--color-brand)] hover:bg-[color:var(--color-brand-dark)] text-white font-semibold">
          확인
        </button>
      </div>
    </div>
  );
}
