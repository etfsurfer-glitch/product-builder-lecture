import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  searchComplex, listFavorites, bulkExtractFavorites,
  type ComplexItem, type FavoriteItem, type BulkExtractJob, ApiError,
} from '../lib/api';
import ExtractResult from './ExtractResult';
import BulkExtractResult from './BulkExtractResult';
import FavoritesSection from './FavoritesSection';
import FavoriteStar from './FavoriteStar';

interface Props { session: Session | null; }

type View =
  | { kind: 'search' }
  | { kind: 'single'; complex: ComplexItem }
  | { kind: 'bulk'; jobs: BulkExtractJob[] };

export default function SearchPanel({ session }: Props) {
  const [view, setView] = useState<View>({ kind: 'search' });
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ComplexItem[]>([]);
  const [err, setErr] = useState('');

  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [favLoading, setFavLoading] = useState(true);
  const [favErr, setFavErr] = useState('');

  // 초기 로드 + view 복귀 시 새로고침
  useEffect(() => {
    if (view.kind !== 'search') return;
    let cancelled = false;
    (async () => {
      setFavLoading(true); setFavErr('');
      try {
        const r = await listFavorites(session);
        if (cancelled) return;
        setFavorites(r.items);
      } catch (e) {
        if (cancelled) return;
        setFavErr(e instanceof ApiError ? `${e.status} · ${e.message}` : String(e));
      } finally {
        if (!cancelled) setFavLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [view.kind, session]);

  const favByNo = useMemo(() => {
    const m = new Map<string, FavoriteItem>();
    for (const f of favorites) m.set(f.complex_no, f);
    return m;
  }, [favorites]);

  const folders = useMemo(() => {
    const s = new Set<string>();
    for (const f of favorites) if (f.folder_name) s.add(f.folder_name);
    return Array.from(s).sort();
  }, [favorites]);

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!keyword.trim()) return;
    setLoading(true); setErr(''); setItems([]);
    try {
      const r = await searchComplex(session, keyword.trim());
      setItems(r.items);
      if (r.items.length === 0) setErr('검색 결과가 없습니다');
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.status} · ${e.message}` : String(e));
    } finally {
      setLoading(false);
    }
  }

  function onFavChanged(complexNo: string, fav: FavoriteItem | null) {
    setFavorites(prev => {
      const without = prev.filter(f => f.complex_no !== complexNo);
      return fav ? [...without, fav] : without;
    });
  }

  async function onBulkExtract(complexNos: string[]) {
    if (!complexNos.length) return;
    try {
      const r = await bulkExtractFavorites(session, complexNos);
      setView({ kind: 'bulk', jobs: r.jobs });
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.status} · ${e.message}` : String(e));
    }
  }

  if (view.kind === 'single') {
    return (
      <ExtractResult
        session={session}
        complex={view.complex}
        keyword={keyword}
        onBack={() => setView({ kind: 'search' })}
      />
    );
  }

  if (view.kind === 'bulk') {
    return (
      <BulkExtractResult
        session={session}
        jobs={view.jobs}
        onBack={() => setView({ kind: 'search' })}
      />
    );
  }

  return (
    <div>
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">단지 검색</h1>
      <p className="text-[color:var(--color-muted)] mb-6">단지명을 입력해 대상을 선택하세요.</p>

      <FavoritesSection
        favorites={favorites}
        loading={favLoading}
        err={favErr}
        onOpenSingle={(fav) => setView({ kind: 'single', complex: fav })}
        onBulkExtract={onBulkExtract}
      />

      <form onSubmit={onSearch} className="flex gap-2 mb-8">
        <input
          type="text"
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          placeholder="예: 은마아파트"
          className="flex-1 h-12 px-4 rounded-xl border border-[color:var(--color-border-strong)] focus:outline-none focus:border-[color:var(--color-brand)] focus:ring-3 focus:ring-[color:var(--color-brand-soft)] text-base"
          autoFocus
        />
        <button
          type="submit"
          disabled={loading || !keyword.trim()}
          className="h-12 px-6 rounded-xl bg-[color:var(--color-brand)] hover:bg-[color:var(--color-brand-dark)] disabled:bg-[#b5aeea] disabled:cursor-not-allowed text-white font-semibold"
        >
          {loading ? '검색 중...' : '검색'}
        </button>
      </form>

      {err && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm">
          {err}
        </div>
      )}

      {items.length > 0 && (
        <div className="mb-3 text-sm text-[color:var(--color-muted)]">
          {items.length}건의 결과 · 단지를 선택해 매물을 추출하세요
        </div>
      )}

      <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
        {items.map(it => {
          const fav = favByNo.get(it.complex_no) || null;
          return (
            <div
              key={it.complex_no + it.name}
              className="relative p-4 rounded-xl border border-[color:var(--color-border)] hover:border-[color:var(--color-brand)] hover:shadow-sm transition bg-white"
            >
              <button
                type="button"
                onClick={() => setView({ kind: 'single', complex: it })}
                className="block w-full text-left pr-10"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-base mb-1 truncate">{it.name}</div>
                    <div className="text-sm text-[color:var(--color-muted)] truncate">
                      {it.addr_full || it.addr}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs font-semibold px-2 py-1 rounded bg-[color:var(--color-brand-soft)] text-[color:var(--color-brand)]">
                    {it.slnd_nm}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[color:var(--color-muted)]">
                  {it.세대수 && <span>세대수 {it.세대수}</span>}
                  {it.입주 && <span>입주 {it.입주}</span>}
                  {it.면적범위 && <span>면적 {it.면적범위}</span>}
                </div>
              </button>
              <div className="absolute right-3 top-3">
                <FavoriteStar
                  session={session}
                  complex={it}
                  favorite={fav}
                  folders={folders}
                  onChanged={(f) => onFavChanged(it.complex_no, f)}
                  size="sm"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
