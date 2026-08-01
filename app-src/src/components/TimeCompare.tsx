// 단지 시점 비교 (Pro 전용) — 관심단지(최대 5) 매일 10시 콜드 스냅샷 → 시점 diff.
// 서버: /api/snapshot-watch* (require_pro). 비교 결과 화면은 Portfolio 의 CompareView 재사용.
// Pro 게이트는 /api/me 무의존 — 목록 호출의 403 으로 자체 판정.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  listTcFavorites, addTcFavorite, removeTcFavorite,
  listTcSnapshots, compareTcSnapshots, refreshTc, saveTcFromJob, getTcSnapshot,
  searchComplex, getExtractStatus,
  ApiError,
  type TcWatchItem, type TcSnapshotMeta, type ComplexItem, type PortfolioCompare,
  type PortfolioSnapshot,
} from '../lib/api';
import { CompareView, SnapshotView } from './Portfolio';

// ── 유틸 ────────────────────────────────────────────────────────────────────
function fmtSavedAt(s: string | null | undefined): string {
  // 'YYYY-MM-DD_HHmm' 또는 ISO → 'MM.DD HH:mm'
  if (!s) return '';
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[_T]?(\d{2}):?(\d{2})?/);
  if (!m) return s;
  return `${m[2]}.${m[3]}${m[4] ? ` ${m[4]}:${m[5] ?? '00'}` : ''}`;
}

