// File System Access API — Nfind 폴더 자동 저장
// 첫 호출: 사용자가 Nfind 루트 폴더 1회 선택 → IndexedDB 에 handle 보관
// 이후:   저장된 handle 재사용, 권한만 확인 후 바로 쓰기

const DB_NAME  = 'nfind-fsa';
const DB_STORE = 'handles';
const KEY_ROOT = 'nfind-root';

// ── 브라우저 지원 여부 ──────────────────────────────────────────────────────
export function isFsaSupported(): boolean {
  return typeof window !== 'undefined'
    && 'showDirectoryPicker' in window
    && typeof (window as unknown as { showDirectoryPicker: unknown }).showDirectoryPicker === 'function';
}

// ── IndexedDB (handle persistence) ──────────────────────────────────────────
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openDB();
    return await new Promise<T | null>((resolve) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const rq = tx.objectStore(DB_STORE).get(key);
      rq.onsuccess = () => resolve((rq.result ?? null) as T | null);
      rq.onerror   = () => resolve(null);
    });
  } catch { return null; }
}

async function idbPut<T>(key: string, val: T): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(val as unknown, key);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

async function idbDel(key: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => resolve();
    });
  } catch { /* noop */ }
}

// ── 권한 확인 ───────────────────────────────────────────────────────────────
type PermStatus = 'granted' | 'denied' | 'prompt';
interface DirHandleExt {
  name: string;
  queryPermission?:   (o: { mode: 'read' | 'readwrite' }) => Promise<PermStatus>;
  requestPermission?: (o: { mode: 'read' | 'readwrite' }) => Promise<PermStatus>;
  getDirectoryHandle: (name: string, opts?: { create?: boolean }) => Promise<DirHandleExt>;
  getFileHandle:      (name: string, opts?: { create?: boolean }) => Promise<FileHandleExt>;
}
interface FileHandleExt {
  createWritable: () => Promise<FileSystemWritableFileStream>;
}

async function ensurePermission(handle: DirHandleExt): Promise<boolean> {
  const opts = { mode: 'readwrite' as const };
  try {
    let perm = handle.queryPermission ? await handle.queryPermission(opts) : 'prompt';
    if (perm === 'granted') return true;
    perm = handle.requestPermission ? await handle.requestPermission(opts) : 'denied';
    return perm === 'granted';
  } catch { return false; }
}

// ── 루트 핸들 취득 ──────────────────────────────────────────────────────────
export async function getOrPickNfindRoot(opts?: { forceRepick?: boolean }): Promise<DirHandleExt | null> {
  if (!isFsaSupported()) return null;

  if (!opts?.forceRepick) {
    const saved = await idbGet<DirHandleExt>(KEY_ROOT);
    if (saved) {
      if (await ensurePermission(saved)) return saved;
      // 권한 거부 → 폴더 재선택 유도
    }
  }
  try {
    const picker = (window as unknown as {
      showDirectoryPicker: (o: { id?: string; mode?: 'read' | 'readwrite'; startIn?: string }) => Promise<DirHandleExt>;
    }).showDirectoryPicker;
    const handle = await picker({
      id:      'nfind-root',
      mode:    'readwrite',
      startIn: 'documents',
    });
    await idbPut(KEY_ROOT, handle);
    return handle;
  } catch {
    // 사용자 취소
    return null;
  }
}

export async function forgetNfindRoot(): Promise<void> {
  await idbDel(KEY_ROOT);
}

export async function getSavedRootName(): Promise<string | null> {
  const h = await idbGet<DirHandleExt>(KEY_ROOT);
  return h ? h.name : null;
}

// ── 파일 쓰기 ───────────────────────────────────────────────────────────────
export async function writeFileToPath(
  root: DirHandleExt,
  subDirs: string[],
  filename: string,
  bytes: ArrayBuffer | Uint8Array | Blob,
): Promise<void> {
  let dir = root;
  for (const seg of subDirs) {
    if (!seg) continue;
    dir = await dir.getDirectoryHandle(seg, { create: true });
  }
  const fileHandle = await dir.getFileHandle(filename, { create: true });
  const w = await fileHandle.createWritable();
  try {
    await w.write(bytes as unknown as FileSystemWriteChunkType);
  } finally {
    await w.close();
  }
}
