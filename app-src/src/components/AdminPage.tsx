import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import BulkExtractResult from './BulkExtractResult';
import {
  adminListUsers,
  adminGetUserDevices,
  adminSetDeviceLimit,
  adminDeleteDevice,
  adminCreateUser,
  adminFetchLogs,
  adminResetAllDevices,
  adminSetPassword,
  adminSetSubscription,
  adminDashboardMulti,
  adminProxyRotateForHost,
  adminDeleteUser,
  getAdminForceHostIdx,
  setAdminForceHostIdx,
  API_HOSTS,
  API_HOST_LABELS,
  adminPresaleSummary,
  adminPresaleArticles,
  adminPresaleLog,
  adminPresalePopular,
  adminPresaleResetNow,
  adminPresalePreheatBulkExtract,
  type BulkExtractJob,
  type AdminUserRow,
  type DeviceRow,
  type DeviceLimits,
  type AdminLogKind,
  type DashboardWithHost,
  ApiError,
  type PresaleComplexSummary,
  type PresaleArticleRow,
  type PresaleExtractLog,
  type PresalePopularRow,
  adminHealthFullMulti,
  type HealthFullPerHost,
  type HealthCheck,
  adminOwnershipComplexes,
  adminOwnershipLookup,
  type OwnershipComplex,
  type OwnershipResult
} from '../lib/api';

type AdminUserFull = AdminUserRow & {
  last_sign_in_at?:    string | null;
  email_confirmed_at?: string | null;
  banned_until?:       string | null;
};

interface Props {
  session: Session | null;
  onBack:  () => void;
}

type Tab = 'dash' | 'users' | 'logs' | 'create' | 'presale' | 'health' | 'ownership';

function uaShort(ua: string): string {
  if (!ua) return '';
  if (/iPhone|iPad|iOS/i.test(ua))    return 'iOS';
  if (/Android/i.test(ua))            return 'Android';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua))            return 'Windows';
  return ua.slice(0, 30);
}
function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-2.5 py-2 text-left font-semibold whitespace-nowrap border-b border-[color:var(--color-border)]">{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-2.5 py-1.5 whitespace-nowrap align-top">{children}</td>;
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' });
}