function yesterdayYmd(): string {
  const d = new Date(Date.now() - 86400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── 루트: Pro 게이트 ─────────────────────────────────────────────────────────
export default function TimeCompare({ session }: { session: Session | null }) {
  const [gate, setGate] = useState<'loading' | 'denied' | 'ok'>('loading');
  const [items, setItems] = useState<TcWatchItem[]>([]);
  const [maxN, setMaxN] = useState(5);
  const [err, setErr] = useState('');

  const reload = useCallback(async () => {
    try {
      const r = await listTcFavorites(session);
      setItems(r.items || []);
      setMaxN(r.max || 5);
      setGate('ok');
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) setGate('denied');
      else { setErr(String(e)); setGate('ok'); }
    }
  }, [session]);

  useEffect(() => { void reload(); }, [reload]);

  if (gate === 'loading') {
    return <div className="text-sm text-[color:var(--color-muted)] py-10 text-center">불러오는 중…</div>;
  }
  if (gate === 'denied') {
    return (
      <div className="max-w-lg mx-auto text-center py-14 space-y-3">
        <div className="text-3xl">🔒</div>
        <h2 className="text-xl font-bold">단지 시점 비교는 Pro 전용 기능입니다</h2>
        <p className="text-sm text-[color:var(--color-muted)]">
          관심단지를 등록하면 매일 오전 10시에 자동으로 매물 스냅샷을 저장하고,
          날짜별 매물 변화(신규·이탈·가격변동)를 비교해 드립니다.
        </p>
      </div>
    );
  }
  return (
    <TCManager
      session={session} items={items} maxN={maxN}
      error={err} onReload={reload}
    />
  );
}

// ── 관심단지 관리 + 단지별 실행 ──────────────────────────────────────────────
function TCManager({ session, items, maxN, error, onReload }: {
  session: Session | null; items: TcWatchItem[]; maxN: number;
  error: string; onReload: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<TcWatchItem | null>(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState(error);
  const [info, setInfo] = useState('');

  // 단지 추가 검색
  const [kw, setKw] = useState('');
  const [searching, setSearching] = useState(false);
  const [cands, setCands] = useState<ComplexItem[]>([]);

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const v = kw.trim(); if (!v) return;
    setSearching(true); setErr(''); setCands([]);
    try {
      const r = await searchComplex(session, v);
      setCands(r.items || []);
      if (!r.items?.length) setErr(`'${v}' 검색 결과가 없습니다`);
    } catch (e2) { setErr(String(e2)); }
    finally { setSearching(false); }
  }

  async function onAdd(c: ComplexItem) {
    setBusy(`add:${c.complex_no}`); setErr(''); setInfo('');
    try {
      const r = await addTcFavorite(session, c);
      setCands([]); setKw('');
      if (r.initial_snapshot) {
        setInfo(`'${c.name}' 등록 완료 — 첫 스냅샷을 백그라운드에서 생성 중입니다 (수 분 소요, 완료 시 '갱신됨' 배지). 내일부터 바로 비교할 수 있습니다.`);
      }
      await onReload();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : String(e2));
    } finally { setBusy(''); }
  }

  async function onRemove(cno: string) {
    if (!confirm('이 단지를 시점비교 목록에서 삭제할까요?\n(저장된 스냅샷도 함께 삭제됩니다)')) return;
    setBusy(`del:${cno}`); setErr('');
    try {
      await removeTcFavorite(session, cno);
      if (selected?.complex_no === cno) setSelected(null);
      await onReload();
    } catch (e2) { setErr(String(e2)); }
    finally { setBusy(''); }
  }

  if (selected) {
    return (
      <TCRunner
        session={session} complex={selected}
        onBack={() => { setSelected(null); void onReload(); }}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-1">단지 시점 비교</h1>
        <p className="text-sm text-[color:var(--color-muted)]">
          관심단지는 매일 <b>오전 10시부터 순차적으로</b> 자동 스냅샷이 저장됩니다.
          방금 상태가 필요하면 단지에서 <b>지금 콜드추출</b>을 실행하세요. (최대 {maxN}개 · 90일 보관)
        </p>
      </div>

      {err && <div className="text-sm text-red-600">{err}</div>}
      {info && (
        <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
          {info}
        </div>
      )}

      {/* 관심단지 목록 */}
      <div className="space-y-2">
        {items.length === 0 && (
          <div className="text-sm text-[color:var(--color-muted)] border border-dashed border-[color:var(--color-border)] rounded-lg p-6 text-center">
            아직 등록된 단지가 없습니다. 아래에서 단지를 검색해 추가하세요.
          </div>
        )}
        {items.map(it => (
          <div key={it.complex_no}
               className="flex items-center gap-3 border border-[color:var(--color-border)] rounded-lg px-3 py-2.5 hover:bg-[color:var(--color-bg-soft)]">
            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setSelected(it)}>
              <div className="font-semibold truncate">
                {it.name}
                <span className="ml-2 text-xs text-[color:var(--color-muted)]">{it.slnd_nm}</span>
              </div>
              <div className="text-xs text-[color:var(--color-muted)] truncate">
                {it.addr_full || it.addr}
                {it.last_snapshot_at && (
                  <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                    it.last_status === 'error'
                      ? 'bg-red-50 text-red-600'
                      : 'bg-emerald-50 text-emerald-700'
                  }`}>
                    {it.last_status === 'error' ? '갱신실패' : `갱신됨 ${fmtSavedAt(it.last_snapshot_at)}`}
                  </span>
                )}
              </div>
            </div>
            <button onClick={() => setSelected(it)}
                    className="h-8 px-3 rounded bg-[color:var(--color-brand)] text-white text-xs font-semibold">
              비교
            </button>
            <button onClick={() => void onRemove(it.complex_no)}
                    disabled={busy === `del:${it.complex_no}`}
                    className="h-8 px-2 rounded border border-[color:var(--color-border)] text-xs text-[color:var(--color-muted)] hover:text-red-600 disabled:opacity-50">
              삭제
            </button>
          </div>
        ))}
      </div>

      {/* 단지 추가 */}
      {items.length < maxN && (
        <div className="border-t border-[color:var(--color-border)] pt-4">
          <div className="text-sm font-bold mb-2">단지 추가 ({items.length}/{maxN})</div>
          <form onSubmit={onSearch} className="flex gap-2">
            <input value={kw} onChange={e => setKw(e.target.value)}
                   placeholder="단지명 검색 (예: 방배1차현대)"
                   className="flex-1 max-w-md h-10 px-3 rounded-lg border border-[color:var(--color-border)] text-sm"
                   disabled={searching} />
            <button type="submit" disabled={searching || !kw.trim()}
                    className="h-10 px-4 rounded-lg bg-[color:var(--color-brand)] text-white text-sm font-semibold disabled:opacity-50">
              {searching ? '검색 중…' : '검색'}
            </button>
          </form>
          {cands.length > 0 && (
            <div className="mt-2 space-y-1 max-h-64 overflow-y-auto">
              {cands.map(c => (
                <div key={c.complex_no}
                     className="flex items-center gap-2 border border-[color:var(--color-border)] rounded px-3 py-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold">{c.name}</span>
                    <span className="ml-2 text-xs text-[color:var(--color-muted)]">
                      {c.slnd_nm} · {c.addr_full || c.addr}{c.세대수 ? ` · ${c.세대수}세대` : ''}
                    </span>
                  </div>
                  <button onClick={() => void onAdd(c)}
                          disabled={busy === `add:${c.complex_no}` || items.some(x => x.complex_no === c.complex_no)}
                          className="h-7 px-3 rounded bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50">
                    {items.some(x => x.complex_no === c.complex_no) ? '등록됨' : '추가'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── 단지별: 스냅샷 목록 · 비교 실행 · 지금 콜드추출 ─────────────────────────
function TCRunner({ session, complex, onBack }: {
  session: Session | null; complex: TcWatchItem; onBack: () => void;
}) {
  const [snaps, setSnaps] = useState<TcSnapshotMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [baseDate, setBaseDate] = useState(yesterdayYmd());
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const [compare, setCompare] = useState<PortfolioCompare | null>(null);
  const [comparing, setComparing] = useState(false);

  // 스냅샷 원본 뷰어
  const [viewing, setViewing] = useState<PortfolioSnapshot | null>(null);
  const [opening, setOpening] = useState('');   // 여는 중인 key

  // 선택 비교 — 스냅샷 2개 선택 (savedAt 순으로 older/newer 자동 결정)
  const [sel, setSel] = useState<string[]>([]);
  function toggleSel(key: string) {
    setSel(prev => {
      if (prev.includes(key)) return prev.filter(k => k !== key);
      if (prev.length >= 2) return [prev[1], key];   // 2개 초과 시 오래된 선택 교체
      return [...prev, key];
    });
  }

  // 콜드추출 진행
  const [cold, setCold] = useState<{ jobId: string; pct: number; msg: string } | null>(null);
  const pollRef = useRef<number | null>(null);

  const loadSnaps = useCallback(async () => {
    setLoading(true);
    setSel([]);
    try {
      const r = await listTcSnapshots(session, complex.complex_no);
      setSnaps(r.items || []);
    } catch (e) { setErr(String(e)); }
    finally { setLoading(false); }
  }, [session, complex.complex_no]);

  useEffect(() => { void loadSnaps(); }, [loadSnaps]);
  useEffect(() => () => { if (pollRef.current) window.clearInterval(pollRef.current); }, []);

  async function runCompare(body: { older_key?: string; newer_key?: string; base_date?: string }) {
    setComparing(true); setErr(''); setNotice(''); setCompare(null);
    try {
      const r = await compareTcSnapshots(session, complex.complex_no, body);
      if (r.baselineOnly) {
        setNotice(`스냅샷이 1개뿐이라 비교할 기준이 없습니다 (최신: ${fmtSavedAt(r.newer?.savedAt)} · ${r.newer?.totalCount ?? 0}건). 내일 자동 스냅샷 이후 또는 "지금 콜드추출" 후 다시 시도하세요.`);
      } else {
        setCompare(r as PortfolioCompare);
      }
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.status} · ${e.message}` : String(e));
    } finally { setComparing(false); }
  }

  async function onColdExtract() {
    setErr(''); setNotice('');
    try {
      const r = await refreshTc(session, complex.complex_no);
      setCold({ jobId: r.job_id, pct: 0, msg: '추출 시작…' });
      pollRef.current = window.setInterval(async () => {
        try {
          const st = await getExtractStatus(session, r.job_id);
          const j = st.job;
          setCold({ jobId: r.job_id, pct: j.pct ?? 0, msg: j.msg || j.state });
          if (j.state === 'done') {
            if (pollRef.current) window.clearInterval(pollRef.current);
            pollRef.current = null;
            await saveTcFromJob(session, complex.complex_no, r.job_id);
            setCold(null);
            await loadSnaps();
            // 방금 스냅샷(최신) vs 자동 선택된 이전 → 즉시 비교
            await runCompare({});
          } else if (j.state === 'error' || j.state === 'cancelled' || j.state === 'blocked') {
            if (pollRef.current) window.clearInterval(pollRef.current);
            pollRef.current = null;
            setCold(null);
            setErr(`콜드추출 실패: ${j.error || j.state}`);
          }
        } catch (e) {
          if (pollRef.current) window.clearInterval(pollRef.current);
          pollRef.current = null;
          setCold(null);
          setErr(String(e));
        }
      }, 2500);
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.status} · ${e.message}` : String(e));
    }
  }

  async function runSelectedCompare() {
    if (sel.length !== 2) return;
    // savedAt 문자열('YYYY-MM-DD_HHmm')은 사전순 = 시간순 → 작은 쪽이 older
    const [a, b] = [...sel].sort();
    await runCompare({ older_key: a, newer_key: b });
  }

  async function openSnapshot(meta: TcSnapshotMeta) {
    setOpening(meta.key); setErr('');
    try {
      const r = await getTcSnapshot(session, complex.complex_no, meta.key);
      setViewing(r.snapshot);
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.status} · ${e.message}` : String(e));
    } finally { setOpening(''); }
  }

  if (viewing) {
    return <SnapshotView snap={viewing} onBack={() => setViewing(null)} backLabel="← 시점 선택으로" />;
  }
  if (compare) {
    return <CompareView compare={compare} onBack={() => setCompare(null)} backLabel="← 시점 선택으로" />;
  }

  return (
    <div className="space-y-5">
      <button onClick={onBack}
              className="text-sm text-[color:var(--color-muted)] hover:text-[color:var(--color-brand)]">
        ← 단지 목록으로
      </button>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{complex.name}</h1>
        <div className="text-sm text-[color:var(--color-muted)]">{complex.addr_full || complex.addr}</div>
      </div>

      {err && <div className="text-sm text-red-600">{err}</div>}
      {notice && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          {notice}
        </div>
      )}

      {/* 콜드추출 진행바 */}
      {cold && (
        <div className="border border-[color:var(--color-border)] rounded-lg p-3">
          <div className="text-sm font-semibold mb-1">지금 콜드추출 중… {Math.round(cold.pct)}%</div>
          <div className="h-2 rounded bg-[color:var(--color-bg-soft)] overflow-hidden">
            <div className="h-full bg-[color:var(--color-brand)] transition-all"
                 style={{ width: `${Math.max(2, cold.pct)}%` }} />
          </div>
          <div className="text-xs text-[color:var(--color-muted)] mt-1">{cold.msg}</div>
        </div>
      )}

      {/* 비교 실행 */}
      <div className="border border-[color:var(--color-border)] rounded-lg p-4 space-y-3">
        <div className="text-sm font-bold">시점 비교</div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>기준일</span>
          <input type="date" value={baseDate} onChange={e => setBaseDate(e.target.value)}
                 className="h-9 px-2 rounded border border-[color:var(--color-border)]" />
          <span className="text-[color:var(--color-muted)]">→ 최신 스냅샷과 비교</span>
          <button onClick={() => void runCompare({ base_date: baseDate })}
                  disabled={comparing || loading || snaps.length === 0 || !!cold}
                  className="h-9 px-4 rounded bg-[color:var(--color-brand)] text-white text-sm font-semibold disabled:opacity-50">
            {comparing ? '비교 중…' : '비교 실행'}
          </button>
          <button onClick={() => void onColdExtract()}
                  disabled={!!cold || comparing}
                  className="h-9 px-4 rounded bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50"
                  title="지금 시점의 매물을 새로 추출해 스냅샷으로 저장한 뒤 비교합니다">
            지금 콜드추출
          </button>
        </div>
        <div className="text-xs text-[color:var(--color-muted)]">
          기준일에 스냅샷이 없으면 그 이전의 가장 가까운 스냅샷과 비교합니다.
        </div>
      </div>

      {/* 저장된 스냅샷 목록 */}
      <div>
        <div className="text-sm font-bold mb-2">
          저장된 스냅샷 {loading ? '' : `(${snaps.length})`}
        </div>
        {loading ? (
          <div className="text-sm text-[color:var(--color-muted)]">불러오는 중…</div>
        ) : snaps.length === 0 ? (
          <div className="text-sm text-[color:var(--color-muted)]">
            아직 스냅샷이 없습니다. 내일 오전 10시 자동 저장을 기다리거나 "지금 콜드추출"을 실행하세요.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {snaps.map(s => {
                const on = sel.includes(s.key);
                return (
                  <span key={s.key}
                        className={`inline-flex items-center gap-1 pl-1.5 pr-1 py-0.5 rounded border text-xs font-mono ${
                          on
                            ? 'border-[color:var(--color-brand)] bg-[color:var(--color-brand)]/10 text-[color:var(--color-brand)]'
                            : 'border-[color:var(--color-border)] bg-[color:var(--color-bg-soft)]'
                        }`}>
                    <input type="checkbox" checked={on} onChange={() => toggleSel(s.key)}
                           className="accent-[color:var(--color-brand)] cursor-pointer"
                           title="선택 비교용 체크 (2개)" />
                    <span className="cursor-pointer select-none" onClick={() => toggleSel(s.key)}>
                      {s.savedAt}
                    </span>
                    <button onClick={() => void openSnapshot(s)} disabled={!!opening}
                            className="px-1 rounded hover:bg-[color:var(--color-bg-soft)] disabled:opacity-50"
                            title="스냅샷 당시 매물 목록 보기">
                      {opening === s.key ? '…' : '📋'}
                    </button>
                  </span>
                );
              })}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <button onClick={() => void runSelectedCompare()}
                      disabled={sel.length !== 2 || comparing || !!cold}
                      className="h-8 px-3 rounded bg-[color:var(--color-brand)] text-white text-xs font-semibold disabled:opacity-40">
                {comparing ? '비교 중…' : `선택 비교 (${sel.length}/2)`}
              </button>
              {sel.length > 0 && (
                <button onClick={() => setSel([])}
                        className="h-8 px-2 rounded border border-[color:var(--color-border)] text-xs text-[color:var(--color-muted)]">
                  선택 해제
                </button>
              )}
            </div>
            <div className="text-xs text-[color:var(--color-muted)] mt-1.5">
              체크 2개 → <b>선택 비교</b> (이른 시점이 자동으로 기준이 됩니다) · 📋 클릭 → 그 당시 매물 목록
            </div>
          </>
        )}
      </div>
    </div>
  );
}
