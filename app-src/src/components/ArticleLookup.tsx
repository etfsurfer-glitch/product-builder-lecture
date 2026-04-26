import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getArticle, type ArticleInfo, ApiError } from '../lib/api';
import { verifKo } from './ExtractResult';

interface Props { session: Session | null; }

interface ResultItem {
  no: string;
  info: ArticleInfo;
  queriedAt: number;
}

// tradeType 코드 → 한글 (scrapers.py _TRADE_MAP 동일)
const TRADE_MAP: Record<string, string> = {
  A1: '매매', B1: '전세', B2: '전세', C1: '월세', C2: '월세',
};

function tradeKo(v: unknown): string {
  const s = String(v ?? '');
  return TRADE_MAP[s] ?? s;
}

function fmtPrice(v: unknown): string {
  if (v == null || v === '' || v === 0) return '';
  const n = typeof v === 'number' ? v : parseInt(String(v).replace(/,/g, ''), 10);
  if (!Number.isFinite(n) || n === 0) return '';
  if (n >= 10000) {
    const ok = Math.floor(n / 10000);
    const r = n % 10000;
    return r > 0 ? `${ok}억 ${r.toLocaleString()}만` : `${ok}억`;
  }
  return `${n.toLocaleString()}만`;
}

function fmtYmd(v: unknown): string {
  const s = String(v ?? '').trim();
  if (s.length !== 8) return s;
  return `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)}`;
}

function displayPrice(info: ArticleInfo): { label: string; main: string; sub?: string } | null {
  const trade = tradeKo(info.tradeType);
  if (trade === '매매') {
    const main = fmtPrice(info.price_deal);
    if (!main) return null;
    if (info.premiumPrice || info.isalePrice || info.optionPrice) {
      const parts: string[] = [];
      if (info.isalePrice) parts.push(`분양가 ${fmtPrice(info.isalePrice)}`);
      if (info.premiumPrice) parts.push(`프리미엄 ${fmtPrice(info.premiumPrice)}`);
      if (info.optionPrice) parts.push(`옵션 ${fmtPrice(info.optionPrice)}`);
      return { label: '매매', main, sub: parts.join(' · ') };
    }
    return { label: '매매', main };
  }
  if (trade === '전세') return { label: '전세', main: fmtPrice(info.price_warrant) };
  if (trade === '월세') {
    return { label: '월세', main: `${fmtPrice(info.price_warrant)} / ${fmtPrice(info.price_rent)}` };
  }
  return null;
}

function formatPhone(tel: string): string {
  const s = tel.replace(/[^0-9]/g, '');
  if (!s) return tel;
  if (s.startsWith('02')) {
    if (s.length === 10) return `02-${s.slice(2, 6)}-${s.slice(6)}`;
    if (s.length === 9)  return `02-${s.slice(2, 5)}-${s.slice(5)}`;
  }
  if (s.length === 11) return `${s.slice(0, 3)}-${s.slice(3, 7)}-${s.slice(7)}`;
  if (s.length === 10) return `${s.slice(0, 3)}-${s.slice(3, 6)}-${s.slice(6)}`;
  if (s.length === 9)  return `${s.slice(0, 2)}-${s.slice(2, 5)}-${s.slice(5)}`;
  if (s.length === 8)  return `${s.slice(0, 4)}-${s.slice(4)}`;
  return tel;
}

const TRADE_BADGE: Record<string, string> = {
  매매: 'bg-green-50 text-green-800 border-green-200',
  전세: 'bg-amber-50 text-amber-800 border-amber-200',
  월세: 'bg-blue-50 text-blue-800 border-blue-200',
};

// 대략적인 경과 시간대별 단계 안내 (서버가 단계 스트림을 주지 않으므로 시간 기반 추정)
const STAGE_STEPS = [
  { from:   0, label: '매물 정보 조회 중' },
  { from:   3, label: '단지 확인 중' },
  { from:   8, label: '단지 매물 목록 수집 중' },
  { from:  25, label: '호수 매칭 중' },
  { from:  60, label: '매물이 많은 단지입니다 · 그대로 두세요' },
  { from: 120, label: '계속 처리 중입니다 · 창을 닫지 마세요' },
];

