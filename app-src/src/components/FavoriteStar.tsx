import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  addFavorite, removeFavorite, type ComplexItem, type FavoriteItem, ApiError,
} from '../lib/api';

interface Props {
  session:   Session | null;
  complex:   ComplexItem;
  favorite?: FavoriteItem | null;           // 이미 관심단지인지 (null/undef = 아님)
  folders:   string[];                      // 기존 폴더명 목록 (중복 방지)
  onChanged: (favorite: FavoriteItem | null) => void;  // 토글/폴더변경 후 콜백
  className?: string;
  size?:     'sm' | 'md';
}

/** ★ 토글 버튼. 클릭 시:
 *  - 관심단지 아니면: 폴더 선택 팝오버 → 추가
 *  - 관심단지면:     팝오버로 폴더 변경/삭제 선택
 */
export default function FavoriteStar({
  session, complex, favorite, folders, onChanged, className = '', size = 'md',
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newFolder, setNewFolder] = useState('');
  const [err, setErr] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);

  const isFav = Boolean(favorite);
  const dim = size === 'sm' ? 'h-7 w-7 text-sm' : 'h-9 w-9 text-base';

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  async function saveTo(folderName: string) {
    setBusy(true); setErr('');
    try {
      const r = await addFavorite(session, complex, folderName);
      onChanged(r.item);
      setOpen(false);
      setNewFolder('');
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.status} · ${e.message}` : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeIt() {
    setBusy(true); setErr('');
    try {
      await removeFavorite(session, complex.complex_no);
      onChanged(null);
      setOpen(false);
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.status} · ${e.message}` : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={rootRef} className={`relative inline-block ${className}`}
         onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        disabled={busy}
        title={isFav ? `관심단지 · ${favorite?.folder_name || '(폴더 없음)'}` : '관심단지 추가'}
        className={
          `${dim} rounded-full flex items-center justify-center transition ` +
          (isFav
            ? 'bg-amber-400 text-white hover:bg-amber-500'
            : 'bg-[color:var(--color-bg-soft)] text-[color:var(--color-muted)] hover:bg-[#edeff7]')
        }
      >
        {isFav ? '★' : '☆'}
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+4px)] z-20 w-56 rounded-xl bg-white shadow-lg border border-[color:var(--color-border)] p-2 text-sm">
          <div className="px-2 py-1 text-xs text-[color:var(--color-muted)] font-semibold">
            {isFav ? '폴더 변경' : '폴더 선택'}
          </div>
          <button
            type="button"
            onClick={() => saveTo('')}
            disabled={busy}
            className="w-full text-left px-2 py-1.5 rounded hover:bg-[color:var(--color-bg-soft)] flex items-center justify-between"
          >
            <span>(폴더 없음)</span>
            {isFav && favorite?.folder_name === '' && <span>✓</span>}
          </button>
          {folders.filter(f => f).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => saveTo(f)}
              disabled={busy}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-[color:var(--color-bg-soft)] flex items-center justify-between"
            >
              <span className="truncate">{f}</span>
              {isFav && favorite?.folder_name === f && <span>✓</span>}
            </button>
          ))}
          <div className="mt-1 pt-1 border-t border-[color:var(--color-border)]">
            <div className="flex gap-1">
              <input
                value={newFolder}
                onChange={e => setNewFolder(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newFolder.trim()) { e.preventDefault(); saveTo(newFolder.trim()); }
                }}
                placeholder="+ 새 폴더"
                className="flex-1 min-w-0 h-8 px-2 rounded border border-[color:var(--color-border)] text-xs focus:outline-none focus:border-[color:var(--color-brand)]"
              />
              <button
                type="button"
                disabled={busy || !newFolder.trim()}
                onClick={() => saveTo(newFolder.trim())}
                className="h-8 px-2 rounded bg-[color:var(--color-brand)] text-white text-xs font-semibold disabled:bg-[#b5aeea]"
              >추가</button>
            </div>
          </div>
          {isFav && (
            <button
              type="button"
              onClick={removeIt}
              disabled={busy}
              className="mt-1 w-full text-left px-2 py-1.5 rounded text-red-700 hover:bg-red-50 text-xs"
            >
              관심단지에서 제거
            </button>
          )}
          {err && <div className="mt-1 px-2 text-xs text-red-700">{err}</div>}
        </div>
      )}
    </div>
  );
}
