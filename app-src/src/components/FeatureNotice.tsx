// 신규 기능 안내 팝업 — 접속 시 1회 노출. '다시 보지 않기'는 localStorage 로 영구 숨김,
// '닫기'는 이번 브라우저 세션 동안만 숨김(sessionStorage).
import { useEffect, useState } from 'react';

// 새 공지를 낼 때는 이 키의 버전만 올리면 됨 (이전 '다시 보지 않기'와 무관하게 다시 노출)
const NOTICE_KEY = 'nfind_notice_timecompare_v1';

export default function FeatureNotice({ onGo }: { onGo: () => void }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(NOTICE_KEY) === '1') return;
      if (sessionStorage.getItem(NOTICE_KEY) === '1') return;
      setShow(true);
    } catch { /* private mode: 그냥 노출 */ setShow(true); }
  }, []);

  if (!show) return null;

  function closeOnce() {
    try { sessionStorage.setItem(NOTICE_KEY, '1'); } catch { /* 무시 */ }
    setShow(false);
  }
  function closeForever() {
    try { localStorage.setItem(NOTICE_KEY, '1'); } catch { /* 무시 */ }
    setShow(false);
  }
  function goFeature() {
    closeForever();
    onGo();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
         onClick={closeOnce}>
      <div className="w-full max-w-md rounded-2xl bg-white border border-[color:var(--color-border)] shadow-xl p-6 space-y-4"
           onClick={e => e.stopPropagation()}>
        <div className="text-xs font-bold text-[color:var(--color-brand)]">신규 기능 안내</div>
        <h2 className="text-xl font-extrabold tracking-tight">🆕 단지 시점 비교</h2>
        <p className="text-sm text-[color:var(--color-muted)]">
          관심단지의 매물 변화를 날짜별로 저장하고, 두 시점을 비교해
          <b> 신규·이탈 매물과 가격 변동</b>을 한눈에 확인할 수 있습니다. (Pro 전용)
        </p>
        <ol className="text-sm space-y-1.5 list-decimal list-inside">
          <li><b>단지 시점 비교</b> 탭에서 단지를 검색해 등록하세요 (최대 5개)</li>
          <li>등록하면 현재 매물이 바로 저장되고, 이후 <b>매일 오전 10시</b>에 자동 저장됩니다</li>
          <li>기준일을 골라 비교하거나, 저장된 시점 <b>2개를 체크해 '선택 비교'</b> 하세요</li>
          <li>저장된 시점(📋)을 클릭하면 그 당시 매물 목록도 볼 수 있습니다</li>
        </ol>
        <div className="flex items-center justify-between gap-2 pt-1">
          <button onClick={closeForever}
                  className="text-xs text-[color:var(--color-muted)] hover:underline">
            다시 보지 않기
          </button>
          <div className="flex gap-2">
            <button onClick={closeOnce}
                    className="h-9 px-3 rounded-lg border border-[color:var(--color-border)] text-sm">
              닫기
            </button>
            <button onClick={goFeature}
                    className="h-9 px-4 rounded-lg bg-[color:var(--color-brand)] text-white text-sm font-semibold">
              바로 가보기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
