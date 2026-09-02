import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getCurrentSession, goToLanding, signOut } from './lib/auth';
import { serverLogout, getMe, IS_TEST_BUILD, API_BASE,
         setBlockGateHandler, setSubscriptionRequiredHandler,
         type BlockGateInfo } from './lib/api';
import SearchPanel from './components/SearchPanel';
import ArticleLookup from './components/ArticleLookup';
import VillaSearch from './components/VillaSearch';
import JisanSearch from './components/JisanSearch';
import SanggaSearch from './components/SanggaSearch';
import Portfolio from './components/Portfolio';
import TimeCompare from './components/TimeCompare';
import FeatureNotice from './components/FeatureNotice';
import DeviceManager from './components/DeviceManager';
import AdminPage from './components/AdminPage';
import SubscriptionExpiryModal from './components/SubscriptionExpiryModal';
import SubscriptionRequiredModal from './components/SubscriptionRequiredModal';
import BlockGateModal from './components/BlockGateModal';

type Status = 'loading' | 'needs-login' | 'ready';
type Tab = 'complex' | 'article' | 'villa' | 'jisan' | 'sangga' | 'portfolio' | 'timecompare';

// ── 구독 만료 알림 헬퍼 (서울 TZ 기준) ───────────────────────────────────────
function todayInSeoul(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

function daysUntil(endDate: string): number {
  // YYYY-MM-DD → 서울 자정 기준 일수 차이. 양수=남음, 0=오늘 마지막, 음수=만료 후.
  const today  = todayInSeoul();
  const todayMs = new Date(today + 'T00:00:00+09:00').getTime();
  const endMs   = new Date(endDate + 'T00:00:00+09:00').getTime();
  return Math.floor((endMs - todayMs) / 86400000);
}

function expiryWarnKey(userId: string): string {
  return `nfind_sub_expiry_warned_${userId}_${todayInSeoul()}`;
}

function TestBanner() {
  if (!IS_TEST_BUILD) return null;
  const host = API_BASE.replace(/^https?:\/\//, '');
  return (
    <div className="sticky top-0 z-30 bg-red-600 text-white text-center text-xs sm:text-sm font-bold py-1 px-3 shadow">
      🧪 테스트 서버 — {host} (프로덕션 아님)
    </div>
  );
}

export default function App() {
  const [status, setStatus] = useState<Status>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string>('');
  const [tab, setTab] = useState<Tab>('complex');
  // 단지검색에 매물번호를 넣었을 때 매물번호 탭으로 넘길 값
  const [pendingArticleNo, setPendingArticleNo] = useState('');
  const [showDevices, setShowDevices] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [expiryDaysLeft, setExpiryDaysLeft] = useState<number | null>(null);
  const [blockGate, setBlockGate] = useState<BlockGateInfo | null>(null);
  const [needsPro, setNeedsPro] = useState(false);

  // 차단 게이트 핸들러 등록 — api.ts 가 503 block_gate / blocked state 감지 시 호출
  useEffect(() => {
    setBlockGateHandler((info) => setBlockGate(info));
    // 구독 게이트 — 서버가 403 subscription_required 응답 시 호출
    setSubscriptionRequiredHandler(() => setNeedsPro(true));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const s = await getCurrentSession();
        if (!s) { setStatus('needs-login'); return; }
        setSession(s);
        setStatus('ready');
        // admin 여부 + 구독 상태 (만료 알림용) — 서버 판정값 신뢰
        try {
          const me = await getMe(s);
          setIsAdmin(!!me.is_admin);

          // free 사용자는 모든 기능 차단 — 즉시 프로 등록 안내 모달 노출 (관리자 제외)
          if (!me.is_admin && me.subscription === 'free') {
            setNeedsPro(true);
          }

          // 구독 만료 알림: pro + 3일 이내 (음수=만료 후 포함). 하루 1회 throttle.
          if (me.subscription === 'pro' && me.subscription_end) {
            const days = daysUntil(me.subscription_end);
            if (days <= 3) {
              const key = expiryWarnKey(me.user_id);
              if (!localStorage.getItem(key)) {
                setExpiryDaysLeft(days);
              }
            }
          }
        } catch { /* 실패해도 일반 사용자 */ }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus('needs-login');
      }
    })();
  }, []);

  if (status === 'loading') {
    return (
      <>
        <TestBanner />
        <div className="min-h-screen flex items-center justify-center">
          <div className="spinner" />
        </div>
      </>
    );
  }

  if (status === 'needs-login') {
    return (
      <>
        <TestBanner />
        <div className="min-h-screen flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center">
          <h1 className="text-2xl font-bold mb-3">로그인이 필요합니다</h1>
          <p className="text-[color:var(--color-muted)] mb-6">
            랜딩 페이지에서 로그인 후 다시 접속해주세요.
          </p>
          {error && (
            <p className="text-sm text-red-700 mb-4">오류: {error}</p>
          )}
          <button
            onClick={goToLanding}
            className="h-12 px-6 rounded-xl bg-[color:var(--color-brand)] hover:bg-[color:var(--color-brand-dark)] text-white font-semibold"
          >
            로그인 페이지로
          </button>
        </div>
      </div>
      </>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <TestBanner />
      <header className={`sticky ${IS_TEST_BUILD ? 'top-6 sm:top-7' : 'top-0'} z-10 bg-white/90 backdrop-blur border-b border-[color:var(--color-border)]`}>
        <div className="max-w-6xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg sm:text-xl font-extrabold tracking-tight bg-gradient-to-br from-[#6c5ce7] to-[#a29bfe] bg-clip-text text-transparent">nfind</span>
            <span className="hidden md:inline text-sm text-[color:var(--color-muted)]">매물관리시스템</span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <span className="hidden lg:inline text-sm text-[color:var(--color-muted)] truncate max-w-[180px]">
              {session?.user.email}
            </span>
            {isAdmin && (
              <button
                onClick={() => setShowAdmin(true)}
                className="h-9 sm:h-10 px-2.5 sm:px-3 rounded-lg bg-[color:var(--color-brand-soft)] hover:brightness-95 border border-[color:var(--color-brand)] text-[color:var(--color-brand)] text-xs sm:text-sm font-semibold"
                title="관리자"
              >
                관리자
              </button>
            )}
            <button
              onClick={() => setShowDevices(true)}
              className="h-9 sm:h-10 px-2.5 sm:px-3 rounded-lg bg-[color:var(--color-bg-soft)] hover:bg-[#edeff7] border border-[color:var(--color-border)] text-xs sm:text-sm font-semibold"
              title="내 기기 관리"
            >
              기기
            </button>
            <button
              onClick={async () => {
                await serverLogout(session);
                await signOut();
                goToLanding();
              }}
              className="h-9 sm:h-10 px-2.5 sm:px-4 rounded-lg bg-[color:var(--color-bg-soft)] hover:bg-[#edeff7] border border-[color:var(--color-border)] text-xs sm:text-sm font-semibold"
            >
              로그아웃
            </button>
          </div>
        </div>
        {/* Tabs */}
        <div className="max-w-6xl mx-auto px-3 sm:px-6">
          <div className="flex gap-1 -mb-px">
            <TabButton active={tab === 'complex'} onClick={() => setTab('complex')}>단지 검색</TabButton>
            <TabButton active={tab === 'article'} onClick={() => setTab('article')}>매물번호 조회</TabButton>
            <TabButton active={tab === 'villa'} onClick={() => setTab('villa')}>빌라/사무실 등</TabButton>
            <TabButton active={tab === 'jisan'} onClick={() => setTab('jisan')}>지식산업센터</TabButton>
            <TabButton active={tab === 'sangga'} onClick={() => setTab('sangga')}>상가</TabButton>
            <TabButton active={tab === 'portfolio'} onClick={() => setTab('portfolio')}>내 폴더</TabButton>
            <TabButton active={tab === 'timecompare'} onClick={() => setTab('timecompare')}>단지 시점 비교</TabButton>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-8">
        {showAdmin && isAdmin ? (
          <AdminPage session={session} onBack={() => setShowAdmin(false)} />
        ) : (
          <>
            {tab === 'complex' && (
              <SearchPanel
                session={session}
                onGoArticle={(no) => { setPendingArticleNo(no); setTab('article'); }}
              />
            )}
            {tab === 'article' && (
              <ArticleLookup
                session={session}
                initialArticleNo={pendingArticleNo}
                onInitialConsumed={() => setPendingArticleNo('')}
              />
            )}
            {tab === 'villa' && <VillaSearch session={session} />}
            {tab === 'jisan' && <JisanSearch session={session} />}
            {tab === 'sangga' && <SanggaSearch session={session} />}
            {tab === 'portfolio' && <Portfolio session={session} />}
            {tab === 'timecompare' && <TimeCompare session={session} />}
          </>
        )}
      </main>

      {showDevices && (
        <DeviceManager session={session} onClose={() => setShowDevices(false)} />
      )}

      {expiryDaysLeft !== null && (
        <SubscriptionExpiryModal
          daysLeft={expiryDaysLeft}
          onClose={() => {
            const uid = session?.user?.id;
            if (uid) {
              try { localStorage.setItem(expiryWarnKey(uid), '1'); } catch { /* private mode */ }
            }
            setExpiryDaysLeft(null);
          }}
        />
      )}

      {blockGate && (
        <BlockGateModal
          message={blockGate.message}
          retryAfter={blockGate.retry_after}
          onClose={() => setBlockGate(null)}
        />
      )}

      {needsPro && <SubscriptionRequiredModal session={session} />}

      <FeatureNotice onGo={() => setTab('timecompare')} />
    </div>
  );
}

function TabButton({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        'px-4 py-2.5 text-sm font-semibold border-b-2 transition ' +
        (active
          ? 'border-[color:var(--color-brand)] text-[color:var(--color-brand)]'
          : 'border-transparent text-[color:var(--color-muted)] hover:text-[color:var(--color-ink)]')
      }
    >
      {children}
    </button>
  );
}
