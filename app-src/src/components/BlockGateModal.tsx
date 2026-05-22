/**
 * 차단 게이트 발동 알림 모달.
 *
 * 서버 (server/http_client.py) 의 _BLOCK_THRESHOLD_CRITICAL(20회) 임계 도달 시
 * 60초 cool-down 동안 신규 Naver 호출이 거부되고 진행 추출이 abort 됨.
 *
 * 표시 트리거 (lib/api.ts setBlockGateHandler):
 *  - 503 응답 + detail.error === 'block_gate'  → 신규 요청 거부
 *  - extract 폴링 응답 job.state === 'blocked'  → 진행 추출 abort
 *  - villa 폴링 응답 status === 'blocked'        → 진행 검색 abort
 *
 * 사용자 액션: 확인 → 닫음. retry_after 초가 있으면 안내에 노출.
 */
interface Props {
  message:      string;
  retryAfter?:  number;     // 초, 서버에서 받아온 cool-down 잔여
  onClose:      () => void;
}

export default function BlockGateModal({ message, retryAfter, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="block-gate-title"
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 id="block-gate-title" className="text-lg font-bold text-amber-700">
            ⚠️ 일시 차단
          </h2>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="text-[color:var(--color-muted)] hover:text-[color:var(--color-ink)] text-xl leading-none"
          >
            ✕
          </button>
        </div>

        <p className="text-base font-semibold mb-3 whitespace-pre-line">
          {message}
        </p>

        {typeof retryAfter === 'number' && retryAfter > 0 && (
          <p className="text-sm text-[color:var(--color-muted)] mb-5">
            약 {retryAfter}초 후 다시 시도 가능합니다.
          </p>
        )}

        <button
          onClick={onClose}
          className="w-full h-11 rounded-xl bg-[color:var(--color-brand)] hover:bg-[color:var(--color-brand-dark)] text-white font-semibold"
        >
          확인
        </button>
      </div>
    </div>
  );
}
