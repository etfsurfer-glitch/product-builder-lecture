// 맥미니 FastAPI 서버 호출 래퍼
import type { Session } from '@supabase/supabase-js';
import { isHostAlive } from './health';

// VITE_API_BASE_BACKUP 가 빌드 시 주입되면 멀티 호스트 페일오버 활성.
// 비어 있으면 단일 호스트 (현재 운영) 동작 유지.
const PRIMARY_API = import.meta.env.VITE_API_BASE ?? 'https://api.runto.online';
const BACKUP_API  = (import.meta.env.VITE_API_BASE_BACKUP as string | undefined) || '';
export const API_HOSTS: readonly string[] = BACKUP_API ? [PRIMARY_API, BACKUP_API] : [PRIMARY_API];

// 호환용 — App.tsx 가 표시 hostname 추출에 사용. 항상 primary 를 노출.
export const API_BASE = PRIMARY_API;
export const IS_TEST_BUILD = import.meta.env.VITE_IS_TEST_BUILD === '1';

// ── 멀티 호스트 페일오버 ──────────────────────────────────────────────────────
// 동작: 백그라운드 health pinger 가 호스트 alive/dead 상태를 추적 (lib/health.ts).
//   요청 전 dead 호스트는 후순위로 미루고, 살아있는 호스트만 우선 시도. per-request
//   timeout 으로 죽음을 감지하지 않으므로 느린 매물 조회도 abort 안 됨.
// 폴백 트리거: 네트워크 에러 또는 origin-down 5xx (502/503/504/521~526/530).
//   500 같은 app-level 에러는 폴백 안 함 (백업도 같은 코드라 같은 에러 가능성).
// sticky: 한 번 사용한 호스트를 30분 우선. dead 가 된 sticky 는 자동 우회.
// 안전망: HARD_CAP_MS — 정말 stuck 된 요청만 끊는 상한선 (의도된 abort 가 아님).
const STICKY_IDX_KEY = 'runto_api_host_idx';
const STICKY_EXP_KEY = 'runto_api_host_idx_exp';
const ADMIN_FORCE_KEY = 'admin_force_host_idx';   // 관리자 전용 강제 호스트 (-1 = 자동)
const STICKY_TTL_MS  = 30 * 60 * 1000;

// 관리자 강제 호스트 — AdminPage 의 서버 선택기. -1 (자동) / 0 (A) / 1 (B).
// 설정되어 있으면 fetchWithFailover 가 sticky 무시하고 강제 호스트만 사용 (페일오버 안 함).
export function getAdminForceHostIdx(): number {
  try {
    const v = parseInt(localStorage.getItem(ADMIN_FORCE_KEY) ?? '-1', 10);
    if (v >= 0 && v < API_HOSTS.length) return v;
  } catch { /* 무시 */ }
  return -1;
}
export function setAdminForceHostIdx(idx: number) {
  try {
    if (idx < 0 || idx >= API_HOSTS.length) {
      localStorage.removeItem(ADMIN_FORCE_KEY);
    } else {
      localStorage.setItem(ADMIN_FORCE_KEY, String(idx));
    }
  } catch { /* 무시 */ }
}
const HARD_CAP_MS    = 180_000;  // 안전망 — 정상 요청은 절대 닿지 않아야 함.
// Cloudflare 가 origin 도달 실패 시 반환하는 코드 셋 — 다음 호스트로 폴백 트리거.
const ORIGIN_DOWN_STATUS = new Set([502, 503, 504, 521, 522, 523, 524, 525, 526, 530]);

function getStickyIdx(): number {
  if (API_HOSTS.length < 2) return 0;
  try {
    const idx = parseInt(localStorage.getItem(STICKY_IDX_KEY) ?? '0', 10);
    const exp = parseInt(localStorage.getItem(STICKY_EXP_KEY) ?? '0', 10);
    if (idx > 0 && idx < API_HOSTS.length && Date.now() < exp) {
      // sticky 가 dead 상태면 무시 (TTL 안에서 헬스 회복하면 다시 잡힘)
      if (!isHostAlive(API_HOSTS[idx])) return 0;
      return idx;
    }
    if (idx > 0) {
      localStorage.removeItem(STICKY_IDX_KEY);
      localStorage.removeItem(STICKY_EXP_KEY);
    }
  } catch { /* localStorage 비활성: 무시 */ }
  return 0;
}

