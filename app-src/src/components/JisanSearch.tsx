// JisanSearch.tsx — 지식산업센터(지산) 검색 탭 (2026-07 신설, 빌라 탭과 별개)
// KB-native: /api/jisan/* (propList/stutCdFilter 리스트 + bascInfo 기타주소1 호수).
// 빌라(VillaSearch.tsx)를 참조했으나 별개 컴포넌트 — 빌라 코드는 건드리지 않음.
// self-contained: lib/api 의존 없이 자체 fetch+auth. App 라우팅에 신규 탭으로 추가만 하면 됨.
import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: () => string })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const API_BASE = (import.meta as any).env?.VITE_API_BASE || '';

interface Props { session: Session | null; }

// ── 자체 API 헬퍼 (lib/api 미의존) ────────────────────────────────────────
async function apiPost(session: Session | null, path: string, body: unknown) {
  const r = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${r.status} · ${(await r.text()).slice(0, 160)}`);
  return r.json();
}
async function apiGet(session: Session | null, path: string) {
  const r = await fetch(`${API_BASE}${path}`, {
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
  });
  if (!r.ok) throw new Error(`${r.status} · ${(await r.text()).slice(0, 160)}`);
  return r.json();
}

interface AutoItem { legalDivisionNumber: string; name: string; latitude: string; longitude: string; level?: string; }
interface JisanItem {
  매물일련번호?: number | string; 매물종별명?: string; 매물거래명?: string;
  해당층수?: string | number; 전용면적?: string | number; 공급면적?: string | number;
  매매가?: string | number; 월세가?: string | number; 월세보증금?: string | number;
  단지명?: string; 호수?: string; _상세주소?: string; _매물유입명?: string;
  wgs84위도?: number; wgs84경도?: number; [k: string]: unknown;
}
interface JisanProgress {
  status: string; stage: string; stage_label: string; page: number;
  list_count: number; ho_done: number; ho_total: number; elapsed_sec: number;
  result?: { list_count: number; ho_filled: number; truncated: boolean; items: JisanItem[] } | null;
  error?: string | null;
}

const TRADE_TYPES: { label: string; code: string }[] = [
  { label: '전체', code: '' }, { label: '매매', code: '1' },
  { label: '전세', code: '2' }, { label: '월세', code: '3' },
];

export default function JisanSearch({ session }: Props) {
  const [keyword, setKeyword]   = useState('');
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoErr, setAutoErr]   = useState('');
  const [cands, setCands]       = useState<AutoItem[]>([]);
  const [chosen, setChosen]     = useState<AutoItem | null>(null);
  const [trade, setTrade]       = useState('');
  const [pickedLat, setPickedLat] = useState<number | null>(null);
  const [pickedLng, setPickedLng] = useState<number | null>(null);
  const [radiusKm, setRadiusKm]   = useState<number>(0);   // 0 = 동 전체

  const [busy, setBusy]     = useState(false);
  const [err, setErr]       = useState('');
  const [items, setItems]   = useState<JisanItem[]>([]);
  const [stats, setStats]   = useState<{ list: number; ho: number; truncated?: boolean; elapsed?: number } | null>(null);
  const [progress, setProgress] = useState<JisanProgress | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => () => { if (pollRef.current != null) window.clearInterval(pollRef.current); }, []);
  useEffect(() => {
    if (chosen) {
      const lat = parseFloat(chosen.latitude), lng = parseFloat(chosen.longitude);
      if (!isNaN(lat) && !isNaN(lng)) { setPickedLat(lat); setPickedLng(lng); }
      setRadiusKm(0);
    } else { setPickedLat(null); setPickedLng(null); setRadiusKm(0); }
  }, [chosen]);

  async function onAutocomplete(e: React.FormEvent) {
    e.preventDefault();
    const kw = keyword.trim(); if (!kw) return;
    setAutoBusy(true); setAutoErr(''); setCands([]); setChosen(null); setItems([]); setStats(null); setErr('');
    try {
      const r = await apiPost(session, '/api/jisan/autocomplete', { keyword: kw });
      setCands(r.items || []);
      if (!r.items?.length) setAutoErr('법정동 후보를 찾지 못했습니다');
      else if (r.items.length === 1) setChosen(r.items[0]);
    } catch (e) { setAutoErr(String(e)); } finally { setAutoBusy(false); }
  }

  async function onSearch() {
    if (!chosen) return;
    setBusy(true); setErr(''); setItems([]); setStats(null); setProgress(null);
    if (pollRef.current != null) { window.clearInterval(pollRef.current); pollRef.current = null; }
    try {
      const useRadius = radiusKm > 0 && pickedLat != null && pickedLng != null;
      const start = await apiPost(session, '/api/jisan/search/start', {
        cortar_no: chosen.legalDivisionNumber,
        trade_type: trade,
        addr: keyword.trim(),   // 지번/건물 필터 — 입력에 지번 있으면 그 건물만

        center_lat: useRadius ? pickedLat : undefined,
        center_lng: useRadius ? pickedLng : undefined,
        radius_km:  useRadius ? radiusKm : undefined,
        max_pages: 40, fetch_ho: true, ho_limit: 300,
      });
      const jobId = start.job_id;
      pollRef.current = window.setInterval(async () => {
        try {
          const st: JisanProgress = await apiGet(session, `/api/jisan/search/status/${jobId}`);
          setProgress(st);
          if (st.status === 'done') {
            window.clearInterval(pollRef.current!); pollRef.current = null;
            const res = st.result;
            if (res) {
              setItems(res.items || []);
              setStats({ list: res.list_count, ho: res.ho_filled, truncated: res.truncated, elapsed: st.elapsed_sec });
              if (!res.items?.length) setErr('검색 결과 없음');
            }
            setBusy(false);
          } else if (st.status === 'error' || st.status === 'blocked') {
            window.clearInterval(pollRef.current!); pollRef.current = null;
            setErr(st.status === 'blocked' ? (st.stage_label || '일시 차단 — 잠시 후 재시도') : (st.error || '검색 오류'));
            setBusy(false);
          }
        } catch (e) {
          window.clearInterval(pollRef.current!); pollRef.current = null;
          setErr(String(e)); setBusy(false);
        }
      }, 1000);
    } catch (e) { setErr(String(e)); setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onAutocomplete} className="flex flex-wrap gap-2 items-stretch">
        <input type="text" value={keyword} onChange={e => setKeyword(e.target.value)}
               placeholder="주소·지번 입력 (예: 남양주 다산동 또는 다산동 6143)"
               className="flex-1 min-w-[200px] h-10 px-3 rounded-lg border border-[color:var(--color-border)] text-sm"
               disabled={autoBusy} />
        <button type="submit" disabled={autoBusy || !keyword.trim()}
                className="h-10 px-4 rounded-lg bg-[color:var(--color-brand)] text-white text-sm font-semibold disabled:opacity-50">
          {autoBusy ? '검색 중...' : '주소 찾기'}
        </button>
      </form>
      {autoErr && <div className="text-sm text-red-600">{autoErr}</div>}

      {cands.length > 1 && !chosen && (
        <div className="border border-[color:var(--color-border)] rounded-lg p-3 space-y-1">
          <div className="text-xs text-[color:var(--color-muted)] mb-1">법정동 후보 선택:</div>
          {cands.map(c => (
            <button key={c.legalDivisionNumber} onClick={() => setChosen(c)}
                    className="block w-full text-left px-3 py-2 rounded hover:bg-[color:var(--color-bg-soft)] text-sm">
              <span className="font-mono text-[color:var(--color-muted)] mr-2">{c.legalDivisionNumber}</span>{c.name}
              {c.level && <span className="ml-2 text-xs text-[color:var(--color-muted)]">[{c.level}]</span>}
            </button>
          ))}
        </div>
      )}

      {chosen && (
        <div className="bg-[color:var(--color-bg-soft)] border border-[color:var(--color-border)] rounded-lg p-3 space-y-3">
          <div className="text-sm">
            <span className="text-[color:var(--color-muted)] mr-2">선택됨:</span>
            <span className="font-semibold">{chosen.name}</span>
            <button onClick={() => { setChosen(null); setItems([]); setStats(null); }}
                    className="ml-2 text-xs text-[color:var(--color-muted)] underline">변경</button>
          </div>
          <div className="text-xs text-sky-700 bg-sky-50 border border-sky-200 rounded px-2 py-1.5">
            지식산업센터(아파트형공장) 전용 검색 — KB 부동산 기반. 호수는 KB 등기주소(예: <b>제5층 제에프536호</b>) 원문 그대로.
            <br /><b>지번</b>까지 입력하면(예: 다산동 6143) 그 지번 건물 매물만 나옵니다.
          </div>

          {pickedLat != null && pickedLng != null && (
            <div className="space-y-2">
              <div className="text-xs text-[color:var(--color-muted)]">
                지도 클릭 → 중심점. 반경 <b className="text-[color:var(--color-ink)]">{radiusKm > 0 ? `${radiusKm}km` : '동 전체'}</b>
              </div>
              <div className="h-[260px] border border-[color:var(--color-border)] rounded">
                <MapContainer center={[pickedLat, pickedLng]} zoom={15} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
                  <TileLayer attribution='© OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <MapClickHandler onClick={(lat, lng) => { setPickedLat(lat); setPickedLng(lng); if (radiusKm === 0) setRadiusKm(0.5); }} />
                  <CenterUpdater lat={pickedLat} lng={pickedLng} />
                  <Marker position={[pickedLat, pickedLng]} />
                  {radiusKm > 0 && <Circle center={[pickedLat, pickedLng]} radius={radiusKm * 1000} pathOptions={{ color: '#3b82f6', fillOpacity: 0.1 }} />}
                </MapContainer>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-[color:var(--color-muted)]">반경:</span>
                {[0, 0.5, 1, 2].map(km => (
                  <button key={km} onClick={() => setRadiusKm(km)}
                          className={'px-2 py-1 rounded border ' + (radiusKm === km
                            ? 'bg-[color:var(--color-brand)] text-white border-[color:var(--color-brand)]'
                            : 'bg-white border-[color:var(--color-border)] hover:bg-[color:var(--color-bg-soft)]')}>
                    {km === 0 ? '동 전체' : `${km}km`}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-3 text-sm items-end">
            <label className="flex items-center gap-1">
              <span className="text-[color:var(--color-muted)] text-xs">거래유형:</span>
              <select value={trade} onChange={e => setTrade(e.target.value)}
                      className="h-8 px-2 rounded border border-[color:var(--color-border)] text-sm">
                {TRADE_TYPES.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
              </select>
            </label>
            <button onClick={onSearch} disabled={busy}
                    className="h-8 px-4 rounded-lg bg-[color:var(--color-brand)] text-white text-sm font-semibold disabled:opacity-50">
              {busy ? '검색 중...' : '지산 검색'}
            </button>
          </div>
        </div>
      )}

      {err && <div className="text-sm text-red-600">{err}</div>}
      {progress && progress.status === 'running' && <ProgressBar p={progress} />}
      {stats && (
        <div className="text-sm text-[color:var(--color-muted)]">
          전체 {stats.list}건 / 호수보강 {stats.ho}건
          {stats.truncated && <span className="text-amber-600 ml-2">(호수보강 상한 초과 — 일부만)</span>}
          {stats.elapsed != null && <span className="ml-2">({stats.elapsed}s)</span>}
        </div>
      )}
      {items.length > 0 && <ResultTable items={items} exportName={chosen?.name || ''} />}
    </div>
  );
}

const COLUMNS = ['거래', '단지/건물', '호수', '층', '전용(㎡)', '공급(㎡)', '매매/보증금(만원)', '월세(만원)', '매물번호(KB)'] as const;

function rowVals(it: JisanItem): string[] {
  const num = (v: unknown) => (v == null || v === '' ? '' : String(v));
  const deal = Number(it.매매가 || 0), warrant = Number(it.월세보증금 || 0), rent = Number(it.월세가 || 0);
  const dw = deal > 0 ? deal : (warrant > 0 ? warrant : 0);
  return [
    String(it.매물거래명 || ''), String(it.단지명 || it.매물종별명 || ''), String(it.호수 || ''),
    num(it.해당층수), num(it.전용면적), num(it.공급면적),
    dw > 0 ? String(dw) : '', rent > 0 ? String(rent) : '',
    String(it.매물일련번호 || ''),
  ];
}
function csvEscape(s: string): string { return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function downloadCsv(items: JisanItem[], baseName: string) {
  const body = '﻿' + COLUMNS.join(',') + '\n' + items.map(it => rowVals(it).map(csvEscape).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([body], { type: 'text/csv;charset=utf-8' }));
  const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_');
  const a = document.createElement('a');
  a.href = url; a.download = `jisan_${(baseName || 'list').replace(/[\\/:*?"<>|]/g, '_')}_${ts}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ResultTable({ items, exportName }: { items: JisanItem[]; exportName: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs text-[color:var(--color-muted)]">{items.length}건</div>
        <button onClick={() => downloadCsv(items, exportName)}
                className="h-8 px-3 rounded bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700">
          📊 엑셀(CSV) 다운로드
        </button>
      </div>
      <div className="overflow-x-auto border border-[color:var(--color-border)] rounded-lg">
        <table className="min-w-full text-xs">
          <thead className="bg-[color:var(--color-bg-soft)]"><tr>{COLUMNS.map(c => <Th key={c}>{c}</Th>)}</tr></thead>
          <tbody>
            {items.map((it, i) => {
              const v = rowVals(it);
              const dw = v[6] ? Number(v[6]).toLocaleString() : '';
              const rent = v[7] ? Number(v[7]).toLocaleString() : '';
              return (
                <tr key={String(it.매물일련번호) || i} className="border-t border-[color:var(--color-border)] hover:bg-[color:var(--color-bg-soft)]">
                  <Td>{v[0]}</Td>
                  <Td className="max-w-[160px] truncate" title={v[1]}>{v[1]}</Td>
                  <Td className="font-semibold whitespace-nowrap" title={it._상세주소}>{v[2]}</Td>
                  <Td>{v[3]}</Td><Td>{v[4]}</Td><Td>{v[5]}</Td>
                  <Td className="text-right whitespace-nowrap">{dw}</Td>
                  <Td className="text-right whitespace-nowrap">{rent}</Td>
                  <Td className="text-[color:var(--color-muted)] whitespace-nowrap">
                    {it.매물일련번호
                      ? <a href={`https://kbland.kr/p/${it.매물일련번호}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{v[8]}</a>
                      : v[8]}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MapClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onClick(e.latlng.lat, e.latlng.lng) });
  return null;
}
function CenterUpdater({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap(); const lastRef = useRef<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (lastRef.current && lastRef.current.lat === lat && lastRef.current.lng === lng) return;
    map.setView([lat, lng], map.getZoom()); lastRef.current = { lat, lng };
  }, [lat, lng, map]);
  return null;
}
function ProgressBar({ p }: { p: JisanProgress }) {
  const inHo = p.stage === 'ho' && p.ho_total > 0;
  const pct = inHo ? Math.min(100, Math.floor((p.ho_done / p.ho_total) * 100)) : 0;
  return (
    <div className="border border-blue-200 bg-blue-50 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <span className="inline-block w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
        <span className="font-semibold text-blue-700">{p.stage_label}</span>
        <span className="ml-auto text-xs text-[color:var(--color-muted)]">경과 {Math.floor(p.elapsed_sec)}초</span>
      </div>
      {p.stage === 'list' && <div className="text-xs text-[color:var(--color-muted)]">page {p.page} — 누적 {p.list_count}건</div>}
      {inHo && (
        <>
          <div className="text-xs text-[color:var(--color-muted)]">호수 보강: {p.ho_done} / {p.ho_total}건 ({pct}%)</div>
          <div className="w-full h-2 rounded bg-blue-100 overflow-hidden"><div className="h-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} /></div>
        </>
      )}
    </div>
  );
}
function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-2 py-2 text-left text-xs font-semibold text-[color:var(--color-muted)] whitespace-nowrap">{children}</th>;
}
function Td({ children, className = '', title }: { children: React.ReactNode; className?: string; title?: string }) {
  return <td className={`px-2 py-1.5 ${className}`} title={title}>{children}</td>;
}