export default function AdminPage({ session, onBack }: Props) {
  const [tab, setTab] = useState<Tab>('dash');
  const [forceHost, setForceHost] = useState<number>(getAdminForceHostIdx());

  function changeForceHost(idx: number) {
    setAdminForceHostIdx(idx);
    setForceHost(idx);
  }

  const showSelector = API_HOSTS.length > 1;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <button onClick={onBack}
                  className="text-sm text-[color:var(--color-muted)] hover:text-[color:var(--color-brand)] mb-2">
            ← 돌아가기
          </button>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">관리자</h1>
        </div>
        {showSelector && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-[color:var(--color-muted)]">서버:</span>
            <div className="flex rounded-lg border border-[color:var(--color-border-strong)] overflow-hidden">
              <button onClick={() => changeForceHost(-1)}
                      className={`px-3 py-1.5 text-xs font-semibold transition ${forceHost === -1
                        ? 'bg-[color:var(--color-brand)] text-white'
                        : 'bg-white hover:bg-[color:var(--color-bg-soft)]'}`}>
                자동
              </button>
              {API_HOST_LABELS.map((label, idx) => {
                const colorMap: Record<string, { active: string; idle: string }> = {
                  KR: { active: 'bg-rose-600 text-white',     idle: 'bg-white text-rose-700 hover:bg-rose-50' },
                  A:  { active: 'bg-emerald-600 text-white',  idle: 'bg-white text-emerald-700 hover:bg-emerald-50' },
                  B:  { active: 'bg-blue-600 text-white',     idle: 'bg-white text-blue-700 hover:bg-blue-50' },
                };
                const colors = colorMap[label] || { active: 'bg-gray-600 text-white', idle: 'bg-white' };
                const flag = label === 'KR' ? '🇰🇷' : label === 'A' ? '🅰️' : label === 'B' ? '🅱️' : '';
                return (
                  <button key={label} onClick={() => changeForceHost(idx)}
                          className={`px-3 py-1.5 text-xs font-bold transition border-l border-[color:var(--color-border-strong)] ${forceHost === idx ? colors.active : colors.idle}`}>
                    {flag} {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="mb-4 border-b border-[color:var(--color-border)] flex gap-1 overflow-x-auto">
        {([['dash','대시보드'],['users','계정관리'],['logs','로그'],['create','신규 등록'],['presale','분양권 캐시'],['health','시스템 점검'],['ownership','소유권정보']] as [Tab,string][]).map(([k,label]) => (
          <button key={k} onClick={() => setTab(k)}
                  className={
                    'px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition ' +
                    (tab === k
                      ? 'border-[color:var(--color-brand)] text-[color:var(--color-brand)]'
                      : 'border-transparent text-[color:var(--color-muted)] hover:text-[color:var(--color-ink)]')
                  }>
            {label}
          </button>
        ))}
      </div>

      {tab === 'dash'    && <DashTab    session={session} />}
      {tab === 'users'   && <UsersTab   session={session} />}
      {tab === 'logs'    && <LogsTab    session={session} />}
      {tab === 'create'  && <CreateTab  session={session} />}
      {tab === 'presale' && <PresaleTab session={session} />}
      {tab === 'health'  && <HealthTab  session={session} />}
      {tab === 'ownership' && <OwnershipTab session={session} />}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Tab 1: 계정관리
// ───────────────────────────────────────────────────────────
function DashTab({ session }: { session: Session | null }) {
  const [results, setResults] = useState<DashboardWithHost[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [auto, setAuto] = useState(true);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    setErr('');
    try {
      const r = await adminDashboardMulti(session);
      setResults(r);
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.status} · ${e.message}` : String(e));
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  useEffect(() => {
    if (!auto) return;
    const id = window.setInterval(() => load(true), 10000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line
  }, [auto]);

  if (loading && results.length === 0) return <div className="p-6 text-sm text-[color:var(--color-muted)]">불러오는 중...</div>;
  if (err && results.length === 0)     return <div className="p-3 rounded bg-red-50 border border-red-200 text-red-800 text-sm">{err}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-xs text-[color:var(--color-muted)]">
          {results.length > 1 ? `${results.length}개 노드` : '단일 노드'} · 동시 조회
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} /> 자동 새로고침
          </label>
          <button onClick={() => load()} disabled={loading}
                  className="h-8 px-2.5 rounded border border-[color:var(--color-border)] text-xs font-semibold hover:bg-[color:var(--color-bg-soft)]">
            새로고침
          </button>
        </div>
      </div>

      <div className={`grid gap-4 ${results.length > 1 ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
        {results.map(r => <DashHostCard key={r.host} result={r} session={session} onReload={() => load(true)} />)}
      </div>
    </div>
  );
}

// 단일 host 의 dashboard 표시
function DashHostCard({
  result, session, onReload,
}: {
  result: DashboardWithHost;
  session: Session | null;
  onReload: () => void;
}) {
  const [rotating, setRotating] = useState(false);
  const hostShort = result.host.replace(/^https?:\/\//, '');
  const hostLabel = hostShort.includes('api-kr')
    ? <span className="text-rose-700">🇰🇷 KR</span>
    : hostShort.startsWith('api.')
      ? <span className="text-emerald-700">🅰️ A</span>
      : <span>{hostShort}</span>;
  const hostShortName = hostShort.includes('api-kr') ? 'KR'
    : hostShort.startsWith('api.') ? 'A'
    : hostShort;

  async function rotate() {
    if (!confirm(`${hostShortName} 서버의 VPN 을 즉시 회전할까요?`)) return;
    setRotating(true);
    try {
      await adminProxyRotateForHost(session, result.host);
      onReload();
    } catch (e) {
      alert(e instanceof ApiError ? `${e.status} · ${e.message}` : String(e));
    } finally {
      setRotating(false);
    }
  }

  if (result.error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-2">
        <div className="text-sm font-semibold flex items-center gap-2">
          {hostLabel} <code className="text-xs text-[color:var(--color-muted)]">{hostShort}</code>
        </div>
        <div className="text-red-800 text-sm">⚠️ {result.error}</div>
      </div>
    );
  }
  if (!result.data) return null;

  const data = result.data;
  const vpn = data.vpn;
  const now = data.now;

  const isDirect = vpn.mode === 'direct';

  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {hostLabel} <code className="text-xs text-[color:var(--color-muted)]">{hostShort}</code>
        </div>
        {!isDirect && (
          <button onClick={rotate} disabled={rotating}
                  className="h-7 px-2.5 rounded-lg bg-[color:var(--color-brand)] text-white text-[11px] font-semibold disabled:bg-[#b5aeea]">
            {rotating ? '회전 중...' : `🔄 ${hostShortName} 회전`}
          </button>
        )}
      </div>
      <div className="text-xs text-[color:var(--color-muted)]">
        시간 {fmtTime(now)} · uptime {fmtUptime(data.server.uptime_sec)} · pid {data.server.pid}
      </div>

      <Card title={isDirect ? "🌐 네트워크 (직접 호출)" : "🌐 VPN"}>
        <KV k="모드" v={isDirect
          ? <span className="text-emerald-700 font-semibold">direct (NordVPN 미사용)</span>
          : vpn.mode} />
        {!isDirect && (
          <>
            <KV k="연결 상태" v={vpn.connected
              ? <span className="text-green-700 font-semibold">연결됨</span>
              : <span className="text-red-700 font-semibold">끊김</span>} />
            <KV k="현재 서버" v={vpn.current_conf || vpn.server || '-'} />
            <KV k="외부 IP" v={vpn.external_ip
              ? <code className="text-xs">{vpn.external_ip}</code>
              : '-'} />
            <KV k="서버 풀" v={`${vpn.confs?.length ?? 0}개 (${(vpn.confs || []).join(', ')})`} />
            <KV k="마지막 회전" v={vpn.last_rotate ? fmtTimeAgo(now - vpn.last_rotate) : '-'} />
            <KV k="다음 정기 회전" v={vpn.next_rotate_at
              ? `${fmtTime(vpn.next_rotate_at)} (${fmtTimeAgo(vpn.next_rotate_at - now, true)})`
              : '비활성'} />
            <KV k="회전 간격" v={vpn.rotate_interval_sec > 0 ? `${Math.round(vpn.rotate_interval_sec/60)}분` : '비활성'} />
            <KV k="최근 실패" v={`${vpn.recent_failures}/${vpn.fail_threshold} (초과 시 자동 회전)`} />
          </>
        )}
        {isDirect && (
          <>
            <KV k="외부 IP" v={vpn.external_ip
              ? <code className="text-xs">{vpn.external_ip}</code>
              : <span className="text-[color:var(--color-muted)]">한국 IDC 직접</span>} />
            <KV k="안내" v={<span className="text-xs text-[color:var(--color-muted)]">NordVPN 없이 한국 IP 로 직접 Naver 호출. outbound IP 라운드로빈 활성 시 다중 IP 분산.</span>} />
          </>
        )}
      </Card>

      <Card title="🔑 인증 크레덴셜">
        <KV k="Bearer" v={data.creds.bearer
          ? <span className="text-green-700">✓</span>
          : <span className="text-red-700">✗</span>} />
        <KV k="Cookie"  v={data.creds.cookie
          ? <span className="text-green-700">✓</span>
          : <span className="text-red-700">✗</span>} />
        <KV k="캡처 시각" v={data.creds.captured_at
          ? fmtTime(data.creds.captured_at) + ` (${fmtTimeAgo(now - data.creds.captured_at)} 전)`
          : '-'} />
      </Card>

      <Card title="⚙️ 백그라운드 작업">
        <KV k="전체" v={String(data.jobs.total)} />
        <KV k="진행 중" v={<><b>{data.jobs.active}</b> <span className="text-xs text-[color:var(--color-muted)]">(대기 {data.jobs.pending} · 실행 {data.jobs.running})</span></>} />
        <KV k="완료" v={String(data.jobs.done)} />
        <KV k="실패" v={String(data.jobs.error)} />
      </Card>

      <Card title="🖥️ 시스템">
        <KV k="호스트:포트" v={`${data.server.host}:${data.server.port}`} />
        <KV k="프로세스 ID" v={String(data.server.pid)} />
        <KV k="업타임" v={fmtUptime(data.server.uptime_sec)} />
        <KV k="Redis" v={data.redis.connected
          ? <span className="text-green-700">연결됨</span>
          : <span className="text-amber-700">끊김 (in-memory fallback 동작)</span>} />
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[color:var(--color-border)] bg-white p-4">
      <div className="text-sm font-semibold mb-3">{title}</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <div className="text-[color:var(--color-muted)] min-w-[110px] shrink-0">{k}</div>
      <div className="text-right min-w-0 break-words">{v}</div>
    </div>
  );
}

function fmtTime(epochSec: number): string {
  const d = new Date(epochSec * 1000);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Seoul' });
}

function fmtUptime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}일 ${h}시간`;
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
}

function fmtTimeAgo(deltaSec: number, future = false): string {
  const abs = Math.abs(Math.round(deltaSec));
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  const core = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
  if (future) return deltaSec > 0 ? `${core} 남음` : '지남';
  return core;
}


function UsersTab({ session }: { session: Session | null }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [users, setUsers] = useState<AdminUserFull[]>([]);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const perPage = 100;

  const [selected, setSelected] = useState<AdminUserFull | null>(null);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [detailLimits, setDetailLimits] = useState<DeviceLimits | null>(null);
  const [detailErr, setDetailErr] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [deviceVal, setDeviceVal] = useState(1);
  const [saving, setSaving] = useState(false);
  const [subsBusy, setSubsBusy] = useState(false);
  const [subEndVal, setSubEndVal] = useState('');
  const [pwVal, setPwVal] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [delBusy, setDelBusy] = useState(false);

  async function load(p = page) {
    setLoading(true); setErr('');
    try {
      const r = await adminListUsers(session, p, perPage);
      setUsers(r.users);
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.status} · ${e.message}` : String(e));
    } finally { setLoading(false); }
  }
  useEffect(() => { load(page); /* eslint-disable-next-line */ }, [page]);

  const visible = filter.trim()
    ? users.filter(u => (u.email || '').toLowerCase().includes(filter.trim().toLowerCase()))
    : users;

  async function openUser(u: AdminUserFull) {
    setSelected(u); setDetailErr(''); setDetailLoading(true); setDevices([]); setDetailLimits(null);
    try {
      const r = await adminGetUserDevices(session, u.user_id);
      setDevices(r.devices); setDetailLimits(r.limits);
      setDeviceVal(r.limits.device_limit);
      setSubEndVal(u.subscription_end || '');
      setPwVal('');
    } catch (e) {
      setDetailErr(e instanceof ApiError ? `${e.status} · ${e.message}` : String(e));
    } finally { setDetailLoading(false); }
  }

  async function saveLimits() {
    if (!selected) return;
    setSaving(true); setDetailErr('');
    try {
      await adminSetDeviceLimit(session, selected.user_id, { device_limit: deviceVal });
      const newLimits: DeviceLimits = {
        device_limit: deviceVal, pc_limit: deviceVal, mobile_limit: deviceVal,
        subscription: detailLimits?.subscription,
      };
      setDetailLimits(newLimits);
      setUsers(prev => prev.map(u => u.user_id === selected.user_id
        ? { ...u, limits: newLimits } : u));
    } catch (e) {
      setDetailErr(e instanceof ApiError ? `${e.status} · ${e.message}` : String(e));
    } finally { setSaving(false); }
  }

  async function changeSubs(newSubs: 'pro' | 'free') {
    if (!selected) return;
    if (!confirm(`플랜을 ${newSubs.toUpperCase()} 로 변경할까요?${newSubs === 'free' ? ' (기기 한도 0으로 전환)' : ''}`)) return;
    setSubsBusy(true); setDetailErr('');
    try {
      await adminSetSubscription(session, selected.user_id, { subscription: newSubs });
      // 클라 상태 반영
      setSelected({ ...selected, subscription: newSubs });
      setUsers(prev => prev.map(u => u.user_id === selected.user_id
        ? { ...u, subscription: newSubs,
            limits: newSubs === 'free'
              ? { device_limit: 0, pc_limit: 0, mobile_limit: 0, subscription: 'free' }
              : { ...u.limits, subscription: 'pro',
                  device_limit: u.limits.device_limit || 1,
                  pc_limit: u.limits.pc_limit || 1,
                  mobile_limit: u.limits.mobile_limit || 1 } }
        : u));
      if (newSubs === 'free') {
        setDeviceVal(0);
        setDetailLimits({ device_limit: 0, pc_limit: 0, mobile_limit: 0, subscription: 'free' });
      } else {
        setDetailLimits(detailLimits ? { ...detailLimits, subscription: 'pro' } : null);
      }
    } catch (e) {
      setDetailErr(e instanceof ApiError ? `${e.status} · ${e.message}` : String(e));
    } finally { setSubsBusy(false); }
  }

  async function saveSubEnd() {
    if (!selected) return;
    setSubsBusy(true); setDetailErr('');
    try {
      await adminSetSubscription(session, selected.user_id,
        { subscription_end: subEndVal });
      setSelected({ ...selected, subscription_end: subEndVal || null });
      setUsers(prev => prev.map(u => u.user_id === selected.user_id
        ? { ...u, subscription_end: subEndVal || null } : u));
    } catch (e) {
      setDetailErr(e instanceof ApiError ? `${e.status} · ${e.message}` : String(e));
    } finally { setSubsBusy(false); }
  }

  async function resetPassword() {
    if (!selected) return;
    if (pwVal.length < 6) { setDetailErr('비밀번호 6자 이상'); return; }
    if (!confirm(`${selected.email} 의 비밀번호를 재설정할까요?`)) return;
    setPwBusy(true); setDetailErr('');
    try {
      await adminSetPassword(session, selected.user_id, pwVal);
      alert(`✓ 비밀번호 변경됨\n${selected.email} / ${pwVal}\n사용자에게 안내해주세요.`);
      setPwVal('');
    } catch (e) {
      setDetailErr(e instanceof ApiError ? `${e.status} · ${e.message}` : String(e));
    } finally { setPwBusy(false); }
  }

  async function deleteUser() {
    if (!selected) return;
    const msg = `⚠ ${selected.email} 계정을 영구 삭제합니다.\n\n- 로그인 불가\n- 기기/관심단지/한도 모두 삭제\n- 과거 로그는 보존 (user_id 만 비움)\n\n계속하시겠습니까?`;
    if (!confirm(msg)) return;
    if (prompt(`확인: 이메일을 그대로 입력하세요`) !== selected.email) {
      alert('이메일 불일치 — 삭제 취소');
      return;
    }
    setDelBusy(true); setDetailErr('');
    try {
      await adminDeleteUser(session, selected.user_id);
      setUsers(prev => prev.filter(u => u.user_id !== selected.user_id));
      setSelected(null);
      setDevices([]);
      setDetailLimits(null);
    } catch (e) {
      setDetailErr(e instanceof ApiError ? `${e.status} · ${e.message}` : String(e));
    } finally {
      setDelBusy(false);
    }
  }

  async function resetAllDevices() {
    if (!selected) return;
    if (!confirm(`${selected.email} 의 모든 기기를 초기화합니다. 계속?`)) return;
    setResetBusy(true); setDetailErr('');
    try {
      await adminResetAllDevices(session, selected.user_id);
      setDevices([]);
      setUsers(prev => prev.map(u => u.user_id === selected.user_id
        ? { ...u, device_counts: { pc: 0, mobile: 0, total: 0 } } : u));
    } catch (e) {
      setDetailErr(e instanceof ApiError ? `${e.status} · ${e.message}` : String(e));
    } finally { setResetBusy(false); }
  }

  async function removeDevice(d: DeviceRow) {
    if (!selected) return;
    if (!confirm(`${uaShort(d.user_agent)} 기기를 해제할까요?`)) return;
    try {
      await adminDeleteDevice(session, selected.user_id, d.device_id);
      setDevices(prev => prev.filter(x => x.device_id !== d.device_id));
      setUsers(prev => prev.map(u => u.user_id === selected.user_id
        ? { ...u, device_counts: {
            pc:     u.device_counts.pc     - (d.device_type === 'pc'     ? 1 : 0),
            mobile: u.device_counts.mobile - (d.device_type === 'mobile' ? 1 : 0),
          }} : u));
    } catch (e) { alert(e instanceof ApiError ? `${e.status} · ${e.message}` : String(e)); }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr),minmax(0,1fr)]">
      <div className="min-w-0">
        <div className="mb-3 flex items-center gap-2 flex-wrap">
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="이메일 필터 (현재 페이지 내)"
            className="flex-1 min-w-[160px] h-9 px-3 rounded-lg border border-[color:var(--color-border-strong)] text-sm focus:outline-none focus:border-[color:var(--color-brand)]"
          />
          <div className="flex items-center gap-1 text-sm">
            <button onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1 || loading}
                    className="h-9 w-9 rounded border border-[color:var(--color-border)] disabled:opacity-40">‹</button>
            <span className="px-2 text-[color:var(--color-muted)]">p.{page}</span>
            <button onClick={() => setPage(p => p + 1)}
                    disabled={loading || users.length < perPage}
                    className="h-9 w-9 rounded border border-[color:var(--color-border)] disabled:opacity-40">›</button>
          </div>
          <button onClick={() => load(page)} disabled={loading}
                  className="h-9 px-3 rounded bg-[color:var(--color-bg-soft)] hover:bg-[#edeff7] border border-[color:var(--color-border)] text-sm font-semibold">
            {loading ? '...' : '새로고침'}
          </button>
        </div>

        {err && <div className="p-3 mb-2 rounded bg-red-50 border border-red-200 text-red-800 text-sm">{err}</div>}

        <div className="overflow-auto rounded-lg border border-[color:var(--color-border)] bg-white max-h-[72vh]">
          <table className="text-[12px] border-collapse w-full">
            <thead className="bg-[color:var(--color-bg-soft)] sticky top-0 z-[1]">
              <tr>
                <Th>이메일</Th>
                <Th>사무소</Th>
                <Th>플랜</Th>
                <Th>기기</Th>
                <Th>사용</Th>
                <Th>최근 로그인</Th>
                <Th>생성</Th>
                <Th>상태</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map(u => {
                const banned = !!u.banned_until;
                const sel = selected?.user_id === u.user_id;
                const subs = u.subscription;
                const total = u.device_counts.total ?? (u.device_counts.pc + u.device_counts.mobile);
                return (
                  <tr key={u.user_id}
                      onClick={() => openUser(u)}
                      className={`border-b border-[color:var(--color-border)] last:border-b-0 cursor-pointer hover:bg-[color:var(--color-bg-soft)] ${sel ? 'bg-[color:var(--color-brand-soft)]/30' : ''}`}>
                    <Td>
                      <div className="font-semibold truncate max-w-[200px]" title={u.email}>{u.email}</div>
                      <div className="text-[11px] text-[color:var(--color-muted)] truncate max-w-[200px]">{u.phone || ''}</div>
                    </Td>
                    <Td>
                      <div className="truncate max-w-[140px]">{u.office_name || ''}</div>
                    </Td>
                    <Td>
                      {subs === 'pro' ? (
                        <span className="px-2 py-0.5 rounded bg-[color:var(--color-brand-soft)] text-[color:var(--color-brand)] text-[11px] font-semibold">pro</span>
                      ) : subs === 'free' ? (
                        <span className="px-2 py-0.5 rounded bg-[color:var(--color-bg-soft)] text-[color:var(--color-muted)] text-[11px] font-semibold">free</span>
                      ) : (
                        <span className="text-[color:var(--color-muted)] text-[11px]">-</span>
                      )}
                      {u.subscription_end && (
                        <div className="text-[10px] text-[color:var(--color-muted)]">~{u.subscription_end}</div>
                      )}
                    </Td>
                    <Td>
                      <span className={total >= u.limits.device_limit && u.limits.device_limit > 0 ? 'text-amber-700 font-semibold' : ''}>
                        {total}/{u.limits.device_limit}
                      </span>
                      <div className="text-[10px] text-[color:var(--color-muted)]">PC {u.device_counts.pc} · MB {u.device_counts.mobile}</div>
                    </Td>
                    <Td>{u.usage_count ?? '-'}</Td>
                    <Td>{fmtDate(u.last_sign_in_at)}</Td>
                    <Td>{fmtDate(u.created_at)}</Td>
                    <Td>{banned
                      ? <span className="text-red-700 text-[11px]">차단</span>
                      : (u.email_confirmed_at ? <span className="text-green-700 text-[11px]">정상</span>
                                              : <span className="text-amber-700 text-[11px]">미인증</span>)}</Td>
                  </tr>
                );
              })}
              {!loading && visible.length === 0 && (
                <tr><td colSpan={8} className="p-6 text-center text-sm text-[color:var(--color-muted)]">결과 없음</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        {selected ? (
          <div className="rounded-xl border border-[color:var(--color-border)] bg-white p-4 space-y-3">
            <div>
              <div className="font-semibold">{selected.email}</div>
              <div className="text-xs text-[color:var(--color-muted)] flex items-center gap-2 flex-wrap mt-0.5">
                {selected.subscription === 'pro' && (
                  <span className="px-2 py-0.5 rounded bg-[color:var(--color-brand-soft)] text-[color:var(--color-brand)] text-[11px] font-semibold">pro</span>
                )}
                {selected.subscription === 'free' && (
                  <span className="px-2 py-0.5 rounded bg-[color:var(--color-bg-soft)] text-[color:var(--color-muted)] text-[11px] font-semibold">free</span>
                )}
                {selected.subscription_end && <span>만료 {selected.subscription_end}</span>}
                {selected.office_name && <span>· {selected.office_name}</span>}
                {selected.phone && <span>· {selected.phone}</span>}
                {selected.usage_count != null && <span>· 사용 {selected.usage_count}회</span>}
              </div>
              <div className="text-[10px] text-[color:var(--color-muted)] font-mono mt-0.5">{selected.user_id}</div>
            </div>

            {detailErr && <div className="p-2 rounded bg-red-50 border border-red-200 text-red-800 text-xs">{detailErr}</div>}

            <div className="pt-2 border-t border-[color:var(--color-border)]">
              <div className="text-sm font-semibold mb-2">플랜</div>
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => changeSubs('free')}
                        disabled={subsBusy || selected.subscription === 'free'}
                        className={`h-9 px-3 rounded-lg text-sm font-semibold border ${selected.subscription === 'free' ? 'bg-[color:var(--color-bg-soft)] border-[color:var(--color-border-strong)] text-[color:var(--color-ink)]' : 'bg-white border-[color:var(--color-border)] hover:bg-[color:var(--color-bg-soft)]'} disabled:opacity-60`}>
                  {selected.subscription === 'free' ? '✓ FREE' : 'FREE 로 전환'}
                </button>
                <button onClick={() => changeSubs('pro')}
                        disabled={subsBusy || selected.subscription === 'pro'}
                        className={`h-9 px-3 rounded-lg text-sm font-semibold border ${selected.subscription === 'pro' ? 'bg-[color:var(--color-brand-soft)] border-[color:var(--color-brand)] text-[color:var(--color-brand)]' : 'bg-white border-[color:var(--color-border)] hover:bg-[color:var(--color-bg-soft)]'} disabled:opacity-60`}>
                  {selected.subscription === 'pro' ? '✓ PRO' : 'PRO 로 전환'}
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <label className="text-sm flex items-center gap-2">
                  만료일
                  <input type="date" value={subEndVal}
                         onChange={e => setSubEndVal(e.target.value)}
                         className="h-9 px-2 rounded border border-[color:var(--color-border-strong)] text-sm" />
                </label>
                <button onClick={saveSubEnd}
                        disabled={subsBusy || (subEndVal === (selected.subscription_end || ''))}
                        className="h-9 px-3 rounded-lg bg-[color:var(--color-brand)] text-white text-sm font-semibold disabled:bg-[#b5aeea]">
                  저장
                </button>
                {selected.subscription_end && (
                  <button onClick={() => { setSubEndVal(''); }}
                          className="h-9 px-2 text-xs text-[color:var(--color-muted)] hover:text-red-700">
                    지우기
                  </button>
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-[color:var(--color-border)]">
              <div className="text-sm font-semibold mb-2">비밀번호 재설정</div>
              <div className="flex items-center gap-2 flex-wrap">
                <input type="text" value={pwVal}
                       onChange={e => setPwVal(e.target.value)}
                       placeholder="새 비밀번호 (6자+)"
                       autoComplete="new-password"
                       className="flex-1 min-w-[140px] h-9 px-2 rounded border border-[color:var(--color-border-strong)] text-sm" />
                <button onClick={resetPassword} disabled={pwBusy || pwVal.length < 6}
                        className="h-9 px-3 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:bg-red-300">
                  {pwBusy ? '변경 중...' : '재설정'}
                </button>
              </div>
            </div>

            <div className="pt-2 border-t border-[color:var(--color-border)]">
              <div className="text-sm font-semibold mb-2">기기 초기화</div>
              <button onClick={resetAllDevices} disabled={resetBusy || devices.length === 0}
                      className="h-9 px-3 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:bg-red-300">
                {resetBusy ? '초기화 중...' : `전체 ${devices.length}대 초기화`}
              </button>
              <div className="text-xs text-[color:var(--color-muted)] mt-1">
                초기화 후 사용자 재로그인 시 첫 기기가 다시 자동 등록됩니다 (한도 내).
              </div>
            </div>

            <div className="pt-2 border-t border-red-200">
              <div className="text-sm font-semibold mb-2 text-red-700">⚠ 계정 삭제 (되돌릴 수 없음)</div>
              <button onClick={deleteUser} disabled={delBusy}
                      className="h-9 px-3 rounded-lg bg-red-700 text-white text-sm font-semibold disabled:bg-red-300 hover:bg-red-800">
                {delBusy ? '삭제 중...' : '🗑 계정 영구 삭제'}
              </button>
              <div className="text-xs text-[color:var(--color-muted)] mt-1">
                로그인 불가 · 기기/관심단지/한도 전부 삭제. 과거 로그는 보존.
              </div>
            </div>

            <div className="pt-2 border-t border-[color:var(--color-border)]">
              <div className="text-sm font-semibold mb-2">
                허용 기기 수 (PC + 모바일 통합)
              </div>
              {detailLimits?.subscription === 'free' ? (
                <div className="p-3 rounded bg-[color:var(--color-bg-soft)] text-sm text-[color:var(--color-muted)]">
                  무료 플랜 — 기기 등록 불가 (0대 고정). 플랜 변경은 public.users 직접 수정.
                </div>
              ) : (
                <div className="flex items-center gap-3 flex-wrap">
                  <label className="text-sm flex items-center gap-2">
                    통합 한도
                    <input type="number" min={0} max={20}
                           value={deviceVal}
                           onChange={e => setDeviceVal(Math.max(0, Math.min(20, Number(e.target.value) || 0)))}
                           className="w-24 h-9 px-2 rounded border border-[color:var(--color-border-strong)] text-sm" />
                  </label>
                  <button onClick={saveLimits}
                          disabled={saving || !detailLimits || detailLimits.device_limit === deviceVal}
                          className="h-9 px-3 rounded-lg bg-[color:var(--color-brand)] text-white text-sm font-semibold disabled:bg-[#b5aeea]">
                    {saving ? '저장 중...' : '저장'}
                  </button>
                  <span className="text-xs text-[color:var(--color-muted)]">
                    PC + 모바일 합산 상한. 예: 2 → 2대 자유 조합.
                  </span>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-[color:var(--color-border)]">
              <div className="text-sm font-semibold mb-2">등록된 기기</div>
              {detailLoading && <div className="text-xs text-[color:var(--color-muted)]">불러오는 중...</div>}
              {!detailLoading && devices.length === 0 && <div className="text-xs text-[color:var(--color-muted)]">없음</div>}
              {devices.map(d => (
                <div key={d.device_id} className="py-2 flex items-center justify-between gap-2 text-sm border-b border-[color:var(--color-border)] last:border-b-0">
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      <span className="text-xs text-[color:var(--color-muted)] mr-1">{d.device_type === 'pc' ? 'PC' : '모바일'}</span>
                      {uaShort(d.user_agent)}
                    </div>
                    <div className="text-xs text-[color:var(--color-muted)] truncate">
                      {d.ip_last} · 최근 {fmtDate(d.last_used_at)}
                    </div>
                  </div>
                  <button onClick={() => removeDevice(d)}
                          className="h-8 px-3 rounded-lg text-xs font-semibold border border-red-200 text-red-700 hover:bg-red-50">
                    해제
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-[color:var(--color-border)] p-10 text-center text-sm text-[color:var(--color-muted)]">
            왼쪽에서 사용자를 선택하세요
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Tab 2: 로그
// ───────────────────────────────────────────────────────────
function LogsTab({ session }: { session: Session | null }) {
  const [kind, setKind] = useState<AdminLogKind>('auth');
  const [email, setEmail] = useState('');
  const [eventType, setEventType] = useState('');
  const [limit, setLimit] = useState(100);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);

  async function fetchLogs() {
    setLoading(true); setErr('');
    try {
      const r = await adminFetchLogs(session, kind, {
        email: email.trim() || undefined,
        event_type: eventType.trim() || undefined,
        limit,
      });
      setRows(r.rows);
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.status} · ${e.message}` : String(e));
    } finally { setLoading(false); }
  }

  useEffect(() => { fetchLogs(); /* eslint-disable-next-line */ }, [kind]);

  const kinds: [AdminLogKind, string][] = [
    ['auth', '로그인/로그아웃'],
    ['article', '매물번호 조회'],
    ['extraction', '단지 추출'],
    ['security', '보안 이벤트'],
  ];

  return (
    <div>
      <div className="flex flex-wrap items-end gap-2 mb-4">
        <label className="text-sm">
          <div className="text-[color:var(--color-muted)] mb-1">종류</div>
          <select value={kind} onChange={e => setKind(e.target.value as AdminLogKind)}
                  className="h-9 px-2 rounded border border-[color:var(--color-border-strong)] text-sm">
            {kinds.map(([k,label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <div className="text-[color:var(--color-muted)] mb-1">이메일</div>
          <input value={email} onChange={e => setEmail(e.target.value)}
                 placeholder="부분 매칭"
                 className="h-9 px-2 rounded border border-[color:var(--color-border-strong)] text-sm" />
        </label>
        <label className="text-sm">
          <div className="text-[color:var(--color-muted)] mb-1">event_type</div>
          <input value={eventType} onChange={e => setEventType(e.target.value)}
                 placeholder="예: login_fail"
                 className="h-9 px-2 rounded border border-[color:var(--color-border-strong)] text-sm" />
        </label>
        <label className="text-sm">
          <div className="text-[color:var(--color-muted)] mb-1">개수</div>
          <input type="number" min={1} max={500} value={limit}
                 onChange={e => setLimit(Math.max(1, Math.min(500, Number(e.target.value) || 100)))}
                 className="w-20 h-9 px-2 rounded border border-[color:var(--color-border-strong)] text-sm" />
        </label>
        <button onClick={fetchLogs} disabled={loading}
                className="h-9 px-3 rounded bg-[color:var(--color-brand)] text-white text-sm font-semibold disabled:bg-[#b5aeea]">
          {loading ? '...' : '조회'}
        </button>
      </div>

      {err && <div className="p-3 mb-3 rounded bg-red-50 border border-red-200 text-red-800 text-sm">{err}</div>}

      <LogsTable rows={rows} kind={kind} />
    </div>
  );
}

function LogsTable({ rows, kind }: { rows: Record<string, unknown>[]; kind: AdminLogKind }) {
  if (rows.length === 0) return (
    <div className="text-center py-10 text-sm text-[color:var(--color-muted)]">
      로그 없음
    </div>
  );
  // 컬럼 자동 감지 + 정렬
  const priority = {
    auth:       ['created_at', 'server_id', 'email', 'event_type', 'fail_reason', 'ip', 'device_type'],
    article:    ['created_at', 'server_id', 'email', 'article_no', 'found', 'apt_name', 'dong', 'ho', 'ho_visible', 'elapsed_sec', 'ip'],
    extraction: ['extracted_at', 'server_id', 'email', 'complex_name', 'item_count', 'hidden_count_before', 'hidden_inferred', 'hidden_count_final', 'elapsed_sec', 'ip'],
    security:   ['created_at', 'email', 'event_type', 'ip', 'user_agent', 'meta'],
  }[kind];
  const cols = priority.filter(c => rows.some(r => r[c] !== undefined && r[c] !== null));
  return (
    <div className="overflow-auto rounded-lg border border-[color:var(--color-border)] bg-white max-h-[70vh]">
      <table className="text-[12px] border-collapse w-full">
        <thead className="bg-[color:var(--color-bg-soft)] sticky top-0">
          <tr>
            {cols.map(c => (
              <th key={c} className="px-2.5 py-2 text-left font-semibold whitespace-nowrap border-b border-[color:var(--color-border)]">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-[color:var(--color-border)] last:border-b-0 hover:bg-[color:var(--color-bg-soft)]">
              {cols.map(c => {
                const v = r[c];
                let txt: string;
                if (v == null) txt = '';
                else if (typeof v === 'object') txt = JSON.stringify(v);
                else txt = String(v);
                if (c.endsWith('_at')) txt = fmtDate(txt);
                if (c === 'elapsed_sec' && v != null && v !== '') {
                  const n = Number(v);
                  if (!Number.isNaN(n)) txt = `${n.toFixed(1)}s`;
                }
                return (
                  <td key={c} className="px-2.5 py-1.5 whitespace-nowrap align-top">
                    {c === 'event_type' || c === 'fail_reason'
                      ? <span className="px-1.5 py-0.5 rounded bg-[color:var(--color-bg-soft)] text-[11px] font-mono">{txt}</span>
                      : c === 'server_id'
                        ? (txt === 'a'
                            ? <span className="px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold">🅰️ A</span>
                            : txt === 'b'
                              ? <span className="px-1.5 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-800 text-[11px] font-bold">🅱️ B</span>
                              : txt
                                ? <span className="px-1.5 py-0.5 rounded bg-[color:var(--color-bg-soft)] text-[11px] font-mono">{txt}</span>
                                : <span className="text-[color:var(--color-muted)] text-[11px]">-</span>)
                        : txt}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Tab 3: 신규 등록 (관리자 주입)
// ───────────────────────────────────────────────────────────
interface MetaKV { k: string; v: string; }

function CreateTab({ session }: { session: Session | null }) {
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [phone, setPhone]           = useState('');
  const [officeName, setOfficeName] = useState('');
  const [subscription, setSubscription] = useState<'pro' | 'free'>('free');
  const [subEnd, setSubEnd]         = useState('');
  const [emailConfirm, setEmailConfirm] = useState(true);
  const [phoneConfirm, setPhoneConfirm] = useState(false);
  const [deviceLimit, setDeviceLimit] = useState(1);
  const [userMeta, setUserMeta]     = useState<MetaKV[]>([{ k: 'name', v: '' }]);
  const [appMeta,  setAppMeta]      = useState<MetaKV[]>([]);
  const [saving, setSaving]         = useState(false);
  const [err, setErr]               = useState('');
  const [result, setResult]         = useState<{ email: string; user_id: string } | null>(null);

  // free 선택 시 device_limit 자동 0
  function onSubsChange(v: 'pro' | 'free') {
    setSubscription(v);
    if (v === 'free') setDeviceLimit(0);
    else if (deviceLimit === 0) setDeviceLimit(1);
  }

  function setKV(list: MetaKV[], setList: (v: MetaKV[]) => void, i: number, patch: Partial<MetaKV>) {
    setList(list.map((kv, idx) => idx === i ? { ...kv, ...patch } : kv));
  }
  function addKV(list: MetaKV[], setList: (v: MetaKV[]) => void) {
    setList([...list, { k: '', v: '' }]);
  }
  function delKV(list: MetaKV[], setList: (v: MetaKV[]) => void, i: number) {
    setList(list.filter((_, idx) => idx !== i));
  }

  function metaToObj(list: MetaKV[]): Record<string, unknown> | undefined {
    const obj: Record<string, unknown> = {};
    for (const { k, v } of list) {
      const key = k.trim(); if (!key) continue;
      // 숫자/불리언 자동 파싱
      if (v === 'true')  obj[key] = true;
      else if (v === 'false') obj[key] = false;
      else if (v !== '' && !Number.isNaN(Number(v))) obj[key] = Number(v);
      else obj[key] = v;
    }
    return Object.keys(obj).length ? obj : undefined;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || password.length < 6) {
      setErr('이메일 및 6자 이상 비밀번호 필수');
      return;
    }
    setSaving(true); setErr(''); setResult(null);
    try {
      const r = await adminCreateUser(session, {
        email: email.trim(), password,
        phone: phone.trim() || undefined,
        email_confirm: emailConfirm,
        phone_confirm: phoneConfirm,
        office_name: officeName.trim() || undefined,
        subscription,
        subscription_end: subEnd || undefined,
        user_metadata: metaToObj(userMeta),
        app_metadata:  metaToObj(appMeta),
        device_limit: deviceLimit,
      });
      const created = (r as unknown as { user: { id: string; email: string } }).user;
      setResult({ email: created.email, user_id: created.id });
      setEmail(''); setPassword(''); setPhone(''); setOfficeName('');
      setSubscription('free'); setSubEnd(''); setDeviceLimit(0);
      setUserMeta([{ k: 'name', v: '' }]); setAppMeta([]);
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.status} · ${e.message}` : String(e));
    } finally { setSaving(false); }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-5">
      <Section title="기본 정보">
        <Row label="이메일 *">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                 autoComplete="off" required
                 className="w-full h-10 px-3 rounded-lg border border-[color:var(--color-border-strong)] text-sm focus:outline-none focus:border-[color:var(--color-brand)]" />
        </Row>
        <Row label="초기 비밀번호 * (6자 이상)">
          <input type="text" value={password} onChange={e => setPassword(e.target.value)}
                 autoComplete="off" required
                 className="w-full h-10 px-3 rounded-lg border border-[color:var(--color-border-strong)] text-sm focus:outline-none focus:border-[color:var(--color-brand)]" />
        </Row>
        <Row label="전화번호 (선택)">
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                 placeholder="+821012345678"
                 className="w-full h-10 px-3 rounded-lg border border-[color:var(--color-border-strong)] text-sm focus:outline-none focus:border-[color:var(--color-brand)]" />
        </Row>
        <div className="flex gap-5 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={emailConfirm}
                   onChange={e => setEmailConfirm(e.target.checked)} />
            이메일 자동 인증
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={phoneConfirm}
                   onChange={e => setPhoneConfirm(e.target.checked)} />
            전화 자동 인증
          </label>
        </div>
      </Section>

      <Section title="사무소 · 플랜">
        <Row label="중개사무소명">
          <input value={officeName} onChange={e => setOfficeName(e.target.value)}
                 placeholder="예: 행복공인중개사사무소"
                 className="w-full h-10 px-3 rounded-lg border border-[color:var(--color-border-strong)] text-sm focus:outline-none focus:border-[color:var(--color-brand)]" />
        </Row>
        <div className="flex items-end gap-3 flex-wrap">
          <label className="text-sm">
            <div className="text-[color:var(--color-muted)] mb-1">플랜</div>
            <select value={subscription} onChange={e => onSubsChange(e.target.value as 'pro'|'free')}
                    className="h-10 px-2 rounded border border-[color:var(--color-border-strong)] text-sm">
              <option value="free">free (기기 0)</option>
              <option value="pro">pro</option>
            </select>
          </label>
          <label className="text-sm">
            <div className="text-[color:var(--color-muted)] mb-1">만료일 (선택)</div>
            <input type="date" value={subEnd} onChange={e => setSubEnd(e.target.value)}
                   className="h-10 px-2 rounded border border-[color:var(--color-border-strong)] text-sm" />
          </label>
        </div>
      </Section>

      <Section title="기기 한도 (통합)">
        <div className="flex items-end gap-3 flex-wrap">
          <label className="text-sm">
            <div className="text-[color:var(--color-muted)] mb-1">허용 기기 수 (PC+모바일 합산)</div>
            <input type="number" min={0} max={20} value={deviceLimit}
                   disabled={subscription === 'free'}
                   onChange={e => setDeviceLimit(Math.max(0, Math.min(20, Number(e.target.value) || 0)))}
                   className="w-24 h-10 px-2 rounded border border-[color:var(--color-border-strong)] text-sm disabled:bg-[color:var(--color-bg-soft)]" />
          </label>
          <div className="text-xs text-[color:var(--color-muted)] pb-2">
            {subscription === 'free'
              ? 'free 플랜은 0 고정.'
              : '예: 2 입력 → 최초 로그인 시 PC/모바일 합 2대까지 자동 등록.'}
          </div>
        </div>
      </Section>

      <Section title={<>user_metadata <span className="text-[11px] text-[color:var(--color-muted)] font-normal">(사용자가 수정 가능 · 예: name, nickname, phone)</span></>}>
        <MetaEditor list={userMeta} setList={setUserMeta}
                    setKV={setKV} addKV={addKV} delKV={delKV} />
      </Section>

      <Section title={<>app_metadata <span className="text-[11px] text-[color:var(--color-muted)] font-normal">(관리자만 수정 · 예: plan, role, subscription)</span></>}>
        <MetaEditor list={appMeta} setList={setAppMeta}
                    setKV={setKV} addKV={addKV} delKV={delKV} />
      </Section>

      {err && <div className="p-3 rounded bg-red-50 border border-red-200 text-red-800 text-sm">{err}</div>}
      {result && (
        <div className="p-3 rounded bg-green-50 border border-green-200 text-green-800 text-sm">
          ✓ 생성: <b>{result.email}</b> <code className="text-[11px]">{result.user_id}</code>
        </div>
      )}

      <button type="submit" disabled={saving}
              className="h-10 px-5 rounded-lg bg-[color:var(--color-brand)] text-white text-sm font-semibold disabled:bg-[#b5aeea]">
        {saving ? '생성 중...' : '사용자 생성'}
      </button>
    </form>
  );
}

function Section({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-xl border border-[color:var(--color-border)] bg-white p-4 space-y-3">
      <legend className="px-2 text-sm font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs text-[color:var(--color-muted)] mb-1">{label}</div>
      {children}
    </label>
  );
}

function MetaEditor({
  list, setList, setKV, addKV, delKV,
}: {
  list: MetaKV[];
  setList: (v: MetaKV[]) => void;
  setKV: (list: MetaKV[], setList: (v: MetaKV[]) => void, i: number, patch: Partial<MetaKV>) => void;
  addKV: (list: MetaKV[], setList: (v: MetaKV[]) => void) => void;
  delKV: (list: MetaKV[], setList: (v: MetaKV[]) => void, i: number) => void;
}) {
  return (
    <div className="space-y-2">
      {list.map((kv, i) => (
        <div key={i} className="flex items-center gap-2">
          <input value={kv.k}
                 onChange={e => setKV(list, setList, i, { k: e.target.value })}
                 placeholder="key"
                 className="w-40 h-9 px-2 rounded border border-[color:var(--color-border-strong)] text-sm" />
          <input value={kv.v}
                 onChange={e => setKV(list, setList, i, { v: e.target.value })}
                 placeholder="value (true/false/숫자 자동 변환)"
                 className="flex-1 h-9 px-2 rounded border border-[color:var(--color-border-strong)] text-sm" />
          <button type="button" onClick={() => delKV(list, setList, i)}
                  className="h-9 w-9 rounded border border-[color:var(--color-border)] text-red-700 text-sm hover:bg-red-50"
                  title="삭제">×</button>
        </div>
      ))}
      <button type="button" onClick={() => addKV(list, setList)}
              className="h-8 px-3 rounded-lg bg-[color:var(--color-bg-soft)] hover:bg-[#edeff7] border border-[color:var(--color-border)] text-xs font-semibold">
        + key 추가
      </button>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Tab 5: 분양권 캐시 모니터링
// ───────────────────────────────────────────────────────────
const PRESALE_CODE_LABEL: Record<string, string> = {
  B01: 'B01 (아파트)',
  B02: 'B02 (오피·생숙)',
};
function presaleCodeLabel(code: string | null | undefined): string {
  if (!code) return '';
  return PRESALE_CODE_LABEL[code] ?? code;
}
function ComplexCell({ cno, name }: { cno: string; name: string | null | undefined }) {
  return (
    <div className="leading-tight">
      <div className="font-semibold">{name || <span className="text-[color:var(--color-muted)]">(이름 없음)</span>}</div>
      <a href={`https://new.land.naver.com/complexes/${cno}`}
         target="_blank" rel="noopener noreferrer"
         className="font-mono text-xs text-[color:var(--color-brand)] underline"
         title="네이버 단지 페이지 열기">
        #{cno}
      </a>
    </div>
  );
}

function PresaleTab({ session }: { session: Session | null }) {
  const [section, setSection] = useState<'summary' | 'popular' | 'log' | 'articles'>('summary');
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {([
          ['summary',  '단지 요약'],
          ['popular',  '인기 단지'],
          ['log',      '추출 이력'],
          ['articles', '매물 상세'],
        ] as [typeof section, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setSection(k)}
                  className={
                    'h-8 px-3 rounded-lg text-xs font-semibold border transition ' +
                    (section === k
                      ? 'bg-[color:var(--color-brand)] text-white border-[color:var(--color-brand)]'
                      : 'bg-white text-[color:var(--color-ink)] border-[color:var(--color-border)] hover:bg-[color:var(--color-bg-soft)]')
                  }>
            {label}
          </button>
        ))}
      </div>
      {section === 'summary'  && <PresaleSummarySection  session={session} />}
      {section === 'popular'  && <PresalePopularSection  session={session} />}
      {section === 'log'      && <PresaleLogSection      session={session} />}
      {section === 'articles' && <PresaleArticlesSection session={session} />}
    </div>
  );
}

function PresaleSummarySection({ session }: { session: Session | null }) {
  const [rows, setRows] = useState<PresaleComplexSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const load = async () => {
    setLoading(true);
    setErr('');
    try {
      const r = await adminPresaleSummary(session);
      if (!r.ok) throw new Error('서버 오류');
      setRows(r.complexes);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [session]);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm text-[color:var(--color-muted)]">
          {loading ? '로딩 중...' : `총 ${rows.length} 단지`}
        </div>
        <button onClick={load}
                className="h-8 px-3 rounded-lg bg-[color:var(--color-bg-soft)] hover:bg-[#edeff7] border border-[color:var(--color-border)] text-xs font-semibold">
          새로고침
        </button>
      </div>
      {err && <div className="text-sm text-red-700 mb-2">{err}</div>}
      <div className="overflow-x-auto rounded-lg border border-[color:var(--color-border)]">
        <table className="w-full text-sm">
          <thead className="bg-[color:var(--color-bg-soft)]">
            <tr>
              <Th>단지</Th>
              <Th>타입</Th>
              <Th>마지막 추출</Th>
              <Th>매물(메타/실제)</Th>
              <Th>매매</Th>
              <Th>전세</Th>
              <Th>월세</Th>
              <Th>프미</Th>
              <Th>옵션</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={`${r.naver_complex_no}_${r.presale_code}`}
                  className="border-t border-[color:var(--color-border)] hover:bg-[color:var(--color-bg-soft)]">
                <Td><ComplexCell cno={r.naver_complex_no} name={r.complex_name} /></Td>
                <Td>{presaleCodeLabel(r.presale_code)}</Td>
                <Td>{fmtDate(r.last_full_fetch_at)}</Td>
                <Td>{r.article_count} / {r.actual_count}</Td>
                <Td>{r.trades['매매']}</Td>
                <Td>{r.trades['전세']}</Td>
                <Td>{r.trades['월세']}</Td>
                <Td>{r.premium_filled_count}</Td>
                <Td>{r.option_filled_count}</Td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-4 text-center text-[color:var(--color-muted)]">데이터 없음</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PresalePopularSection({ session }: { session: Session | null }) {
  const [rows, setRows] = useState<PresalePopularRow[]>([]);
  const [days, setDays] = useState(7);
  const [limit, setLimit] = useState(30);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const load = async () => {
    setLoading(true);
    setErr('');
    try {
      const r = await adminPresalePopular(session, days, limit);
      if (!r.ok) throw new Error('서버 오류');
      setRows(r.complexes);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [session]);
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <label className="text-sm">최근
          <input type="number" value={days} min={1} max={90}
                 onChange={e => setDays(Math.max(1, Math.min(90, Number(e.target.value) || 1)))}
                 className="mx-1 w-16 h-8 px-2 rounded border border-[color:var(--color-border-strong)] text-sm" />
          일
        </label>
        <label className="text-sm">상위
          <input type="number" value={limit} min={1} max={200}
                 onChange={e => setLimit(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
                 className="mx-1 w-16 h-8 px-2 rounded border border-[color:var(--color-border-strong)] text-sm" />
          건
        </label>
        <button onClick={load}
                className="h-8 px-3 rounded-lg bg-[color:var(--color-brand)] text-white text-xs font-semibold">
          조회
        </button>
        <span className="text-sm text-[color:var(--color-muted)] ml-2">
          {loading ? '로딩 중...' : `${rows.length} 단지`}
        </span>
      </div>
      {err && <div className="text-sm text-red-700 mb-2">{err}</div>}
      <div className="overflow-x-auto rounded-lg border border-[color:var(--color-border)]">
        <table className="w-full text-sm">
          <thead className="bg-[color:var(--color-bg-soft)]">
            <tr>
              <Th>순위</Th>
              <Th>단지</Th>
              <Th>추출 횟수</Th>
              <Th>평균 소요(초)</Th>
              <Th>평균 hit</Th>
              <Th>평균 변경</Th>
              <Th>cache valid %</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.naver_complex_no}
                  className="border-t border-[color:var(--color-border)] hover:bg-[color:var(--color-bg-soft)]">
                <Td>{i + 1}</Td>
                <Td><ComplexCell cno={r.naver_complex_no} name={r.complex_name} /></Td>
                <Td>{r.extract_count}</Td>
                <Td>{r.avg_elapsed_sec}</Td>
                <Td>{r.avg_hit}</Td>
                <Td>{r.avg_changed}</Td>
                <Td>{r.cache_valid_pct}%</Td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-4 text-center text-[color:var(--color-muted)]">데이터 없음</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PresaleLogSection({ session }: { session: Session | null }) {
  const [rows, setRows] = useState<PresaleExtractLog[]>([]);
  const [cno, setCno] = useState('');
  const [limit, setLimit] = useState(100);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const load = async () => {
    setLoading(true);
    setErr('');
    try {
      const r = await adminPresaleLog(session, limit, cno);
      if (!r.ok) throw new Error('서버 오류');
      setRows(r.logs);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [session]);
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <input value={cno} onChange={e => setCno(e.target.value)}
               placeholder="단지번호 (옵션)"
               className="w-44 h-8 px-2 rounded border border-[color:var(--color-border-strong)] text-sm" />
        <label className="text-sm">최근
          <input type="number" value={limit} min={1} max={1000}
                 onChange={e => setLimit(Math.max(1, Math.min(1000, Number(e.target.value) || 1)))}
                 className="mx-1 w-20 h-8 px-2 rounded border border-[color:var(--color-border-strong)] text-sm" />
          건
        </label>
        <button onClick={load}
                className="h-8 px-3 rounded-lg bg-[color:var(--color-brand)] text-white text-xs font-semibold">
          조회
        </button>
        <span className="text-sm text-[color:var(--color-muted)] ml-2">
          {loading ? '로딩 중...' : `${rows.length} 건`}
        </span>
      </div>
      {err && <div className="text-sm text-red-700 mb-2">{err}</div>}
      <div className="overflow-x-auto rounded-lg border border-[color:var(--color-border)]">
        <table className="w-full text-sm">
          <thead className="bg-[color:var(--color-bg-soft)]">
            <tr>
              <Th>시각</Th>
              <Th>단지</Th>
              <Th>타입</Th>
              <Th>cache hit</Th>
              <Th>변경</Th>
              <Th>삭제</Th>
              <Th>소요(초)</Th>
              <Th>cache valid</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}
                  className="border-t border-[color:var(--color-border)] hover:bg-[color:var(--color-bg-soft)]">
                <Td>{fmtDate(r.extracted_at)}</Td>
                <Td><ComplexCell cno={r.naver_complex_no} name={r.complex_name} /></Td>
                <Td>{presaleCodeLabel(r.presale_code)}</Td>
                <Td>{r.cache_hit_count ?? '-'}</Td>
                <Td>{r.changed_count ?? '-'}</Td>
                <Td>{r.delete_count ?? '-'}</Td>
                <Td>{r.elapsed_sec ?? '-'}</Td>
                <Td>{r.cache_valid === null ? '-' : r.cache_valid ? '✓' : '✗'}</Td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-4 text-center text-[color:var(--color-muted)]">데이터 없음</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PresaleArticlesSection({ session }: { session: Session | null }) {
  const [rows, setRows] = useState<PresaleArticleRow[]>([]);
  const [cname, setCname] = useState<string | null>(null);
  const [cno, setCno] = useState('');
  const [code, setCode] = useState('');
  const [limit, setLimit] = useState(500);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  // 추출이력 단지 목록 (드랍박스 소스)
  const [complexes, setComplexes] = useState<PresaleComplexSummary[]>([]);
  const [complexesLoading, setComplexesLoading] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      setComplexesLoading(true);
      try {
        const r = await adminPresaleSummary(session);
        if (!alive) return;
        if (r.ok) {
          // 중복 cno 제거 + 단지명 오름차순
          const seen = new Set<string>();
          const uniq: PresaleComplexSummary[] = [];
          for (const c of r.complexes) {
            if (seen.has(c.naver_complex_no)) continue;
            seen.add(c.naver_complex_no);
            uniq.push(c);
          }
          uniq.sort((a, b) => (a.complex_name ?? '').localeCompare(b.complex_name ?? '', 'ko'));
          setComplexes(uniq);
        }
      } catch { /* dropdown 실패 시 무시 (수동 입력 fallback) */ }
      finally { if (alive) setComplexesLoading(false); }
    })();
    return () => { alive = false; };
  }, [session]);
  const load = async () => {
    if (!cno.trim()) { setErr('단지번호를 선택하세요'); return; }
    setLoading(true);
    setErr('');
    try {
      const r = await adminPresaleArticles(session, cno.trim(), code.trim(), limit);
      if (!r.ok) throw new Error('서버 오류');
      setRows(r.articles);
      setCname(r.complex_name ?? null);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  const exportExcel = () => {
    if (rows.length === 0) return;
    const headers = ['매물번호','타입','거래','동','층','호수','매매','전세','월세','가격(원본)',
                     '프미 min','프미 max','프미 actual','옵션','중개사','확인일','업데이트'];
    const esc = (v: unknown): string => {
      const s = v === null || v === undefined ? '' : String(v);
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    };
    const trs = rows.map(r => {
      const cells = [
        r.article_no, presaleCodeLabel(r.presale_code), r.trade_type_code ?? '',
        r.building_name ?? '', r.floor_info ?? '', r.unit_no ?? '',
        r.price_deal ?? '', r.price_warrant ?? '', r.price_rent ?? '',
        r.deal_or_warrant_prc ?? '', r.premium_min ?? '', r.premium_max ?? '',
        r.premium_actual ?? '', r.option_price ?? '', r.realtor_name ?? '',
        r.article_confirm_ymd ?? '', fmtDate(r.updated_at),
      ];
      return `<tr>${cells.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`;
    }).join('');
    const html =
      '<html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
      'xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">' +
      '<head><meta charset="UTF-8"></head><body><table border="1">' +
      `<thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>` +
      `<tbody>${trs}</tbody></table></body></html>`;
    const blob = new Blob(['﻿', html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '').slice(0, 13);
    const fname = `presale_${cno.trim()}_${(cname ?? '').replace(/[\\/:*?"<>|\s]/g, '_')}_${ts}.xls`;
    const a = document.createElement('a');
    a.href = url; a.download = fname;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
  };
  // Favorites preheat 패널용 state (분양권 캐시 section 안에 표시)
  const [preheatBusy, setPreheatBusy] = useState(false);
  const [bulkJobs, setBulkJobs] = useState<BulkExtractJob[] | null>(null);
  if (bulkJobs) {
    return (
      <BulkExtractResult
        session={session}
        jobs={bulkJobs}
        onBack={() => setBulkJobs(null)}
      />
    );
  }
  return (
    <div>
      {/* Favorites preheat 일괄추출 + 캐시 전체 삭제 — 분양권 캐시 section 상단 */}
      <div className="mb-4 p-3 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-soft)]">
        <div className="text-sm font-semibold mb-2">⭐ Favorites preheat 일괄추출 (관심단지 'preheat' 폴더)</div>
        <div className="text-xs text-[color:var(--color-muted)] mb-2">
          관리자 본인의 관심단지 'preheat' 폴더 → 단지별 3분 인터벌. 매일 05:10 자동 실행 + 즉시 트리거.
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={async () => {
              if (!confirm('관리자 본인의 관심단지 preheat 폴더를 즉시 일괄추출 합니다. (한 host 가 모두 처리, 약 30분~1시간)')) return;
              setPreheatBusy(true);
              try {
                const r = await adminPresalePreheatBulkExtract(session, 'all');
                if (r.jobs && r.jobs.length > 0) {
                  setBulkJobs(r.jobs as BulkExtractJob[]);
                } else {
                  alert(`완료 — host=${r.host}, total=${r.total}, share=${r.share}, jobs=0\n${r.note || ''}`);
                }
              } catch (e) {
                alert((e instanceof ApiError ? e.message : (e as Error).message));
              } finally { setPreheatBusy(false); }
            }} disabled={preheatBusy}
            className="h-8 px-3 rounded bg-[color:var(--color-brand)] text-white text-xs font-semibold disabled:opacity-40">
            {preheatBusy ? '실행 중...' : '▶️ 즉시 일괄추출 (수동 트리거)'}
          </button>
          <button onClick={async () => {
              if (!confirm('정말 모든 분양권 캐시를 DELETE 합니까? (log 는 유지)')) return;
              setPreheatBusy(true);
              try {
                const r = await adminPresaleResetNow(session);
                alert(`OK\n${JSON.stringify(r).slice(0, 300)}`);
              } catch (e) {
                alert(e instanceof ApiError ? e.message : (e as Error).message);
              } finally { setPreheatBusy(false); }
            }} disabled={preheatBusy}
            className="h-8 px-3 rounded bg-red-600 text-white text-xs font-semibold disabled:opacity-40">
            🗑️ 캐시 전체 삭제
          </button>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <select value={cno} onChange={e => setCno(e.target.value)}
                className="h-8 px-2 rounded border border-[color:var(--color-border-strong)] text-sm min-w-[18rem] max-w-[28rem]">
          <option value="">
            {complexesLoading ? '단지 목록 로딩 중...'
              : complexes.length === 0 ? '추출이력 단지 없음'
              : `단지 선택 (${complexes.length}개)`}
          </option>
          {complexes.map(c => (
            <option key={c.naver_complex_no} value={c.naver_complex_no}>
              {(c.complex_name ?? '(이름없음)')} · #{c.naver_complex_no}
            </option>
          ))}
        </select>
        <select value={code} onChange={e => setCode(e.target.value)}
                className="h-8 px-2 rounded border border-[color:var(--color-border-strong)] text-sm">
          <option value="">전체</option>
          <option value="B01">B01 (아파트)</option>
          <option value="B02">B02 (오피/생숙)</option>
        </select>
        <label className="text-sm">최대
          <input type="number" value={limit} min={1} max={10000}
                 onChange={e => setLimit(Math.max(1, Math.min(10000, Number(e.target.value) || 1)))}
                 className="mx-1 w-20 h-8 px-2 rounded border border-[color:var(--color-border-strong)] text-sm" />
          건
        </label>
        <button onClick={load}
                className="h-8 px-3 rounded-lg bg-[color:var(--color-brand)] text-white text-xs font-semibold">
          조회
        </button>
        <button onClick={exportExcel} disabled={rows.length === 0}
                className="h-8 px-3 rounded-lg bg-emerald-600 text-white text-xs font-semibold disabled:opacity-40">
          📥 엑셀 내보내기
        </button>
        <span className="text-sm text-[color:var(--color-muted)] ml-2">
          {loading ? '로딩 중...' : `${rows.length} 건`}
        </span>
      </div>
      {err && <div className="text-sm text-red-700 mb-2">{err}</div>}
      {cname && rows.length > 0 && (
        <div className="mb-2 text-sm">
          <span className="font-semibold">{cname}</span>
          <a href={`https://new.land.naver.com/complexes/${cno.trim()}`}
             target="_blank" rel="noopener noreferrer"
             className="ml-2 font-mono text-xs text-[color:var(--color-brand)] underline">
            #{cno.trim()}
          </a>
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-[color:var(--color-border)]">
        <table className="w-full text-sm">
          <thead className="bg-[color:var(--color-bg-soft)]">
            <tr>
              <Th>매물번호</Th>
              <Th>타입</Th>
              <Th>거래</Th>
              <Th>동</Th>
              <Th>층</Th>
              <Th>호수</Th>
              <Th>매매</Th>
              <Th>전세</Th>
              <Th>월세</Th>
              <Th>가격(원본)</Th>
              <Th>프미 min</Th>
              <Th>프미 max</Th>
              <Th>프미 actual</Th>
              <Th>옵션</Th>
              <Th>중개사</Th>
              <Th>확인일</Th>
              <Th>업데이트</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.article_no}
                  className="border-t border-[color:var(--color-border)] hover:bg-[color:var(--color-bg-soft)]">
                <Td><span className="font-mono">{r.article_no}</span></Td>
                <Td>{presaleCodeLabel(r.presale_code)}</Td>
                <Td>{r.trade_type_code ?? ''}</Td>
                <Td>{r.building_name ?? ''}</Td>
                <Td>{r.floor_info ?? ''}</Td>
                <Td>{r.unit_no ?? ''}</Td>
                <Td>{r.price_deal ?? ''}</Td>
                <Td>{r.price_warrant ?? ''}</Td>
                <Td>{r.price_rent ?? ''}</Td>
                <Td>{r.deal_or_warrant_prc ?? ''}</Td>
                <Td>{r.premium_min ?? ''}</Td>
                <Td>{r.premium_max ?? ''}</Td>
                <Td>{r.premium_actual ?? ''}</Td>
                <Td>{r.option_price ?? ''}</Td>
                <Td>{r.realtor_name ?? ''}</Td>
                <Td>{r.article_confirm_ymd ?? ''}</Td>
                <Td>{fmtDate(r.updated_at)}</Td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={17} className="px-3 py-4 text-center text-[color:var(--color-muted)]">조회 결과 없음</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// HealthTab — 시스템 점검 (Phase 5b)
// ──────────────────────────────────────────────────────────────────────────
const CHECK_LABELS: Record<string, string> = {
  self_health:     '자체 health',
  peer_health:     '상대 host health',
  bearer_entries:  'Naver Bearer',
  block_window:    '차단 누적 (30분)',
  kb_token:        'KB OAuth 토큰',
  supabase:        'Supabase select',
  server_id_dist:  'auth_events 24h KR 비중',
  jobmanager:      'Job 큐 active',
  vpn:             'VPN/Proxy',
};
const CHECK_SCOPE: Record<string, '🏠' | '🌐'> = {
  self_health:     '🏠',
  peer_health:     '🌐',
  bearer_entries:  '🏠',
  block_window:    '🏠',
  kb_token:        '🏠',
  supabase:        '🌐',
  server_id_dist:  '🌐',
  jobmanager:      '🏠',
  vpn:             '🏠',
};

function hostShortName(host: string): string {
  if (host.includes('api-kr')) return '🇰🇷 KR';
  if (host.startsWith('https://api.')) return '🅰️ A';
  return host;
}

function HealthTab({ session }: { session: Session | null }) {
  const [results, setResults]   = useState<HealthFullPerHost[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error,    setError]    = useState<string | null>(null);

  // cooldown 카운트다운
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  // 첫 진입 시 자동 1회
  useEffect(() => {
    runCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runCheck() {
    if (cooldown > 0 || loading) return;
    setLoading(true);
    setError(null);
    try {
      const data = await adminHealthFullMulti(session);
      setResults(data);
      setCooldown(5);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <button
          onClick={runCheck}
          disabled={loading || cooldown > 0}
          className="px-4 py-2 rounded-lg bg-[color:var(--color-brand)] text-white font-semibold text-sm disabled:opacity-50 hover:bg-[color:var(--color-brand-dark)]"
        >
          {loading ? '⏳ 점검 중...' : cooldown > 0 ? `${cooldown}s 후 재시도` : '🔄 전체 점검'}
        </button>
        <span className="text-xs text-[color:var(--color-muted)]">
          🏠 = 로컬 only · 🌐 = 외부 호출 (서버 rate limit 5초/회)
        </span>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">{error}</div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {results.map(({ host, data, error: hostErr }) => (
          <div key={host} className="rounded-xl border border-[color:var(--color-border)] bg-white p-4">
            <div className="mb-3 pb-2 border-b border-[color:var(--color-border)]">
              <div className="font-semibold">{hostShortName(host)}</div>
              <div className="text-xs text-[color:var(--color-muted)] truncate">{host}</div>
            </div>
            {hostErr && (
              <div className="p-2 rounded bg-red-50 text-red-700 text-xs">{hostErr}</div>
            )}
            {data && (
              <>
                <div className="space-y-2">
                  {data.checks.map(c => (
                    <CheckRow key={c.id} check={c} />
                  ))}
                </div>
                <div className="mt-3 text-xs text-[color:var(--color-muted)] text-right">
                  elapsed {data.elapsed_ms}ms · host_id={data.host_id}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CheckRow({ check }: { check: HealthCheck }) {
  const colorMap: Record<string, { icon: string; bg: string; text: string }> = {
    ok:       { icon: '✅', bg: 'bg-emerald-50', text: 'text-emerald-800' },
    warn:     { icon: '⚠️', bg: 'bg-amber-50',   text: 'text-amber-800'   },
    critical: { icon: '🚨', bg: 'bg-red-50',     text: 'text-red-800'     },
  };
  const c = colorMap[check.status] || colorMap.ok;
  const label = CHECK_LABELS[check.id] || check.id;
  const scope = CHECK_SCOPE[check.id] || '🏠';
  return (
    <div className={`p-2 rounded-lg ${c.bg} ${c.text} text-sm flex items-start gap-2`}>
      <span className="shrink-0">{c.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="font-semibold flex items-center gap-1">
          {label} <span className="text-xs opacity-60">{scope}</span>
        </div>
        <div className="text-xs break-words">{check.msg}</div>
      </div>
    </div>
  );
}


function phoneHref(p: string): string {
  return 'tel:' + (p || '').replace(/[^0-9+]/g, '');
}

function OwnershipTab({ session }: { session: Session | null }) {
  const [query, setQuery]       = useState('');
  const [complexes, setComplexes] = useState<OwnershipComplex[]>([]);
  const [picked, setPicked]     = useState<OwnershipComplex | null>(null);
  const [dong, setDong]         = useState('');
  const [ho, setHo]             = useState('');
  const [searching, setSearching] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState('');
  const [res, setRes]           = useState<OwnershipResult | null>(null);
  const [showCand, setShowCand] = useState(false);

  async function findComplex() {
    if (!query.trim()) return;
    setSearching(true); setErr(''); setComplexes([]); setPicked(null);
    try {
      const r = await adminOwnershipComplexes(session, query.trim());
      setComplexes(r.complexes);
      if (r.complexes.length === 1) setPicked(r.complexes[0]);
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.status} · ${e.message}` : String(e));
    } finally { setSearching(false); }
  }

  async function lookup() {
    if (!picked && !query.trim())   { setErr('단지를 먼저 검색·선택하세요.'); return; }
    setLoading(true); setErr(''); setRes(null); setShowCand(false);
    try {
      const r = await adminOwnershipLookup(session, {
        complexNo: picked?.complexNo || '',
        query:     picked ? '' : query.trim(),
        dong:      dong.trim(),
        ho:        ho.trim(),
      });
      setRes(r);
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.status} · ${e.message}` : String(e));
    } finally { setLoading(false); }
  }

  const inputCls =
    'h-9 px-2 rounded border border-[color:var(--color-border-strong)] text-sm';

  return (
    <div>
      {/* 단지 검색 */}
      <div className="flex flex-wrap items-end gap-2 mb-3">
        <label className="text-sm">
          <div className="text-[color:var(--color-muted)] mb-1">단지명</div>
          <input value={query} onChange={e => setQuery(e.target.value)}
                 onKeyDown={e => { if (e.key === 'Enter') findComplex(); }}
                 placeholder="예: 아산자이그랜드파크1단지"
                 className={inputCls + ' w-64'} />
        </label>
        <button onClick={findComplex} disabled={searching}
                className="h-9 px-3 rounded bg-[color:var(--color-brand)] text-white text-sm font-semibold disabled:bg-[#b5aeea]">
          {searching ? '...' : '단지 찾기'}
        </button>
      </div>

      {/* 단지 후보 */}
      {complexes.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {complexes.map(c => (
            <button key={c.complexNo} onClick={() => setPicked(c)}
                    className={
                      'px-3 py-1.5 rounded border text-sm transition ' +
                      (picked?.complexNo === c.complexNo
                        ? 'border-[color:var(--color-brand)] bg-[color:var(--color-brand)]/10 text-[color:var(--color-brand)] font-semibold'
                        : 'border-[color:var(--color-border-strong)] text-[color:var(--color-ink)] hover:border-[color:var(--color-brand)]')
                    }>
              {c.name}
              <span className="text-[color:var(--color-muted)] ml-1">
                {c.addr || `#${c.complexNo}`}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* 동/호 (선택) + 조회 */}
      <div className="flex flex-wrap items-end gap-2 mb-1">
        <label className="text-sm">
          <div className="text-[color:var(--color-muted)] mb-1">동 <span className="opacity-60">(선택)</span></div>
          <input value={dong} onChange={e => setDong(e.target.value)}
                 onKeyDown={e => { if (e.key === 'Enter') lookup(); }}
                 placeholder="전체" className={inputCls + ' w-24'} />
        </label>
        <label className="text-sm">
          <div className="text-[color:var(--color-muted)] mb-1">호 <span className="opacity-60">(선택)</span></div>
          <input value={ho} onChange={e => setHo(e.target.value)}
                 onKeyDown={e => { if (e.key === 'Enter') lookup(); }}
                 placeholder="전체" className={inputCls + ' w-24'} />
        </label>
        <button onClick={lookup} disabled={loading}
                className="h-9 px-4 rounded bg-[color:var(--color-brand)] text-white text-sm font-semibold disabled:bg-[#b5aeea]">
          {loading ? '조회 중…' : (ho.trim() ? '집주인 조회' : '단지 전체 조회')}
        </button>
        {picked && (
          <span className="text-sm text-[color:var(--color-muted)] self-center">
            선택: <b className="text-[color:var(--color-ink)]">{picked.name}</b>
          </span>
        )}
      </div>
      <div className="text-xs text-[color:var(--color-muted)] mb-4">
        동·호를 비우면 <b>단지 전체</b> 집주인(동·호 포함)을 조회합니다. 동만 입력하면 해당 동 전체.
      </div>

      {err && (
        <div className="p-3 mb-3 rounded bg-red-50 border border-red-200 text-red-800 text-sm">
          {err}
        </div>
      )}

      {loading && (
        <div className="text-sm text-[color:var(--color-muted)]">
          네이버 매물 수집 + 포스(rfine) 조회 중… 단지 규모에 따라 10~30초 걸릴 수 있습니다.
        </div>
      )}

      {res && (
        <div>
          {res.note && (
            <div className="p-3 mb-3 rounded bg-amber-50 border border-amber-200 text-amber-900 text-sm">
              {res.note}
            </div>
          )}

          {res.matches.length > 0 ? (
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-[color:var(--color-surface-2,#f3f4f6)]">
                    <Th>출처</Th><Th>동</Th><Th>호</Th><Th>거래</Th><Th>층</Th>
                    <Th>집주인</Th><Th>연락처</Th><Th>등록일</Th><Th>중개사</Th>
                  </tr>
                </thead>
                <tbody>
                  {res.matches.map((m, i) => (
                    <tr key={m.articleNo + i}
                        className="border-b border-[color:var(--color-border)]">
                      <Td>{m.via === 'rfine' ? '포스' : m.via === 'serve' ? '써브' : m.via}</Td>
                      <Td>{m.dong}</Td>
                      <Td>{m.ho}</Td>
                      <Td>{m.tradeType}</Td>
                      <Td>{m.floor}</Td>
                      <Td><b>{m.ownerName || '-'}</b></Td>
                      <Td>
                        {m.ownerPhone
                          ? <a href={phoneHref(m.ownerPhone)}
                               className="text-[color:var(--color-brand)] font-semibold">
                              {m.ownerPhone}
                            </a>
                          : '-'}
                      </Td>
                      <Td>{m.registeredAt || '-'}</Td>
                      <Td><span className="text-[color:var(--color-muted)]">{m.realtorName || '-'}</span></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-3 mb-3 rounded bg-[color:var(--color-surface-2,#f3f4f6)] text-sm text-[color:var(--color-muted)]">
              일치하는 세대의 집주인 정보가 없습니다.
            </div>
          )}

          {/* 층 후보 (진단용) */}
          {res.floorCandidates.length > 0 && (
            <div>
              <button onClick={() => setShowCand(v => !v)}
                      className="text-sm text-[color:var(--color-muted)] underline">
                {showCand ? '▲ 같은 층 매물 접기' : `▼ 같은 층 매물 ${res.floorCandidates.length}건 (진단)`}
              </button>
              {showCand && (
                <div className="overflow-x-auto mt-2">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-[color:var(--color-surface-2,#f3f4f6)]">
                        <Th>매물번호</Th><Th>동</Th><Th>층</Th><Th>거래</Th>
                        <Th>CP</Th><Th>rfine호</Th><Th>소유자확보</Th><Th>사유</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {res.floorCandidates.map(c => (
                        <tr key={c.articleNo}
                            className="border-b border-[color:var(--color-border)]">
                          <Td>{c.articleNo}</Td>
                          <Td>{c.dong}</Td>
                          <Td>{c.floor}</Td>
                          <Td>{c.tradeType}</Td>
                          <Td>{c.cpName}</Td>
                          <Td>{c.rfineHo || '-'}</Td>
                          <Td>{c.ownerResolved ? '✓' : ''}</Td>
                          <Td><span className="text-[color:var(--color-muted)]">{c.reason}</span></Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="mt-3 text-xs text-[color:var(--color-muted)]">
            {res.mode === 'full'
              ? <>수집 {res.counts.articles}건 · 부동산포스 {res.counts.pos}건 · 소유자 {res.counts.resolved ?? res.matches.length}건</>
              : <>수집 {res.counts.articles}건 · {res.dong}동 {res.counts.inDong}건 · {res.floor}층 {res.counts.scope ?? res.counts.floor}건 · 포스 {res.counts.pos}건</>}
          </div>
        </div>
      )}
    </div>
  );
}