function setStickyIdx(idx: number) {
  if (API_HOSTS.length < 2) return;
  try {
    if (idx <= 0) {
      localStorage.removeItem(STICKY_IDX_KEY);
      localStorage.removeItem(STICKY_EXP_KEY);
    } else {
      localStorage.setItem(STICKY_IDX_KEY, String(idx));
      localStorage.setItem(STICKY_EXP_KEY, String(Date.now() + STICKY_TTL_MS));
    }
  } catch { /* 무시 */ }
}

function combineSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  const anyFn = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  if (typeof anyFn === 'function') return anyFn([a, b]);
  const ctrl = new AbortController();
  const link = (s: AbortSignal) => {
    if (s.aborted) ctrl.abort(s.reason);
    else s.addEventListener('abort', () => ctrl.abort(s.reason), { once: true });
  };
  link(a); link(b);
  return ctrl.signal;
}

async function fetchWithFailover(path: string, init: RequestInit = {}): Promise<Response> {
  if (API_HOSTS.length === 1) {
    return fetch(`${API_HOSTS[0]}${path}`, init);
  }
  // 관리자 강제 호스트 — 설정되어 있으면 페일오버 없이 그 호스트만 사용
  const forced = getAdminForceHostIdx();
  if (forced >= 0) {
    return fetch(`${API_HOSTS[forced]}${path}`, init);
  }
  const startIdx = getStickyIdx();
  // sticky 부터 라운드로빈 → alive 우선, dead 호스트는 마지막에 시도 (헬스가 틀릴 가능성 대비)
  const raw: number[] = [];
  for (let off = 0; off < API_HOSTS.length; off++) {
    raw.push((startIdx + off) % API_HOSTS.length);
  }
  const aliveIdx = raw.filter(i => isHostAlive(API_HOSTS[i]));
  const deadIdx  = raw.filter(i => !isHostAlive(API_HOSTS[i]));
  const order = aliveIdx.length > 0 ? [...aliveIdx, ...deadIdx] : raw;

  let lastErr: unknown = null;
  for (const idx of order) {
    const ctrl  = new AbortController();
    const timer = setTimeout(
      () => ctrl.abort(new DOMException('hard-timeout', 'AbortError')),
      HARD_CAP_MS,
    );
    try {
      const sig = init.signal ? combineSignals(ctrl.signal, init.signal) : ctrl.signal;
      const res = await fetch(`${API_HOSTS[idx]}${path}`, { ...init, signal: sig });
      clearTimeout(timer);
      // origin-down 응답이면 다음 호스트 시도 (마지막 호스트에선 그대로 반환)
      const isLast = idx === order[order.length - 1];
      if (ORIGIN_DOWN_STATUS.has(res.status) && !isLast) {
        lastErr = new Error(`origin-down ${res.status} from ${API_HOSTS[idx]}`);
        continue;
      }
      setStickyIdx(idx);
      return res;
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      // 호출자가 abort 한 경우엔 폴백 시도 안 함
      if (init.signal?.aborted) throw e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('all api hosts unreachable');
}

// 진단용 — 현재 어느 호스트가 active 인지. App.tsx 등에서 표시 가능.
export function getActiveApiHost(): string { return API_HOSTS[getStickyIdx()]; }

export interface PublicConfig {
  turnstile_site_key: string;
  turnstile_required: boolean;
  supabase_url: string;
  supabase_anon_key: string;
}

export async function fetchPublicConfig(): Promise<PublicConfig> {
  const r = await fetchWithFailover('/api/config/public', { cache: 'no-store' });
  if (!r.ok) throw new Error(`public config ${r.status}`);
  return r.json();
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

// 401 핸들러 — main.tsx 에서 등록. 토큰 만료 시 자동 로그아웃 + 랜딩 이동.
// 동시 다발 401 에 여러번 트리거되지 않도록 가드.
let _onUnauthorized: (() => void | Promise<void>) | null = null;
let _unauthorizedTriggered = false;
export function setUnauthorizedHandler(fn: () => void | Promise<void>) {
  _onUnauthorized = fn;
}

async function request<T>(
  path: string,
  session: Session | null,
  init: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

  const r = await fetchWithFailover(path, { ...init, headers, credentials: 'include' });
  const text = await r.text();
  const body = text ? safeJson(text) : null;
  if (!r.ok) {
    if (r.status === 401 && _onUnauthorized && !_unauthorizedTriggered) {
      _unauthorizedTriggered = true;
      try { await _onUnauthorized(); } catch { /* swallow */ }
    }
    const msg = (body && typeof body === 'object' && 'detail' in body)
      ? String((body as { detail: unknown }).detail)
      : text || `HTTP ${r.status}`;
    throw new ApiError(r.status, msg);
  }
  return body as T;
}
function safeJson(s: string): unknown { try { return JSON.parse(s); } catch { return s; } }

// ── 매물 API ───────────────────────────────────────────────────────────────
export interface ComplexItem {
  complex_no: string;
  obj_idnfr: string;
  name: string;
  slnd_nm: string;
  addr: string;
  addr_full: string;
  세대수?: string;
  입주?: string;
  면적범위?: string;
  lat?: string;
  lng?: string;
  img_dir?: string;
}

export function searchComplex(
  session: Session | null,
  keyword: string,
  sido = '',
  sigungu = '',
) {
  return request<{ ok: boolean; count: number; items: ComplexItem[] }>(
    '/api/search/complex',
    session,
    { method: 'POST', body: JSON.stringify({ keyword, sido, sigungu }) },
  );
}

export function startExtract(
  session: Session | null,
  complex: ComplexItem,
  keyword: string = '',
) {
  return request<{ ok: boolean; job_id: string }>(
    '/api/extract',
    session,
    { method: 'POST', body: JSON.stringify({ kb_complex: complex, keyword }) },
  );
}

export async function serverLogout(session: Session | null): Promise<void> {
  // HttpOnly 쿠키 + 감사 로그. 실패 무시 (Supabase 쪽 signOut 은 반드시 진행).
  try {
    await request<{ ok: boolean }>('/api/auth/logout', session, { method: 'POST' });
  } catch {
    /* swallow */
  }
}

export interface JobStatus {
  id: string;
  kind: string;
  state: 'pending' | 'running' | 'done' | 'error';
  pct: number;
  msg: string;
  error?: string;
  count?: number;
  result?: Record<string, unknown>[];
  created_at: number;
  updated_at: number;
}

export function getExtractStatus(
  session: Session | null,
  jobId: string,
  includeResult = false,
) {
  const qs = includeResult ? '?include_result=true' : '';
  return request<{ ok: boolean; job: JobStatus }>(
    `/api/extract/${jobId}${qs}`,
    session,
  );
}

export function getHealth() {
  return request<{ ok: boolean; bearer: boolean; cookie: boolean }>(
    '/health',
    null,
  );
}

// ── 매물번호 단건 조회 ─────────────────────────────────────────────────────
export interface ArticleInfo {
  aptName?: string;
  address_text?: string;
  dong?: string;
  ho?: string;
  floor_num?: number | null;
  floorInfo?: string;
  tradeType?: string;
  exclusiveArea?: number | null;
  supplyArea?: number | null;
  direction?: string;
  realtor_name?: string;
  broker_tels?: string[];
  article_confirm_ymd?: string;
  cp_name?: string;
  cp_pc_article_url?: string;
  roomCount?: string;
  bathroomCount?: string;
  moveInTypeName?: string;
  moveInPossibleYmd?: string;
  realEstateType?: string;
  realEstateTypeName?: string;
  articleFeatureDesc?: string;
  isalePrice?: number | null;
  premiumPrice?: number | null;
  optionPrice?: number | null;
  price_deal?: number | null;
  price_warrant?: number | null;
  price_rent?: number | null;
  verificationTypeCode?: string;
  verificationTypeName?: string;
  is_apartment?: boolean;
  naver_complex_no?: string;
  // 호수 복구 결과 메타
  _ho_source?: 'naver_api' | 'kb_matched' | 'kb_multi' | 'cp_fallback' | 'pyeongtype_inferred' | 'pyeongtype_multi' | 'hidden';
  _ho_candidates?: string[];
  [k: string]: unknown;
}

export function getArticle(session: Session | null, articleNo: string) {
  return request<{ ok: boolean; article_no: string; info: ArticleInfo }>(
    `/api/article/${encodeURIComponent(articleNo)}`,
    session,
  );
}

// ── 관심단지 ────────────────────────────────────────────────────────────────
export interface FavoriteItem extends ComplexItem {
  folder_name: string;
  sort_order:  number;
  created_at?: string;
}

export function listFavorites(session: Session | null) {
  return request<{ ok: boolean; count: number; items: FavoriteItem[] }>(
    '/api/favorites', session,
  );
}

export function addFavorite(
  session: Session | null,
  complex: ComplexItem,
  folderName = '',
) {
  return request<{ ok: boolean; item: FavoriteItem }>(
    '/api/favorites', session,
    { method: 'POST', body: JSON.stringify({ complex, folder_name: folderName }) },
  );
}

export function updateFavorite(
  session: Session | null,
  complexNo: string,
  patch: { folder_name?: string; sort_order?: number },
) {
  return request<{ ok: boolean; item: FavoriteItem }>(
    `/api/favorites/${encodeURIComponent(complexNo)}`, session,
    { method: 'PATCH', body: JSON.stringify(patch) },
  );
}

export function removeFavorite(session: Session | null, complexNo: string) {
  return request<{ ok: boolean }>(
    `/api/favorites/${encodeURIComponent(complexNo)}`, session,
    { method: 'DELETE' },
  );
}

export interface BulkExtractJob {
  complex_no: string;
  job_id:     string | null;
  name?:      string;
  addr_full?: string;
  error?:     string;
}

// ── 기기 관리 ───────────────────────────────────────────────────────────────
export interface DeviceRow {
  device_id:    string;
  device_type:  'pc' | 'mobile';
  user_agent:   string;
  ip_last:      string;
  bound_at:     string;
  last_used_at: string;
}

export interface DeviceLimits {
  device_limit: number;
  pc_limit:     number;
  mobile_limit: number;
  subscription?: 'free' | 'pro' | '';
}

export interface MeInfo { user_id: string; email: string; is_admin: boolean; }

export function getMe(session: Session | null) {
  return request<{ ok: boolean } & MeInfo>('/api/me', session);
}

export function listMyDevices(session: Session | null) {
  return request<{ ok: boolean; limits: DeviceLimits; devices: DeviceRow[] }>(
    '/api/me/devices', session,
  );
}

// ── admin: 사용자/한도 관리 ─────────────────────────────────────────────────
export interface AdminUserRow {
  user_id:       string;
  email:         string;
  created_at:    string;
  limits:        DeviceLimits;
  device_counts: { pc: number; mobile: number; total?: number };
  // public.users join
  phone?:            string | null;
  office_name?:      string | null;
  subscription?:     'pro' | 'free' | null;
  subscription_end?: string | null;
  usage_count?:      number | null;
}

export function adminSearchUsers(session: Session | null, email: string) {
  const qs = new URLSearchParams({ email }).toString();
  return request<{ ok: boolean; count: number; users: AdminUserRow[] }>(
    `/api/admin/users/search?${qs}`, session,
  );
}

export function adminGetUserDevices(session: Session | null, userId: string) {
  return request<{ ok: boolean; limits: DeviceLimits; devices: DeviceRow[] }>(
    `/api/admin/users/${encodeURIComponent(userId)}/devices`, session,
  );
}

export function adminSetDeviceLimit(
  session: Session | null, userId: string,
  patch: { device_limit?: number; pc_limit?: number; mobile_limit?: number },
) {
  return request<{ ok: boolean; limit: unknown }>(
    `/api/admin/users/${encodeURIComponent(userId)}/device-limit`, session,
    { method: 'PATCH', body: JSON.stringify(patch) },
  );
}

export function adminListUsers(
  session: Session | null,
  page = 1, perPage = 50,
) {
  const qs = new URLSearchParams({ page: String(page), per_page: String(perPage) }).toString();
  return request<{ ok: boolean; page: number; per_page: number; count: number; users: (AdminUserRow & {
    last_sign_in_at?: string | null;
    email_confirmed_at?: string | null;
    banned_until?: string | null;
  })[] }>(`/api/admin/users?${qs}`, session);
}

export interface AdminCreateUserReq {
  email:             string;
  password:          string;
  phone?:            string;
  user_metadata?:    Record<string, unknown>;
  app_metadata?:     Record<string, unknown>;
  email_confirm?:    boolean;
  phone_confirm?:    boolean;
  office_name?:      string;
  subscription?:     'pro' | 'free';
  subscription_end?: string;   // YYYY-MM-DD
  device_limit?:     number;
}

export function adminCreateUser(
  session: Session | null,
  body: AdminCreateUserReq,
) {
  return request<{ ok: boolean; user_id: string; email: string; limits: DeviceLimits }>(
    '/api/admin/users', session,
    { method: 'POST', body: JSON.stringify(body) },
  );
}

export type AdminLogKind = 'auth' | 'article' | 'extraction' | 'security';

export interface DashboardData {
  ok: boolean;
  now: number;
  server: { uptime_sec: number; pid: number; host: string; port: number };
  vpn: {
    available: boolean; connected: boolean; mode: string;
    current_conf: string | null;
    server: string | null;
    confs: string[];
    last_rotate: number;
    rotate_interval_sec: number;
    next_rotate_at: number | null;
    recent_failures: number; fail_threshold: number;
    external_ip: string; raw?: string;
  };
  creds: { bearer: boolean; cookie: boolean; captured_at: number | null };
  jobs: { total: number; pending: number; running: number; done: number; error: number; active: number };
  redis: { connected: boolean };
}

export function adminDashboard(session: Session | null) {
  return request<DashboardData>('/api/admin/dashboard', session);
}

// 이중화: 명시적 host 로 dashboard 호출 (sticky 무관, A·B 각각 호출용)
async function adminDashboardForHost(
  session: Session | null,
  host: string,
): Promise<DashboardData> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  const r = await fetch(`${host}/api/admin/dashboard`, { headers, credentials: 'include' });
  const text = await r.text();
  if (!r.ok) {
    const body = text ? safeJson(text) : null;
    const msg = (body && typeof body === 'object' && 'detail' in body)
      ? String((body as { detail: unknown }).detail)
      : text || `HTTP ${r.status}`;
    throw new ApiError(r.status, msg);
  }
  return JSON.parse(text);
}

// 양쪽 host 동시 호출 — admin 페이지에서 A·B 상태 비교용.
// API_HOSTS 가 1개면 1건만 반환.
export interface DashboardWithHost {
  host: string;
  data: DashboardData | null;
  error: string | null;
}

export async function adminDashboardMulti(
  session: Session | null,
): Promise<DashboardWithHost[]> {
  return Promise.all(
    API_HOSTS.map(async (host) => {
      try {
        const data = await adminDashboardForHost(session, host);
        return { host, data, error: null };
      } catch (e) {
        return {
          host,
          data: null,
          error: e instanceof ApiError ? `${e.status} · ${e.message}` : String(e),
        };
      }
    }),
  );
}

export function adminProxyRotate(session: Session | null) {
  return request<{ ok: boolean; status: unknown }>(
    '/api/admin/proxy/rotate', session, { method: 'POST' },
  );
}

// 이중화: 명시적 host 의 VPN 회전 (sticky·force 무관, A·B 각각 회전 버튼용)
export async function adminProxyRotateForHost(
  session: Session | null,
  host: string,
): Promise<{ ok: boolean; status: unknown }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  const r = await fetch(`${host}/api/admin/proxy/rotate`, {
    method: 'POST', headers, credentials: 'include',
  });
  const text = await r.text();
  if (!r.ok) {
    const body = text ? safeJson(text) : null;
    const msg = (body && typeof body === 'object' && 'detail' in body)
      ? String((body as { detail: unknown }).detail)
      : text || `HTTP ${r.status}`;
    throw new ApiError(r.status, msg);
  }
  return JSON.parse(text);
}

export function adminFetchLogs(
  session: Session | null,
  kind: AdminLogKind,
  opts: { email?: string; event_type?: string; limit?: number } = {},
) {
  const qs = new URLSearchParams();
  if (opts.email)      qs.set('email', opts.email);
  if (opts.event_type) qs.set('event_type', opts.event_type);
  qs.set('limit', String(opts.limit ?? 100));
  return request<{ ok: boolean; kind: string; count: number; rows: Record<string, unknown>[] }>(
    `/api/admin/logs/${kind}?${qs.toString()}`, session,
  );
}

export function adminDeleteDevice(
  session: Session | null, userId: string, deviceId: string,
) {
  return request<{ ok: boolean }>(
    `/api/admin/users/${encodeURIComponent(userId)}/devices/${encodeURIComponent(deviceId)}`,
    session, { method: 'DELETE' },
  );
}

export function adminResetAllDevices(
  session: Session | null, userId: string,
) {
  return request<{ ok: boolean }>(
    `/api/admin/users/${encodeURIComponent(userId)}/devices`,
    session, { method: 'DELETE' },
  );
}

export function adminDeleteUser(session: Session | null, userId: string) {
  return request<{ ok: boolean; deleted_user_id: string }>(
    `/api/admin/users/${encodeURIComponent(userId)}`, session,
    { method: 'DELETE' },
  );
}

export function adminSetPassword(
  session: Session | null, userId: string, password: string,
) {
  return request<{ ok: boolean }>(
    `/api/admin/users/${encodeURIComponent(userId)}/password`,
    session, { method: 'PATCH', body: JSON.stringify({ password }) },
  );
}

export function adminSetSubscription(
  session: Session | null, userId: string,
  patch: { subscription?: 'pro' | 'free'; subscription_end?: string },
) {
  return request<{ ok: boolean; row: unknown }>(
    `/api/admin/users/${encodeURIComponent(userId)}/subscription`,
    session, { method: 'PATCH', body: JSON.stringify(patch) },
  );
}

// ── 엑셀/CSV/ZIP 내보내기 ───────────────────────────────────────────────────
export interface ExportReq {
  job_id?:       string;
  job_ids?:      string[];
  group_on?:     boolean;
  export_name?:  string;
  include_excel?: boolean;
  include_csv?:   boolean;
}

async function downloadExport(
  session: Session | null, path: string, body: ExportReq, defaultName: string,
) {
  const r = await fetchWithFailover(path, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    let msg = t;
    try { msg = (JSON.parse(t) as { detail?: string }).detail || t; } catch {}
    throw new ApiError(r.status, msg || `HTTP ${r.status}`);
  }
  const cd = r.headers.get('content-disposition') || '';
  const mUtf = cd.match(/filename\*=UTF-8''([^;]+)/i);
  const mAsc = cd.match(/filename="([^"]+)"/i);
  const filename = mUtf ? decodeURIComponent(mUtf[1]) : (mAsc ? mAsc[1] : defaultName);
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
}

