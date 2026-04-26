import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  listPortfolio,
  comparePortfolio,
  deletePortfolio,
  ApiError,
  type PortfolioListItem,
  type PortfolioCompare,
  type PortfolioSnapshotStats,
} from '../lib/api';

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

function PriceStatBlock({ trade, before, after }: {
  trade: string;
  before?: PortfolioSnapshotStats['priceStats'][string];
  after?: PortfolioSnapshotStats['priceStats'][string];
}) {
  if (!before && !after) return null;
  const b = before ?? { count: 0, min: 0, max: 0, median: 0, avg: 0 };
  const a = after  ?? { count: 0, min: 0, max: 0, median: 0, avg: 0 };
  return (
    <div className="p-3 rounded-lg border border-[color:var(--color-border)] bg-white">
      <div className="text-xs text-[color:var(--color-muted)] mb-2">{trade} 가격대 (만원)</div>
      <div className="grid grid-cols-3 gap-2 text-xs font-mono">
        <div>
          <div className="text-[color:var(--color-muted)]">최저</div>
          <div>{b.min.toLocaleString()} → <span className="font-bold">{a.min.toLocaleString()}</span></div>
          <div className="text-[10px]">{diffNum(b.min, a.min)}</div>
        </div>
        <div>
          <div className="text-[color:var(--color-muted)]">중간값</div>
          <div>{b.median.toLocaleString()} → <span className="font-bold">{a.median.toLocaleString()}</span></div>
          <div className="text-[10px]">{diffNum(b.median, a.median)}</div>
        </div>
        <div>
          <div className="text-[color:var(--color-muted)]">최고</div>
          <div>{b.max.toLocaleString()} → <span className="font-bold">{a.max.toLocaleString()}</span></div>
          <div className="text-[10px]">{diffNum(b.max, a.max)}</div>
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

      {/* 가격 통계 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        {trades.map(t => (
          <PriceStatBlock
            key={t}
            trade={t}
            before={compare.older.stats?.priceStats?.[t]}
            after={compare.newer.stats?.priceStats?.[t]}
          />
        ))}
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
