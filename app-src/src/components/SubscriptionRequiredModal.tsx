/**
 * 프로 등록 안내 모달 (free 사용자 차단용).
 *
 * 표시 조건 (App.tsx 에서 판단):
 *  - /api/me 응답의 subscription === 'free' (관리자가 아닌 경우)
 *  - 또는 lib/api 의 setSubscriptionRequiredHandler 가 트리거됨
 *    (서버가 403 + detail.code='subscription_required' 응답)
 *
 * 동작: 카카오톡 문의 링크 + 로그아웃 버튼. 닫기 버튼은 노출하지 않음 (free 는 사용 불가).
 */
import { goToLanding, signOut } from '../lib/auth';
import { serverLogout } from '../lib/api';
import type { Session } from '@supabase/supabase-js';

const KAKAO_INQUIRY_URL = 'https://open.kakao.com/o/svB0Npmi';

interface Props {
  session: Session | null;
}

export default function SubscriptionRequiredModal({ session }: Props) {
  const handleLogout = async () => {
    try { await serverLogout(session); } catch { /* swallow */ }
    try { await signOut(); } catch { /* swallow */ }
    goToLanding();
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sub-required-title"
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 id="sub-required-title" className="text-lg font-bold text-amber-700 mb-3">
          🔒 프로 등록이 필요합니다
        </h2>

        <p className="text-sm text-[color:var(--color-ink)] mb-2">
          이 서비스의 모든 기능은 <span className="font-semibold">프로 등록 사용자</span>만 이용할 수 있습니다.
        </p>
        <p className="text-sm text-[color:var(--color-muted)] mb-5">
          아래 카카오톡 오픈채팅으로 문의해 주세요.
        </p>

        <a
          href={KAKAO_INQUIRY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full h-11 leading-[44px] text-center rounded-xl bg-[#FEE500] hover:brightness-95 text-[#191919] font-semibold mb-3"
        >
          💬 카카오톡 오픈채팅 문의
        </a>

        <button
          onClick={handleLogout}
          className="w-full h-10 rounded-xl bg-[color:var(--color-bg-soft)] hover:bg-[#edeff7] border border-[color:var(--color-border)] text-sm font-semibold"
        >
          로그아웃
        </button>
      </div>
    </div>
  );
}