export function exportExcel(session: Session | null, body: ExportReq) {
  return downloadExport(session, '/api/export/excel', body, 'export.xlsx');
}
export function exportCsv(session: Session | null, body: ExportReq) {
  return downloadExport(session, '/api/export/csv', body, 'export.csv');
}
export function exportZip(session: Session | null, body: ExportReq) {
  return downloadExport(session, '/api/export/zip', body, 'export.zip');
}

// 바이트 반환 — File System Access API 직접 저장용
async function fetchExportBytes(
  session: Session | null, path: string, body: ExportReq,
): Promise<{ bytes: ArrayBuffer; filename: string }> {
  const r = await fetchWithFailover(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    let msg = t;
    try { msg = (JSON.parse(t) as { detail?: string }).detail || t; } catch {}
    throw new ApiError(r.status, msg || `HTTP ${r.status}`);
  }
  const cd = r.headers.get('content-disposition') || '';
  const mUtf = cd.match(/filename\*=UTF-8''([^;]+)/i);
  const mAsc = cd.match(/filename="([^"]+)"/i);
  const filename = mUtf ? decodeURIComponent(mUtf[1]) : (mAsc ? mAsc[1] : 'export');
  const bytes = await r.arrayBuffer();
  return { bytes, filename };
}

export function exportExcelBytes(session: Session | null, body: ExportReq) {
  return fetchExportBytes(session, '/api/export/excel', body);
}
export function exportCsvBytes(session: Session | null, body: ExportReq) {
  return fetchExportBytes(session, '/api/export/csv', body);
}

