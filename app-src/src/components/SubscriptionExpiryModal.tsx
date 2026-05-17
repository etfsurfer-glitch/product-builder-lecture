/**
 * 구독 만료 임박 알림 모달.
 *
 * 표시 조건 (App.tsx 에서 판단):
 *  - subscription === 'pro'
 *  - subscription_end 가 오늘부터 3일 이내 (음수 = 만료 후도 포함, 사용자 요청)
 *
 * 재노출 throttle: 하루 1회 (사용자 user_id × 서울 날짜 키, localStorage).
 */
const KAKAO_INQUIRY_URL = 'https://open.kakao.com/o/svB0Npmi';

interface Props {
  daysLeft: number;        // 양수 = 남은 일수, 0 = 오늘 마지막, 음수 = 만료 후 경과
  onClose: () => void;
}

export default function SubscriptionExpiryModal({ daysLeft, onClose }: Props) {
  const isExpired = daysLeft < 0;
  const title     = isExpired ? '⚠️ 사용기한 만료' : '⏰ 구독 만료 알림';
  const message   = daysLeft > 0
    ? `사용기한이 ${daysLeft}일 남았습니다.`
    : daysLeft === 0
      ? '오늘이 사용기한 마지막 날입니다.'
      : `사용기한이 ${Math.abs(daysLeft)}일 지났습니다.`;
  const headerClass = isExpired ? 'text-red-700' : 'text-amber-700';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sub-expiry-title"
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 id="sub-expiry-title" className={`text-lg font-bold ${headerClass}`}>
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="text-[color:var(--color-muted)] hover:text-[color:var(--color-ink)] text-xl leading-none"
          >
            ✕
          </button>
        </div>

        <p className="text-base font-semibold mb-3">{message}</p>

        <p className="text-sm text-[color:var(--color-muted)] mb-5 break-all">
          문의:{' '}
          <a
            href={KAKAO_INQUIRY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[color:var(--color-brand)] hover:underline font-medium"
          >
            카카오톡 오픈채팅으로 연결
          </a>
        </p>

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
