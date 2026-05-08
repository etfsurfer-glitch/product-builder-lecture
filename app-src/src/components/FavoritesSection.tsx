import { useState, useEffect } from 'react';
import type { FavoriteItem } from '../lib/api';

interface Props {
  favorites:       FavoriteItem[];
  loading:         boolean;
  err:             string;
  onOpenSingle:    (fav: FavoriteItem) => void;         // 단건 추출
  onBulkExtract:   (complexNos: string[]) => void;      // 선택 추출
}

// 폴더 그룹화: 'folder_name' 키 기준
function groupByFolder(favs: FavoriteItem[]): Map<string, FavoriteItem[]> {
  const m = new Map<string, FavoriteItem[]>();
  for (const f of favs) {
    const k = f.folder_name || '';
    const a = m.get(k); if (a) a.push(f); else m.set(k, [f]);
  }
  return m;
}

export default function FavoritesSection({
  favorites, loading, err, onOpenSingle, onBulkExtract,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  // 사용자 실수 클릭 방지 — 첫 진입 시 모든 폴더 접힌 상태로 init.
  // 한 번만 (initialized flag) 적용. 이후 사용자 토글은 자유.
  const [foldersInitialized, setFoldersInitialized] = useState(false);
  useEffect(() => {
    if (!foldersInitialized && favorites.length > 0) {
      const allKeys = Array.from(groupByFolder(favorites).keys());
      setCollapsedFolders(new Set(allKeys));
      setFoldersInitialized(true);
    }
  }, [favorites.length, foldersInitialized]);

  function toggleFolder(folder: string) {
    setCollapsedFolders(prev => {
      const s = new Set(prev);
      if (s.has(folder)) s.delete(folder); else s.add(folder);
      return s;
    });
  }

  const total = favorites.length;
  const grouped = groupByFolder(favorites);
  const folderCount = grouped.size;

  function toggleSelect(cno: string) {
    setSelected(prev => {
      const s = new Set(prev);
      if (s.has(cno)) s.delete(cno); else s.add(cno);
      return s;
    });
  }

  function selectFolder(folder: string, all: FavoriteItem[]) {
    setSelected(prev => {
      const s = new Set(prev);
      const folderNos = all.filter(f => (f.folder_name || '') === folder).map(f => f.complex_no);
      const allSelected = folderNos.every(no => s.has(no));
      if (allSelected) folderNos.forEach(no => s.delete(no));
      else folderNos.forEach(no => s.add(no));
      return s;
    });
  }

  function extractSelected() {
    if (!selected.size) return;
    onBulkExtract(Array.from(selected));
    setSelected(new Set());
  }

  function extractFolder(items: FavoriteItem[]) {
    onBulkExtract(items.map(f => f.complex_no));
  }

  if (!expanded) {
    return (
      <div className="mb-6 rounded-xl border border-[color:var(--color-border)] bg-white">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm"
        >
          <span className="font-semibold">
            ▶ 관심단지 ({total}) · 폴더 {folderCount}개
          </span>
          <span className="text-[color:var(--color-muted)]">펼치기</span>
        </button>
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-xl border border-[color:var(--color-border)] bg-white">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[color:var(--color-border)]">
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-sm font-semibold flex items-center gap-2"
        >
          ▼ 관심단지 ({total}) · 폴더 {folderCount}개
        </button>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button
              type="button"
              onClick={extractSelected}
              className="h-8 px-3 rounded-lg bg-[color:var(--color-brand)] text-white text-xs font-semibold hover:bg-[color:var(--color-brand-dark)]"
            >
              선택 {selected.size}개 추출
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="px-4 py-6 text-sm text-[color:var(--color-muted)]">불러오는 중...</div>
      )}
      {err && (
        <div className="mx-4 my-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">{err}</div>
      )}
      {!loading && !err && total === 0 && (
        <div className="px-4 py-6 text-sm text-[color:var(--color-muted)]">
          아직 관심단지가 없습니다. 단지 검색 결과 오른쪽의 ☆ 버튼으로 추가하세요.
        </div>
      )}

      {!loading && total > 0 && (
        <div className="divide-y divide-[color:var(--color-border)]">
          {Array.from(grouped.entries()).map(([folder, items]) => {
            const folderNos = items.map(f => f.complex_no);
            const allSelected = folderNos.every(n => selected.has(n));
            const folderKey = folder || '__none__';
            const isCollapsed = collapsedFolders.has(folderKey);
            const selectedInFolder = folderNos.filter(n => selected.has(n)).length;
            return (
              <div key={folderKey} className="px-4 py-3">
                <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                  <div className="flex items-center gap-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => toggleFolder(folderKey)}
                      className="w-6 h-6 flex items-center justify-center rounded hover:bg-[color:var(--color-bg-soft)] text-[color:var(--color-muted)]"
                      title={isCollapsed ? '폴더 펼치기' : '폴더 접기'}
                    >
                      {isCollapsed ? '▶' : '▼'}
                    </button>
                    <button
                      type="button"
                      onClick={() => selectFolder(folder, favorites)}
                      className="text-sm font-semibold flex items-center gap-2 hover:text-[color:var(--color-brand)] min-w-0"
                      title={allSelected ? '폴더 선택 해제' : '폴더 전체 선택'}
                    >
                      <span className={
                        'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ' +
                        (allSelected
                          ? 'bg-[color:var(--color-brand)] border-[color:var(--color-brand)] text-white'
                          : 'border-[color:var(--color-border-strong)]')
                      }>{allSelected ? '✓' : ''}</span>
                      <span className="truncate">📁 {folder || '(폴더 없음)'}</span>
                      <span className="text-[color:var(--color-muted)] font-normal shrink-0">
                        ({items.length}{selectedInFolder > 0 && isCollapsed ? ` · ${selectedInFolder}선택` : ''})
                      </span>
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => extractFolder(items)}
                    className="h-7 px-2.5 rounded-lg bg-[color:var(--color-bg-soft)] hover:bg-[#edeff7] border border-[color:var(--color-border)] text-xs font-semibold"
                  >
                    폴더 전체 추출
                  </button>
                </div>
                {!isCollapsed && (
                <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
                  {items.map(f => {
                    const sel = selected.has(f.complex_no);
                    return (
                      <div
                        key={f.complex_no}
                        className={
                          'flex items-center gap-2 p-2 pl-3 rounded-lg border transition ' +
                          (sel
                            ? 'border-[color:var(--color-brand)] bg-[color:var(--color-brand-soft)]/30'
                            : 'border-[color:var(--color-border)] bg-white hover:border-[color:var(--color-brand)]')
                        }
                      >
                        <input
                          type="checkbox"
                          checked={sel}
                          onChange={() => toggleSelect(f.complex_no)}
                          className="shrink-0 w-4 h-4 accent-[color:var(--color-brand)]"
                        />
                        <button
                          type="button"
                          onClick={() => onOpenSingle(f)}
                          className="flex-1 min-w-0 text-left"
                        >
                          <div className="font-semibold text-sm truncate">{f.name}</div>
                          <div className="text-xs text-[color:var(--color-muted)] truncate">
                            {f.addr_full || f.addr}
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