export function bulkExtractFavorites(
  session: Session | null,
  complexNos: string[],
  keyword = '',
) {
  return request<{ ok: boolean; jobs: BulkExtractJob[] }>(
    '/api/favorites/bulk-extract', session,
    { method: 'POST', body: JSON.stringify({ complex_nos: complexNos, keyword }) },
  );
}

// ── 내 폴더 (Cloudflare R2 매물 스냅샷) ────────────────────────────────────────
export interface PortfolioListItem {
  key:         string;        // R2 object key (= 식별자)
  complexPk:   string;
  savedAt:     string;        // 'YYYY-MM-DD_HHmm'
  size:        number;
  complexName: string;
  address:     string;
}

export interface PortfolioSnapshotStats {
  total:   number;
  byTrade: Record<string, number>;       // {매매:N, 전세:M, 월세:K}
  priceStats: Record<string, {
    count: number; min: number; max: number; median: number; avg: number;
  }>;
}

export interface PortfolioSnapshot {
  savedAt: string;
  complex: { pk: string; name: string; address: string };
  search:  { keyword: string; totalCount: number };
  stats:   PortfolioSnapshotStats;
  rows:    Record<string, unknown>[];
}

export interface PriceStat {
  count: number; min: number; max: number; median: number; avg: number;
}

