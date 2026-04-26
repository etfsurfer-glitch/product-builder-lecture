import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  listPortfolio,
  comparePortfolio,
  deletePortfolio,
  getPortfolio,
  ApiError,
  type PortfolioListItem,
  type PortfolioCompare,
  type PortfolioSnapshot,
  type AreaBucketDiff,
  type PriceStat,
} from '../lib/api';
import {
  COLUMNS, COLUMNS_GROUPED,
  cellValue, frozenOffset, isLastFrozen, toMobileCols,
  getSortable, groupRows, useIsMobile, ChipBtn,
  type Col, type Row,
} from './ExtractResult';

interface Props { session: Session | null }

// '2026-04-26_1234' → '2026-04-26 12:34'
function fmtSavedAt(s: string): string {
  const m = s.match(/^(\d{4}-\d{2}-\d{2})_(\d{2})(\d{2})$/);
  return m ? `${m[1]} ${m[2]}:${m[3]}` : s;
}

// '2026-04-26T20:31:47' → '2026-04-26 20:31'
function fmtIso(s: string): string {
  const m = s.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  return m ? `${m[1]} ${m[2]}:${m[3]}` : s;
}

function fmtPrice(v: unknown): string {
  if (v == null || v === '' || v === 0) return '—';
  const n = typeof v === 'number' ? v : parseInt(String(v).replace(/,/g, ''), 10);
  if (!Number.isFinite(n) || n === 0) return '—';
  if (n >= 10000) {
    const ok = Math.floor(n / 10000);
    const r = n % 10000;
    return r > 0 ? `${ok}억 ${r.toLocaleString()}만` : `${ok}억`;
  }
  return `${n.toLocaleString()}만`;
}

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

function diffNum(before: number | undefined, after: number | undefined): string {
  const b = before ?? 0;
  const a = after ?? 0;
  const d = a - b;
  if (d === 0) return '0';
  const sign = d > 0 ? '+' : '';
  return `${sign}${d.toLocaleString()}`;
}

