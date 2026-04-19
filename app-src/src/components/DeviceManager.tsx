import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  listMyDevices,
  type DeviceRow, type DeviceLimits, ApiError,
} from '../lib/api';

interface Props {
  session: Session | null;
  onClose: () => void;
}

const SUPPORT_PHONE = '070-7954-4114';
const SUPPORT_KAKAO_URL = '';   // 채널 URL 확정되면 여기 넣으면 바로 링크됨

function uaShort(ua: string): string {
  if (!ua) return '';
  if (/iPhone|iPad|iOS/i.test(ua))       return 'iOS';
  if (/Android/i.test(ua))               return 'Android';
  if (/Macintosh|Mac OS X/i.test(ua))    return 'Mac';
  if (/Windows/i.test(ua))               return 'Windows';
  if (/Linux/i.test(ua))                 return 'Linux';
  return ua.slice(0, 40);
}

function fmtDate(s: string): string {
  if (!s) return '';
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return s; }
}

export default function DeviceManager({ session, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [limits, setLimits] = useState<DeviceLimits>({ device_limit: 1, pc_limit: 1, mobile_limit: 1 });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setErr('');
      try {
        const r = await listMyDevices(session);
        if (cancelled) return;
        setDevices(r.devices);
        setLimits(r.limits);
      } catch (e) {
        if (cancelled) return;
        setErr(e instanceof ApiError ? `${e.status} · ${e.message}` : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [session]);

  const pcDevices     = devices.filter(d => d.device_type === 'pc');
  const mobileDevices = devices.filter(d => d.device_type === 'mobile');

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4"
         onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-auto"
           onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[color:var(--color-border)] flex items-center justify-between">
          <h2 className="font-bold text-lg">내 기기 현황</h2>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-full hover:bg-[color:var(--color-bg-soft)] text-xl leading-none"
            aria-label="닫기"
          >×</button>
        </div>

        {loading && <div className="p-6 text-sm text-[color:var(--color-muted)]">불러오는 중...</div>}
        {err && <div className="m-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">{err}</div>}

        {!loading && !err && (
          <div className="p-5 space-y-5">
            <div className="text-sm flex items-center justify-between flex-wrap gap-2">
              <div>
                통합 한도 <span className="font-bold">{devices.length}/{limits.device_limit}</span>
                {limits.subscription === 'free' && (
                  <span className="ml-2 text-[color:var(--color-muted)] text-xs">(free 플랜 — 기기 등록 불가)</span>
                )}
              </div>
            </div>
            <DeviceGroup label="PC"     devices={pcDevices} />
            <DeviceGroup label="모바일" devices={mobileDevices} />

            <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-soft)] p-4 text-sm leading-relaxed">
              <div className="font-semibold mb-1">기기 해제 및 재등록</div>
              <div className="text-[color:var(--color-muted)] mb-3">
                보안 정책에 따라 기기 변경은 고객센터에서만 처리해드립니다.
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {SUPPORT_KAKAO_URL ? (
                  <a
                    href={SUPPORT_KAKAO_URL}
                    target="_blank" rel="noopener noreferrer"
                    className="h-9 px-3 inline-flex items-center rounded-lg bg-[#fee500] text-[#191600] text-sm font-semibold hover:brightness-95"
                  >
                    💬 카카오톡 문의
                  </a>
                ) : (
                  <span className="h-9 px-3 inline-flex items-center rounded-lg bg-[#fee500] text-[#191600] text-sm font-semibold">
                    💬 카카오톡 문의
                  </span>
                )}
                <a
                  href={`tel:${SUPPORT_PHONE.replace(/-/g,'')}`}
                  className="h-9 px-3 inline-flex items-center rounded-lg bg-white border border-[color:var(--color-border-strong)] text-sm font-semibold hover:bg-[color:var(--color-bg-soft)]"
                >
                  📞 {SUPPORT_PHONE}
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DeviceGroup({
  label, devices,
}: {
  label:    string;
  devices:  DeviceRow[];
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="font-semibold text-sm">
          {label}{' '}
          <span className="text-[color:var(--color-muted)]">({devices.length})</span>
        </div>
      </div>
      {devices.length === 0 ? (
        <div className="px-3 py-4 text-sm text-[color:var(--color-muted)] rounded-lg bg-[color:var(--color-bg-soft)]">
          등록된 기기 없음
        </div>
      ) : (
        <div className="divide-y divide-[color:var(--color-border)] rounded-lg border border-[color:var(--color-border)] bg-white overflow-hidden">
          {devices.map(d => (
            <div key={d.device_id} className="px-3 py-2.5 text-sm">
              <div className="font-semibold truncate">{uaShort(d.user_agent)}</div>
              <div className="text-xs text-[color:var(--color-muted)] truncate">
                {d.ip_last} · 최근 {fmtDate(d.last_used_at)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