export interface AreaBucketDiff {
  label: string;                  // 예: '84㎡'
  older: PriceStat | null;        // null 이면 해당 시점에 그 면적대 매물 없음
  newer: PriceStat | null;
}

export interface PortfolioCompare {
  older: { savedAt: string; totalCount: number; stats: PortfolioSnapshotStats };
  newer: { savedAt: string; totalCount: number; stats: PortfolioSnapshotStats };
  added:        Array<Record<string, unknown>>;
  removed:      Array<Record<string, unknown>>;
  priceChanges: Array<Record<string, unknown>>;
  // 거래 → 면적버킷 배열. 두 스냅샷 합쳐 ±1.5㎡ 클러스터링
  byAreaBucket?: Partial<Record<'매매' | '전세' | '월세', AreaBucketDiff[]>>;
}

export function savePortfolio(
  session: Session | null,
  payload: {
    complex_pk: string;
    complex_name: string;
    address?: string;
    keyword?: string;
    rows: Record<string, unknown>[];
  },
) {
  return request<{
    ok: boolean; key: string; savedAt: string; size: number;
    stats: PortfolioSnapshotStats;
  }>(
    '/api/portfolio/save', session,
    { method: 'POST', body: JSON.stringify(payload) },
  );
}

export function listPortfolio(session: Session | null) {
  return request<{ items: PortfolioListItem[] }>(
    '/api/portfolio/list', session,
  );
}