export default function ArticleLookup({ session }: Props) {
  const [articleNo, setArticleNo] = useState('');
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ResultItem[]>([]);
  const [accumulate, setAccumulate] = useState(false);
  const [err, setErr] = useState('');
  const [stageIdx, setStageIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => { if (timerRef.current) window.clearInterval(timerRef.current); }, []);

  function startTimer() {
    setStageIdx(0);
    setElapsed(0);
    const startAt = Date.now();
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      const sec = Math.floor((Date.now() - startAt) / 1000);
      setElapsed(sec);
      // 가장 최근에 지나간 단계 선택
      let idx = 0;
      for (let i = 0; i < STAGE_STEPS.length; i++) {
        if (sec >= STAGE_STEPS[i].from) idx = i;
      }
      setStageIdx(idx);
    }, 500);
  }
  function stopTimer() {
    if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const no = articleNo.trim().replace(/[^0-9]/g, '');
    if (!no) { setErr('숫자 매물번호를 입력해주세요'); return; }
    setLoading(true); setErr('');
    startTimer();
    try {
      const r = await getArticle(session, no);
      // naver_get_article_info 는 실패 시에도 모든 키가 빈 값인 초기 dict 를 반환한다.
      // 핵심 필드 하나라도 있어야 유효한 결과로 인정.
      const hasContent = !!(
        r.info &&
        (r.info.aptName || r.info.address_text || r.info.tradeType ||
         r.info.price_deal || r.info.price_warrant)
      );
      if (!hasContent) {
        setErr(`매물 정보를 찾을 수 없습니다 (#${no}) — 네트워크 문제가 아니면 매물번호를 다시 한번 확인해주세요.`);
        return;
      }
      const newItem: ResultItem = { no: r.article_no, info: r.info, queriedAt: Date.now() };
      // 누적 ON: 중복 체크/재정렬 없이 들어온 순서 그대로 뒤에 이어붙임
      // 누적 OFF: 기존 대체
      setItems(prev => accumulate ? [...prev, newItem] : [newItem]);
      setArticleNo('');  // 누적 모드에서 연속 조회 편하게 비움
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.status} · ${e.message}` : String(e));
    } finally {
      setLoading(false);
      stopTimer();
    }
  }

  function removeItem(no: string) {
    setItems(prev => prev.filter(x => x.no !== no));
  }
  function clearAll() {
    if (items.length >= 2 && !confirm(`${items.length}개 결과를 모두 지울까요?`)) return;
    setItems([]);
  }

  return (
    <div>
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">매물번호 조회</h1>
      <p className="text-[color:var(--color-muted)] mb-6">매물번호로 상세 정보를 조회합니다.</p>

      <form onSubmit={onSubmit} className="flex gap-2 mb-4">
        <input
          type="text"
          inputMode="numeric"
          value={articleNo}
          onChange={e => setArticleNo(e.target.value)}
          placeholder="예: 2512345678"
          className="flex-1 h-12 px-4 rounded-xl border border-[color:var(--color-border-strong)] focus:outline-none focus:border-[color:var(--color-brand)] focus:ring-3 focus:ring-[color:var(--color-brand-soft)] text-base font-mono"
          autoFocus
        />
        <button
          type="submit"
          disabled={loading || !articleNo.trim()}
          className="h-12 px-6 rounded-xl bg-[color:var(--color-brand)] hover:bg-[color:var(--color-brand-dark)] disabled:bg-[#b5aeea] disabled:cursor-not-allowed text-white font-semibold"
        >
          {loading ? '조회 중...' : '조회'}
        </button>
      </form>

      {/* 누적 옵션 + 리스트 컨트롤 */}
      <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={accumulate}
            onChange={e => setAccumulate(e.target.checked)}
            className="w-4 h-4 accent-[color:var(--color-brand)] cursor-pointer"
          />
          <span className="text-sm font-semibold">결과 누적 보기</span>
          <span className="text-xs text-[color:var(--color-muted)]">
            (체크 시 조회할 때마다 결과가 쌓입니다)
          </span>
        </label>
        {items.length > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-[color:var(--color-muted)]">
              누적 <span className="font-bold text-[color:var(--color-ink)]">{items.length}</span>건
            </span>
            <button
              onClick={clearAll}
              className="h-9 px-3 rounded-lg bg-[color:var(--color-bg-soft)] hover:bg-[#edeff7] border border-[color:var(--color-border)] text-sm font-semibold"
            >
              모두 지우기
            </button>
          </div>
        )}
      </div>

      {loading && (
        <div className="mb-6 p-5 rounded-xl bg-[color:var(--color-bg-soft)] border border-[color:var(--color-border)]">
          <div className="flex items-center justify-between mb-3 gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="spinner shrink-0" style={{ width: 20, height: 20, borderWidth: 2 }} />
              <div className="font-semibold truncate">
                {STAGE_STEPS[stageIdx].label}
              </div>
            </div>
            <div className="font-mono text-xs text-[color:var(--color-muted)] shrink-0">
              {elapsed}s
            </div>
          </div>
          {/* indeterminate 진행바 */}
          <div className="h-1.5 rounded-full bg-[color:var(--color-border)] overflow-hidden relative">
            <div className="absolute inset-y-0 bg-[color:var(--color-brand)] rounded-full indeterminate-bar" />
          </div>
          <div className="mt-2 text-xs text-[color:var(--color-muted)]">
            단지 규모·유형(분양권 등)에 따라 조회 시간이 길어질 수 있습니다.
          </div>
        </div>
      )}

      {err && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm">
          {err}
        </div>
      )}

      <div className="space-y-4">
        {items.map(item => (
          <ArticleCard
            key={item.no + item.queriedAt}
            item={item}
            onRemove={() => removeItem(item.no)}
          />
        ))}
      </div>

      {items.length === 0 && !err && (
        <div className="text-center py-12 text-[color:var(--color-muted)] text-sm">
          매물번호를 입력해 조회하세요.
        </div>
      )}
    </div>
  );
}

// ── 단건 카드 ─────────────────────────────────────────────────────────────
function ArticleCard({ item, onRemove }: { item: ResultItem; onRemove: () => void }) {
  const { info, no } = item;
  const price = displayPrice(info);
  const trade = tradeKo(info.tradeType);
  const badgeCls = TRADE_BADGE[trade] ?? 'bg-[color:var(--color-bg-soft)] text-[color:var(--color-muted)] border-[color:var(--color-border)]';

  return (
    <div className="rounded-2xl border border-[color:var(--color-border)] bg-white overflow-hidden relative">
      <button
        onClick={onRemove}
        className="absolute top-3 right-3 w-8 h-8 rounded-lg hover:bg-[color:var(--color-bg-soft)] flex items-center justify-center text-[color:var(--color-muted)] hover:text-[color:var(--color-ink)] text-lg leading-none"
        aria-label="이 결과 지우기"
        title="지우기"
      >
        ×
      </button>

      {/* Header */}
      <div className="p-6 pr-12 border-b border-[color:var(--color-border)]">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {trade && (
                <span className={`inline-flex px-2.5 py-1 rounded text-xs font-bold border ${badgeCls}`}>{trade}</span>
              )}
              {info.realEstateTypeName && (
                <span className="inline-flex px-2.5 py-1 rounded text-xs font-semibold bg-[color:var(--color-brand-soft)] text-[color:var(--color-brand)]">
                  {info.realEstateTypeName}
                </span>
              )}
              <span className="font-mono text-xs text-[color:var(--color-muted)]">#{no}</span>
            </div>
            <h2 className="text-xl font-bold leading-tight mb-1">{info.aptName || '—'}</h2>
            {info.address_text && (
              <div className="text-sm text-[color:var(--color-muted)]">{info.address_text}</div>
            )}
          </div>
          {price && (
            <div className="text-right shrink-0">
              <div className="text-xs text-[color:var(--color-muted)] mb-0.5">{price.label}</div>
              <div className="text-2xl font-extrabold tracking-tight">{price.main}</div>
              {price.sub && <div className="text-xs text-[color:var(--color-muted)] mt-1">{price.sub}</div>}
            </div>
          )}
        </div>
      </div>

      {/* Attributes */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 divide-x divide-y divide-[color:var(--color-border)] border-b border-[color:var(--color-border)]">
        <Field label="동" value={info.dong} />
        <Field label="호" value={hoDisplay(info)} hint={hoHint(info)} />
        <Field label="층" value={info.floor_num ? `${info.floor_num}층` : info.floorInfo} />
        <Field label="방향" value={info.direction} />
        <Field label="전용면적" value={info.exclusiveArea ? `${info.exclusiveArea}㎡` : ''} />
        <Field label="공급면적" value={info.supplyArea ? `${info.supplyArea}㎡` : ''} />
        <Field label="방 수" value={info.roomCount} />
        <Field label="욕실 수" value={info.bathroomCount} />
        <Field label="입주" value={info.moveInPossibleYmd ? fmtYmd(info.moveInPossibleYmd) : info.moveInTypeName} />
        <Field label="매물확인" value={fmtYmd(info.article_confirm_ymd)} />
        <Field label="인증종류" value={verifKo(info.verificationTypeName) || verifKo(info.verificationTypeCode) || info.verificationTypeName || info.verificationTypeCode} />
        <Field label="출처" value={info.cp_name} />
      </div>

      {/* Broker */}
      <div className="p-6 border-b border-[color:var(--color-border)]">
        <div className="text-xs text-[color:var(--color-muted)] mb-1">중개업소</div>
        <div className="font-semibold">{info.realtor_name || '—'}</div>
        {info.broker_tels && info.broker_tels.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {info.broker_tels.map(tel => (
              <a
                key={tel}
                href={`tel:${tel}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[color:var(--color-bg-soft)] hover:bg-[#edeff7] border border-[color:var(--color-border)] text-sm font-mono"
              >
                📞 {formatPhone(tel)}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Description */}
      {info.articleFeatureDesc && (
        <div className="p-6">
          <div className="text-xs text-[color:var(--color-muted)] mb-2">매물 설명</div>
          <div className="text-sm leading-relaxed whitespace-pre-wrap">{info.articleFeatureDesc}</div>
        </div>
      )}

      {info.cp_pc_article_url && (
        <div className="px-6 pb-6 -mt-2">
          <a
            href={info.cp_pc_article_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-[color:var(--color-brand)] hover:underline"
          >
            원본 페이지에서 보기 ↗
          </a>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, hint }: {
  label: string;
  value?: string | number | null;
  hint?: string;
}) {
  const v = value == null || value === '' ? '—' : String(value);
  return (
    <div className="px-4 py-3">
      <div className="text-xs text-[color:var(--color-muted)] mb-1">{label}</div>
      <div className="text-sm font-semibold truncate" title={hint || v}>{v}</div>
      {hint && (
        <div className="text-[10px] font-medium text-[color:var(--color-muted)] mt-0.5 truncate" title={hint}>
          {hint}
        </div>
      )}
    </div>
  );
}

function hoDisplay(info: ArticleInfo): string {
  if (info.ho) return info.ho;
  const hasCandidates = info._ho_candidates?.length;
  if (info._ho_source === 'kb_multi' && hasCandidates) {
    return `후보 ${info._ho_candidates!.length}개`;
  }
  if (info._ho_source === 'pyeongtype_multi' && hasCandidates) {
    return `후보 ${info._ho_candidates!.length}개`;
  }
  return '비공개';
}

function hoHint(info: ArticleInfo): string | undefined {
  switch (info._ho_source) {
    case 'naver_api':           return '매물 원본에 공개';
    case 'kb_matched':          return '단지 매물 매칭으로 확인';
    case 'kb_multi':
      return `단지 내 후보: ${(info._ho_candidates ?? []).join(', ')}`;
    case 'cp_fallback':         return '등록처 페이지에서 복구';
    case 'pyeongtype_inferred': return '평형·층 추론';
    case 'pyeongtype_multi':
      return `평형·층 후보: ${(info._ho_candidates ?? []).join(', ')}`;
    case 'hidden':              return '호수가 공개되지 않은 매물';
    default: return undefined;
  }
}
