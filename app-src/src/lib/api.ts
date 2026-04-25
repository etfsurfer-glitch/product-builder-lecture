// 맥미니 FastAPI 서버 호출 래퍼
import type { Session } from '@supabase/supabase-js';

export const API_BASE = import.meta.env.VITE_API_BASE ?? 'https://api.runto.online';
export const IS_TEST_BUILD = import.meta.env.VITE_IS_TEST_BUILD === '1';

export interface PublicConfig {
  turnstile_site_key: string;
  turnstile_required: boolean;
  supabase_url: string;
  supabase_anon_key: string;
}

export async function fetchPublicConfig(): Promise<PublicConfig> {
  const r = await fetch(`${API_BASE}/api/config/public`, { cache: 'no-store' });
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

  const r = await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: 'include' });
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

export function adminProxyRotate(session: Session | null) {
  return request<{ ok: boolean; status: unknown }>(
    '/api/admin/proxy/rotate', session, { method: 'POST' },
  );
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
  const r = await fetch(`${API_BASE}${path}`, {
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
  const r = await fetch(`${API_BASE}${path}`, {
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