// 큰 스냅샷 다운로드 시 byte 단위 진행률 콜백 가능. onProgress 미지정 시 기존 흐름과 동일.
// total 이 0 이면 Content-Length 미제공 — 호출자 fallback 권장 (예: list 의 size 사용).
export async function getPortfolio(
  session: Session | null,
  key: string,
  onProgress?: (received: number, total: number) => void,
): Promise<PortfolioSnapshot> {
  if (!onProgress) {
    return request<PortfolioSnapshot>(
      `/api/portfolio/get?key=${encodeURIComponent(key)}`, session,
    );
  }
  const headers: Record<string, string> = {};
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  const r = await fetchWithFailover(
    `/api/portfolio/get?key=${encodeURIComponent(key)}`,
    { headers, credentials: 'include' },
  );
  if (!r.ok) {
    const text = await r.text();
    const body = text ? safeJson(text) : null;
    if (r.status === 401 && _onUnauthorized && !_unauthorizedTriggered) {
      _unauthorizedTriggered = true;
      try { await _onUnauthorized(); } catch { /* swallow */ }
    }
    const msg = (body && typeof body === 'object' && 'detail' in body)
      ? String((body as { detail: unknown }).detail)
      : text || `HTTP ${r.status}`;
    throw new ApiError(r.status, msg);
  }
  const total = Number(r.headers.get('content-length') || 0);
  const reader = r.body?.getReader();
  if (!reader) return r.json() as Promise<PortfolioSnapshot>;
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.length;
      onProgress(received, total);
    }
  }
  const merged = new Uint8Array(received);
  let off = 0;
  for (const c of chunks) { merged.set(c, off); off += c.length; }
  return JSON.parse(new TextDecoder('utf-8').decode(merged)) as PortfolioSnapshot;
}