export default function Portfolio({ session }: Props) {
  const [items, setItems] = useState<PortfolioListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [compare, setCompare] = useState<PortfolioCompare | null>(null);
  const [comparing, setComparing] = useState(false);
  const [viewing, setViewing] = useState<PortfolioSnapshot | null>(null);
  const [opening, setOpening] = useState<string>('');
  const [progress, setProgress] = useState<{
    phase: 'download' | 'parse';
    received: number;
    total: number;
    complexName: string;
    savedAt: string;
  } | null>(null);

  async function reload() {
    setLoading(true);
    setErr('');
    try {
      const r = await listPortfolio(session);
      setItems(r.items);
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.status} · ${e.message}` : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 같은 단지(complexPk) 안에서만 비교 허용 — 선택 토글 시 다른 단지는 자동 해제
  function toggleSelect(it: PortfolioListItem) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(it.key)) {
        next.delete(it.key);
        return next;
      }
      // 다른 단지 선택이 이미 있으면 모두 해제
      const sample = [...next][0];
      if (sample) {
        const sampleItem = items.find(x => x.key === sample);
        if (sampleItem && sampleItem.complexPk !== it.complexPk) {
          next.clear();
        }
      }
      // 최대 2개
      if (next.size >= 2) {
        const first = [...next][0];
        next.delete(first);
      }
      next.add(it.key);
      return next;
    });
  }

  async function runCompare() {
    if (selected.size !== 2) return;
    const sels = items.filter(x => selected.has(x.key)).sort((a, b) => a.savedAt.localeCompare(b.savedAt));
    const [older, newer] = sels;
    setComparing(true);
    setErr('');
    try {
      const r = await comparePortfolio(session, older.key, newer.key);
      setCompare(r);
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.status} · ${e.message}` : String(e));
    } finally {
      setComparing(false);
    }
  }

  async function openSnapshot(it: PortfolioListItem) {
    setOpening(it.key);
    setErr('');
    setProgress({
      phase: 'download',
      received: 0,
      total: it.size || 0,
      complexName: it.complexName || `(단지 #${it.complexPk})`,
      savedAt: it.savedAt,
    });
    try {
      const snap = await getPortfolio(session, it.key, (received, total) => {
        setProgress(p => p ? { ...p, received, total: total || p.total } : p);
      });
      // bar 가 100% 로 잠깐 보이도록 한 프레임 양보 후 표 구성 단계로 전환
      setProgress(p => p ? { ...p, phase: 'parse', received: p.total } : p);
      await new Promise(r => requestAnimationFrame(() => setTimeout(r, 30)));
      setViewing(snap);
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.status} · ${e.message}` : String(e));
    } finally {
      setOpening('');
      setProgress(null);
    }
  }

  async function removeItem(it: PortfolioListItem) {
    if (!confirm(`${fmtSavedAt(it.savedAt)} 스냅샷을 삭제할까요?\n(${it.complexName})`)) return;
    try {
      await deletePortfolio(session, it.key);
      setSelected(prev => { const n = new Set(prev); n.delete(it.key); return n; });
      await reload();
    } catch (e) {
      alert(e instanceof ApiError ? `${e.status} · ${e.message}` : String(e));
    }
  }

  // 단지별 그룹화
  const groups = useMemo(() => {
    const map = new Map<string, { complexPk: string; complexName: string; address: string; items: PortfolioListItem[] }>();
    for (const it of items) {
      const g = map.get(it.complexPk);
      if (g) g.items.push(it);
      else map.set(it.complexPk, {
        complexPk: it.complexPk,
        complexName: it.complexName || `(단지 #${it.complexPk})`,
        address: it.address,
        items: [it],
      });
    }
    for (const g of map.values()) g.items.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    return [...map.values()].sort((a, b) => a.complexName.localeCompare(b.complexName));
  }, [items]);

  if (viewing) {
    return <SnapshotView snap={viewing} onBack={() => setViewing(null)} />;
  }

  if (compare) {
    return <CompareView compare={compare} onBack={() => setCompare(null)} />;
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">내 폴더</h1>
          <div className="text-sm text-[color:var(--color-muted)] mt-1">
            저장한 매물 스냅샷 · 6개월 보관 · 같은 단지의 시점 2개를 선택해 비교
          </div>
        </div>
        <button
          onClick={reload}
          className="h-9 px-3 rounded-lg text-sm font-semibold border border-[color:var(--color-border)] bg-white hover:bg-[color:var(--color-bg-soft)]"
        >
          새로고침
        </button>
      </div>

      {err && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm">
          {err}
        </div>
      )}

      {selected.size === 2 && (
        <div className="mb-4 p-3 rounded-lg bg-[color:var(--color-brand-soft)] border border-[color:var(--color-brand)] flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-[color:var(--color-brand)]">
            2개 시점 선택됨 — 비교 가능
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setSelected(new Set())}
              className="h-9 px-3 rounded-lg text-sm font-semibold border border-[color:var(--color-border)] bg-white hover:bg-[color:var(--color-bg-soft)]"
            >해제</button>
            <button
              onClick={runCompare}
              disabled={comparing}
              className="h-9 px-3 rounded-lg text-sm font-semibold bg-[color:var(--color-brand)] text-white hover:bg-[color:var(--color-brand-dark)] disabled:opacity-50"
            >{comparing ? '비교 중...' : '🔍 비교 보기'}</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-[color:var(--color-muted)]"><div className="spinner mx-auto" /></div>
      ) : groups.length === 0 ? (
        <div className="py-16 text-center text-[color:var(--color-muted)]">
          저장된 스냅샷이 없습니다.<br />단지 검색 → 결과 화면 → 「💾 내 폴더에 저장」 버튼으로 보관할 수 있습니다.
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(g => (
            <div key={g.complexPk} className="rounded-xl border border-[color:var(--color-border)] bg-white overflow-hidden">
              <div className="px-4 py-3 bg-[color:var(--color-bg-soft)] border-b border-[color:var(--color-border)]">
                <div className="font-bold truncate">{g.complexName}</div>
                {g.address && <div className="text-xs text-[color:var(--color-muted)] truncate">{g.address}</div>}
              </div>
              <ul className="divide-y divide-[color:var(--color-border)]">
                {g.items.map(it => {
                  const checked = selected.has(it.key);
                  return (
                    <li key={it.key} className={'px-4 py-2.5 flex items-center justify-between gap-3 ' + (checked ? 'bg-[color:var(--color-brand-soft)]' : '')}>
                      <label className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSelect(it)}
                          className="w-4 h-4 accent-[color:var(--color-brand)]"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-mono text-sm">{fmtSavedAt(it.savedAt)}</div>
                          <div className="text-xs text-[color:var(--color-muted)]">
                            {(it.size / 1024).toFixed(1)} KB
                          </div>
                        </div>
                      </label>
                      <button
                        onClick={() => openSnapshot(it)}
                        disabled={opening === it.key}
                        className="h-8 px-2.5 rounded-lg text-xs font-semibold border border-[color:var(--color-border)] bg-white hover:bg-[color:var(--color-bg-soft)] disabled:opacity-50"
                        title="이 시점의 매물 결과 표 열기"
                      >{opening === it.key ? '여는 중...' : '📋 보기'}</button>
                      <button
                        onClick={() => removeItem(it)}
                        className="text-xs text-[color:var(--color-muted)] hover:text-red-700"
                        title="이 스냅샷 삭제"
                      >삭제</button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {progress && (() => {
        const pct = progress.total > 0
          ? Math.min(100, (progress.received / progress.total) * 100)
          : 0;
        const isDownload = progress.phase === 'download';
        return (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white rounded-xl shadow-xl p-5">
              <div className="flex items-center gap-2 mb-1">
                <span aria-hidden>{isDownload ? '📥' : '📊'}</span>
                <span className="font-semibold">
                  {isDownload ? '자료 취합 중...' : '표 구성 중...'}
                </span>
              </div>
              <div className="text-xs text-[color:var(--color-muted)] mb-3 truncate">
                {progress.complexName} · {fmtSavedAt(progress.savedAt)}
              </div>
              <div className="w-full h-2.5 rounded-full bg-[color:var(--color-bg-soft)] overflow-hidden">
                <div
                  className="h-full bg-[color:var(--color-brand)] transition-[width] duration-150"
                  style={{ width: progress.total > 0 ? `${pct}%` : '100%' }}
                />
              </div>
              <div className="mt-2 flex justify-between text-xs font-mono text-[color:var(--color-muted)]">
                <span>
                  {fmtBytes(progress.received)}
                  {progress.total > 0 && ` / ${fmtBytes(progress.total)}`}
                </span>
                <span>
                  {progress.total > 0 ? `${Math.floor(pct)}%` : '...'}
                </span>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}


// ── 단일 스냅샷 뷰 (단지검색 결과와 동일한 표) ─────────────────────────────────

const TRADE_BG: Record<string, string> = {
  매매: 'bg-green-50',
  전세: 'bg-amber-50',
  월세: 'bg-blue-50',
};

function toggleInSet<T>(s: Set<T>, v: T): Set<T> {
  const n = new Set(s);
  if (n.has(v)) n.delete(v); else n.add(v);
  return n;
}

function SnapshotView({ snap, onBack }: { snap: PortfolioSnapshot; onBack: () => void }) {
  const rows = snap.rows as Row[];

  const [groupMode, setGroupMode] = useState(true);
  const [tradeFilter, setTradeFilter] = useState<Set<string>>(new Set());
  const [dongFilter,  setDongFilter]  = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);

  const tradeOptions = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      const t = String(r['매물거래구분명'] ?? '').split('/')[0];
      if (t) s.add(t);
    }
    const order = ['매매', '전세', '월세'];
    return Array.from(s).sort((a, b) =>
      (order.indexOf(a) >= 0 ? order.indexOf(a) : 9) - (order.indexOf(b) >= 0 ? order.indexOf(b) : 9)
    );
  }, [rows]);

  const dongOptions = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      const d = String(r['건물동명'] ?? '').trim();
      if (d) s.add(d);
    }
    return Array.from(s).sort((a, b) => {
      const na = parseInt(a, 10), nb = parseInt(b, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (!tradeFilter.size && !dongFilter.size) return rows;
    return rows.filter(r => {
      if (tradeFilter.size) {
        const t = String(r['매물거래구분명'] ?? '').split('/')[0];
        if (!tradeFilter.has(t)) return false;
      }
      if (dongFilter.size) {
        const d = String(r['건물동명'] ?? '').trim();
        if (!dongFilter.has(d)) return false;
      }
      return true;
    });
  }, [rows, tradeFilter, dongFilter]);

  const groupedRows = useMemo(
    () => (groupMode ? groupRows(filteredRows) : filteredRows),
    [filteredRows, groupMode],
  );

  const displayRows = useMemo(() => {
    if (!sort) return groupedRows;
    const out = [...groupedRows];
    out.sort((a, b) => {
      const av = getSortable(a, sort.key);
      const bv = getSortable(b, sort.key);
      let c: number;
      if (typeof av === 'number' && typeof bv === 'number') c = av - bv;
      else c = String(av).localeCompare(String(bv), 'ko');
      return sort.dir === 'asc' ? c : -c;
    });
    return out;
  }, [groupedRows, sort]);

  const isMobile = useIsMobile();
  const displayCols: Col[] = useMemo(() => {
    // 스냅샷엔 매물설명(특징광고내용) 이 저장되지 않으므로 컬럼에서 제거
    const base = (groupMode ? COLUMNS_GROUPED : COLUMNS).filter(c => c.key !== '특징광고내용');
    return isMobile ? toMobileCols(base) : base;
  }, [groupMode, isMobile]);

  function onHeaderClick(key: string) {
    setSort(prev => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  }

  return (
    <div>
      <button onClick={onBack} className="text-sm text-[color:var(--color-muted)] hover:text-[color:var(--color-brand)] mb-2">
        ← 내 폴더로
      </button>
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight truncate">{snap.complex.name}</h1>
      <div className="text-sm text-[color:var(--color-muted)] truncate mb-1">
        {snap.complex.address || ''}
      </div>
      <div className="text-xs text-[color:var(--color-muted)] font-mono mb-4">
        스냅샷 시점: {fmtIso(snap.savedAt)} · 저장 당시 {snap.search.totalCount}건
      </div>

      {/* 필터 */}
      <div className="mb-3 space-y-2">
        {tradeOptions.length > 1 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-[color:var(--color-muted)] mr-1">거래</span>
            <ChipBtn active={tradeFilter.size === 0} onClick={() => setTradeFilter(new Set())}>전체</ChipBtn>
            {tradeOptions.map(t => (
              <ChipBtn key={t} active={tradeFilter.has(t)}
                       onClick={() => setTradeFilter(s => toggleInSet(s, t))}>{t}</ChipBtn>
            ))}
          </div>
        )}
        {dongOptions.length > 1 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-[color:var(--color-muted)] mr-1">동</span>
            <ChipBtn active={dongFilter.size === 0} onClick={() => setDongFilter(new Set())}>전체</ChipBtn>
            {dongOptions.map(d => (
              <ChipBtn key={d} active={dongFilter.has(d)}
                       onClick={() => setDongFilter(s => toggleInSet(s, d))}>{d}</ChipBtn>
            ))}
          </div>
        )}
      </div>

      <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-[color:var(--color-muted)]">
          총 <span className="font-bold text-[color:var(--color-ink)]">{rows.length}</span>건
          {(tradeFilter.size || dongFilter.size) ? (
            <> · 필터 <span className="font-bold text-[color:var(--color-ink)]">{filteredRows.length}</span>건</>
          ) : null}
          {groupMode && (
            <> → <span className="font-bold text-[color:var(--color-ink)]">{displayRows.length}</span>묶음</>
          )}
        </div>
        <button
          onClick={() => setGroupMode(v => !v)}
          className={
            'h-9 px-3 rounded-lg text-sm font-semibold border transition ' +
            (groupMode
              ? 'bg-[color:var(--color-brand)] text-white border-[color:var(--color-brand)] hover:bg-[color:var(--color-brand-dark)]'
              : 'bg-white text-[color:var(--color-ink)] border-[color:var(--color-border)] hover:bg-[color:var(--color-bg-soft)]')
          }
          title="같은 동·호·거래인 매물을 하나로 묶고 최고/최저가 표시"
        >
          {groupMode ? '묶기 해제' : '동일매물 묶기'}
        </button>
      </div>

      <div className="overflow-auto rounded-xl border border-[color:var(--color-border)] bg-white max-h-[calc(100vh-260px)]">
        <table className="text-[13px] border-collapse" style={{ minWidth: '100%' }}>
          <thead className="bg-[color:var(--color-bg-soft)] border-b border-[color:var(--color-border)] sticky top-0 z-[2]">
            <tr>
              {displayCols.map((c, i) => {
                const off = frozenOffset(displayCols, i);
                const lastFr = isLastFrozen(displayCols, i);
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    onClick={() => onHeaderClick(c.key)}
                    className={
                      'px-2.5 py-2 text-left font-semibold whitespace-nowrap select-none cursor-pointer ' +
                      (c.frozen ? 'sticky bg-[color:var(--color-bg-soft)] z-[3] ' : '') +
                      (lastFr ? 'border-r border-[color:var(--color-border-strong)]' : '')
                    }
                    style={{ width: c.w, minWidth: c.w, left: off ?? undefined }}
                  >
                    {c.label}
                    {active && (sort!.dir === 'asc' ? ' ▲' : ' ▼')}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, i) => {
              const trade = String(row['매물거래구분명'] ?? '').split('/')[0];
              const rowBg = TRADE_BG[trade] ?? 'bg-white';
              const grouped = Boolean(row['_grouped']);
              return (
                <tr
                  key={i}
                  className={`border-b border-[color:var(--color-border)] last:border-b-0 ${rowBg} hover:brightness-97${grouped ? ' font-medium' : ''}`}
                >
                  {displayCols.map((c, j) => {
                    const v = cellValue(row, c);
                    const off = frozenOffset(displayCols, j);
                    const lastFr = isLastFrozen(displayCols, j);
                    return (
                      <td
                        key={c.key}
                        className={
                          'px-2.5 py-1.5 ' +
                          (c.wrap ? 'whitespace-normal break-words ' : 'whitespace-nowrap ') +
                          (c.frozen ? `sticky z-[1] ${rowBg} ` : '') +
                          (lastFr ? 'border-r border-[color:var(--color-border-strong)] shadow-[2px_0_0_0_rgba(0,0,0,0.03)]' : '')
                        }
                        style={{
                          maxWidth: c.wrap ? c.w : undefined,
                          left: off ?? undefined,
                        }}
                        title={c.wrap && v.length > 40 ? v : undefined}
                      >
                        {c.key === '중개업소전화번호' && v
                          ? v.split(', ').map((p, k, arr) => {
                              const digits = p.replace(/[^0-9]/g, '');
                              return (
                                <span key={k}>
                                  {digits ? <a href={`tel:${digits}`} className="text-blue-700 hover:underline">{p}</a> : p}
                                  {k < arr.length - 1 ? ', ' : ''}
                                </span>
                              );
                            })
                          : v}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}


// ── 비교 뷰 ──────────────────────────────────────────────────────────────────

function StatCard({ title, before, after, fmt = (v: number) => v.toLocaleString() }: {
  title: string; before: number; after: number; fmt?: (v: number) => string;
}) {
  const delta = after - before;
  const sign = delta > 0 ? '+' : '';
  const color = delta > 0 ? 'text-green-700' : delta < 0 ? 'text-red-700' : 'text-[color:var(--color-muted)]';
  return (
    <div className="p-3 rounded-lg border border-[color:var(--color-border)] bg-white">
      <div className="text-xs text-[color:var(--color-muted)] mb-1">{title}</div>
      <div className="font-mono text-sm">{fmt(before)} → <span className="font-bold">{fmt(after)}</span></div>
      <div className={`font-mono text-xs ${color}`}>{sign}{fmt(delta)}</div>
    </div>
  );
}

// 한 면적 버킷의 가격대 카드 (older vs newer)
function AreaBucketCard({ label, older, newer }: AreaBucketDiff) {
  const z: PriceStat = { count: 0, min: 0, max: 0, median: 0, avg: 0 };
  const b = older ?? z;
  const a = newer ?? z;
  const has = (s: PriceStat | null) => !!s && s.count > 0;
  return (
    <div className="p-3 rounded-lg border border-[color:var(--color-border)] bg-white">
      <div className="flex items-baseline justify-between mb-2 gap-2">
        <div className="text-sm font-bold">{label}</div>
        <div className="text-[11px] text-[color:var(--color-muted)] font-mono">
          {has(older) ? `${b.count}건` : '—'} → <span className="font-bold">{has(newer) ? `${a.count}건` : '—'}</span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs font-mono">
        <div>
          <div className="text-[color:var(--color-muted)]">최저</div>
          <div>{has(older) ? b.min.toLocaleString() : '—'} → <span className="font-bold">{has(newer) ? a.min.toLocaleString() : '—'}</span></div>
          {has(older) && has(newer) && <div className="text-[10px]">{diffNum(b.min, a.min)}</div>}
        </div>
        <div>
          <div className="text-[color:var(--color-muted)]">중간값</div>
          <div>{has(older) ? b.median.toLocaleString() : '—'} → <span className="font-bold">{has(newer) ? a.median.toLocaleString() : '—'}</span></div>
          {has(older) && has(newer) && <div className="text-[10px]">{diffNum(b.median, a.median)}</div>}
        </div>
        <div>
          <div className="text-[color:var(--color-muted)]">최고</div>
          <div>{has(older) ? b.max.toLocaleString() : '—'} → <span className="font-bold">{has(newer) ? a.max.toLocaleString() : '—'}</span></div>
          {has(older) && has(newer) && <div className="text-[10px]">{diffNum(b.max, a.max)}</div>}
        </div>
      </div>
    </div>
  );
}

function priceFromRow(r: Record<string, unknown>): string {
  const trade = String(r.trade ?? '');
  if (trade === '매매') return fmtPrice(r['매매가']);
  if (trade === '전세') return fmtPrice(r['전세가']);
  if (trade === '월세') {
    const dep = fmtPrice(r['보증금']);
    const m   = fmtPrice(r['월세']);
    return `${dep} / ${m}`;
  }
  return '—';
}

function CompareView({ compare, onBack }: { compare: PortfolioCompare; onBack: () => void }) {
  const trades: string[] = ['매매', '전세', '월세'];
  return (
    <div>
      <button onClick={onBack} className="text-sm text-[color:var(--color-muted)] hover:text-[color:var(--color-brand)] mb-2">
        ← 내 폴더로
      </button>
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-1">시점 비교</h1>
      <div className="text-sm text-[color:var(--color-muted)] mb-6 font-mono">
        {fmtIso(compare.older.savedAt)} → {fmtIso(compare.newer.savedAt)}
      </div>

      {/* 매물 수 + 거래별 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatCard title="총 매물 수" before={compare.older.totalCount} after={compare.newer.totalCount} />
        {trades.map(t => (
          <StatCard
            key={t}
            title={`${t} 매물`}
            before={compare.older.stats?.byTrade?.[t] ?? 0}
            after={compare.newer.stats?.byTrade?.[t] ?? 0}
          />
        ))}
      </div>

      {/* 가격 통계 — 거래 × 전용면적 버킷별 (84A/B 같은 유사면적은 ±1.5㎡ 로 자동 묶음) */}
      <div className="mb-6">
        <div className="text-xs text-[color:var(--color-muted)] mb-2">
          가격대 (만원) · 전용면적 버킷별
        </div>
        {(['매매', '전세', '월세'] as const).map(t => {
          const buckets = compare.byAreaBucket?.[t] ?? [];
          if (buckets.length === 0) return null;
          return (
            <div key={t} className="mb-4">
              <div className="text-sm font-bold mb-2">{t}</div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {buckets.map(b => (
                  <AreaBucketCard key={b.label} label={b.label} older={b.older} newer={b.newer} />
                ))}
              </div>
            </div>
          );
        })}
        {!compare.byAreaBucket && (
          <div className="text-xs text-[color:var(--color-muted)]">
            (구버전 스냅샷 — 면적 버킷 정보가 없어 통계 생략)
          </div>
        )}
      </div>

      {/* 신규 / 이탈 / 가격변동 */}
      <Section title={`🆕 신규 매물 (${compare.added.length})`} rows={compare.added} kind="single" />
      <Section title={`❌ 이탈 매물 (${compare.removed.length})`} rows={compare.removed} kind="single" />
      <PriceChangeSection rows={compare.priceChanges} />
    </div>
  );
}

function Section({ title, rows, kind }: {
  title: string;
  rows: Array<Record<string, unknown>>;
  kind: 'single';
}) {
  if (rows.length === 0) {
    return (
      <div className="mb-4 p-3 rounded-lg bg-[color:var(--color-bg-soft)] text-sm text-[color:var(--color-muted)]">
        <span className="font-semibold">{title}</span> · 변화 없음
      </div>
    );
  }
  return (
    <div className="mb-4 rounded-xl border border-[color:var(--color-border)] bg-white overflow-hidden">
      <div className="px-4 py-2 bg-[color:var(--color-bg-soft)] border-b border-[color:var(--color-border)] text-sm font-bold">{title}</div>
      <div className="overflow-auto max-h-[420px]">
        <table className="w-full text-sm">
          <thead className="bg-white border-b border-[color:var(--color-border)]">
            <tr className="text-left text-[color:var(--color-muted)]">
              <th className="px-3 py-2 font-medium">거래</th>
              <th className="px-3 py-2 font-medium">동·호</th>
              <th className="px-3 py-2 font-medium">층</th>
              <th className="px-3 py-2 font-medium">가격</th>
              <th className="px-3 py-2 font-medium">중개업소</th>
              <th className="px-3 py-2 font-medium">매물번호</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--color-border)]">
            {rows.map((r, i) => {
              void kind;
              return (
                <tr key={String(r.articleNo ?? i)}>
                  <td className="px-3 py-1.5">{String(r.trade ?? '')}</td>
                  <td className="px-3 py-1.5">{String(r.dong ?? '')}동 {String(r.ho ?? '')}</td>
                  <td className="px-3 py-1.5">{String(r.floor ?? '')}</td>
                  <td className="px-3 py-1.5">{priceFromRow(r)}</td>
                  <td className="px-3 py-1.5 truncate max-w-[200px]">{String(r.broker ?? '')}</td>
                  <td className="px-3 py-1.5 font-mono text-xs">{String(r.articleNo ?? '')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PriceChangeSection({ rows }: { rows: Array<Record<string, unknown>> }) {
  if (rows.length === 0) {
    return (
      <div className="mb-4 p-3 rounded-lg bg-[color:var(--color-bg-soft)] text-sm text-[color:var(--color-muted)]">
        <span className="font-semibold">💱 가격 변동 (0)</span> · 변화 없음
      </div>
    );
  }
  return (
    <div className="mb-4 rounded-xl border border-[color:var(--color-border)] bg-white overflow-hidden">
      <div className="px-4 py-2 bg-[color:var(--color-bg-soft)] border-b border-[color:var(--color-border)] text-sm font-bold">
        💱 가격 변동 ({rows.length})
      </div>
      <div className="overflow-auto max-h-[420px]">
        <table className="w-full text-sm">
          <thead className="bg-white border-b border-[color:var(--color-border)]">
            <tr className="text-left text-[color:var(--color-muted)]">
              <th className="px-3 py-2 font-medium">거래</th>
              <th className="px-3 py-2 font-medium">동·호</th>
              <th className="px-3 py-2 font-medium">필드</th>
              <th className="px-3 py-2 font-medium">이전</th>
              <th className="px-3 py-2 font-medium">현재</th>
              <th className="px-3 py-2 font-medium">매물번호</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--color-border)]">
            {rows.map((r, i) => (
              <tr key={String(r.articleNo ?? i)}>
                <td className="px-3 py-1.5">{String(r.trade ?? '')}</td>
                <td className="px-3 py-1.5">{String(r.dong ?? '')}동 {String(r.ho ?? '')}</td>
                <td className="px-3 py-1.5 text-xs text-[color:var(--color-muted)]">{String(r.field ?? '')}</td>
                <td className="px-3 py-1.5 font-mono">{fmtPrice(r.before)}</td>
                <td className="px-3 py-1.5 font-mono font-bold">{fmtPrice(r.after)}</td>
                <td className="px-3 py-1.5 font-mono text-xs">{String(r.articleNo ?? '')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