export function deletePortfolio(session: Session | null, key: string) {
  return request<{ ok: boolean }>(
    `/api/portfolio?key=${encodeURIComponent(key)}`, session,
    { method: 'DELETE' },
  );
}

export function comparePortfolio(
  session: Session | null,
  olderKey: string,
  newerKey: string,
) {
  return request<PortfolioCompare>(
    '/api/portfolio/compare', session,
    { method: 'POST', body: JSON.stringify({ older_key: olderKey, newer_key: newerKey }) },
  );
}


// ── admin: 분양권 cache 모니터링 ─────────────────────────────────────────
export interface PresaleComplexSummary {
  naver_complex_no: string;
  presale_code: string;
  complex_name: string | null;
  last_full_fetch_at: string | null;
  article_count: number;
  actual_count: number;
  trades: { 매매: number; 전세: number; 월세: number };
  premium_filled_count: number;
  option_filled_count: number;
}

export function adminPresaleSummary(session: Session | null) {
  return request<{ ok: boolean; count: number; complexes: PresaleComplexSummary[] }>(
    '/api/admin/presale/summary', session,
  );
}

export interface PresaleArticleRow {
  article_no: string;
  naver_complex_no: string;
  presale_code: string;
  building_name: string | null;
  floor_info: string | null;
  trade_type_code: string | null;
  realtor_name: string | null;
  article_confirm_ymd: string | null;
  price_deal: number | null;
  price_warrant: number | null;
  price_rent: number | null;
  deal_or_warrant_prc: string | null;
  premium_min: number | null;
  premium_max: number | null;
  option_price: number | null;
  updated_at: string;
}

export function adminPresaleArticles(
  session: Session | null,
  cno: string, code: string = '', limit: number = 500,
) {
  const qs = new URLSearchParams({
    naver_complex_no: cno,
    ...(code ? { presale_code: code } : {}),
    limit: String(limit),
  }).toString();
  return request<{ ok: boolean; count: number; complex_name: string | null; articles: PresaleArticleRow[] }>(
    `/api/admin/presale/articles?${qs}`, session,
  );
}

export interface PresaleExtractLog {
  id: number;
  naver_complex_no: string;
  presale_code: string | null;
  complex_name: string | null;
  cache_hit_count: number | null;
  changed_count: number | null;
  delete_count: number | null;
  elapsed_sec: number | null;
  cache_valid: boolean | null;
  extracted_at: string;
}

export function adminPresaleLog(
  session: Session | null,
  limit: number = 100, cno: string = '',
) {
  const qs = new URLSearchParams({
    limit: String(limit),
    ...(cno ? { naver_complex_no: cno } : {}),
  }).toString();
  return request<{ ok: boolean; count: number; logs: PresaleExtractLog[] }>(
    `/api/admin/presale/log?${qs}`, session,
  );
}

export interface PresalePopularRow {
  naver_complex_no: string;
  complex_name: string | null;
  extract_count: number;
  avg_elapsed_sec: number;
  avg_hit: number;
  avg_changed: number;
  cache_valid_pct: number;
}

export function adminPresalePopular(
  session: Session | null,
  days: number = 7, limit: number = 30,
) {
  const qs = new URLSearchParams({
    days: String(days), limit: String(limit),
  }).toString();
  return request<{ ok: boolean; days: number; count: number; complexes: PresalePopularRow[] }>(
    `/api/admin/presale/popular?${qs}`, session,
  );
}

// ── admin: 분양권 preheat 리스트 + 수동 트리거 ─────────────────────────────
export interface PresalePreheatEntry {
  naver_complex_no: string;
  presale_code:     string;
  complex_name:     string | null;
  enabled:          boolean;
  priority:         number;
  created_at?:      string;
  updated_at?:      string;
}

export function adminPresalePreheatList(session: Session | null) {
  return request<{ ok: boolean; count: number; entries: PresalePreheatEntry[] }>(
    '/api/admin/presale/preheat-list', session,
  );
}

export function adminPresalePreheatUpsert(
  session: Session | null,
  entry: Omit<PresalePreheatEntry, 'created_at' | 'updated_at'>,
) {
  return request<{ ok: boolean; entry?: PresalePreheatEntry; error?: string }>(
    '/api/admin/presale/preheat-list', session,
    { method: 'POST', body: JSON.stringify(entry) },
  );
}

export function adminPresalePreheatDelete(
  session: Session | null,
  cno: string, code: string = 'B01',
) {
  const qs = new URLSearchParams({
    naver_complex_no: cno, presale_code: code,
  }).toString();
  return request<{ ok: boolean; error?: string }>(
    `/api/admin/presale/preheat-list?${qs}`, session,
    { method: 'DELETE' },
  );
}

export function adminPresaleResetNow(session: Session | null) {
  return request<{
    ok: boolean; articles_err?: string | null; meta_err?: string | null; elapsed_sec?: number;
  }>(
    '/api/admin/presale/reset-now', session,
    { method: 'POST' },
  );
}

export interface PresaleRoutineResult {
  ok: boolean;
  host: string;
  do_delete: boolean;
  delete_result?: unknown;
  preheat_results: Array<{
    ok: boolean;
    naver_complex_no: string;
    presale_code: string;
    complex_name: string;
    count?: number;
    error?: string;
    elapsed_sec: number;
  }>;
  preheated_ok: number;
  preheated_fail: number;
  assigned_count: number;
  total_enabled: number;
  elapsed_sec: number;
}

export function adminPresalePreheatNow(
  session: Session | null,
  host: 'A' | 'B' | 'all' = 'all',
  doDelete: boolean = false,
) {
  const qs = new URLSearchParams({
    host, do_delete: String(doDelete),
  }).toString();
  return request<PresaleRoutineResult>(
    `/api/admin/presale/preheat-now?${qs}`, session,
    { method: 'POST' },
  );
}
