// JisanSearch.tsx — 지식산업센터(지산) 검색 탭 (2026-07 신설, 빌라 탭과 별개)
// KB-native 지역/지번 검색 (propList/stutCdFilter + bascInfo 호수) + 네이버 매물번호 호수 조회(neonet).
// 지도는 '확인용' — 검색 결과(지번) 위치를 표시. 클릭 검색/반경 없음.
import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
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
  단지명?: string; 건물명?: string; 상세번지내용?: string; 호수?: string;
  wgs84위도?: string | number; wgs84경도?: string | number; [k: string]: unknown;
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

type SubTab = 'area' | 'article';

export default function JisanSearch({ session }: Props) {
  const [subTab, setSubTab] = useState<SubTab>('area');
  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-[color:var(--color-border)]">
        <SubTabBtn active={subTab === 'area'} onClick={() => setSubTab('area')}>지역/지번 검색</SubTabBtn>
        <SubTabBtn active={subTab === 'article'} onClick={() => setSubTab('article')}>네이버 매물번호 조회</SubTabBtn>
      </div>
      {subTab === 'area'    && <AreaSearch session={session} />}
      {subTab === 'article' && <ArticleByNaverNo session={session} />}
    </div>
  );
}

function SubTabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={'px-4 py-2 text-sm font-semibold border-b-2 transition ' +
        (active ? 'border-[color:var(--color-brand)] text-[color:var(--color-brand)]'
                : 'border-transparent text-[color:var(--color-muted)] hover:text-[color:var(--color-ink)]')}>
      {children}
    </button>
  );
}

// ── 지역/지번 검색 ───────────────────────────────────────────────────────────
function AreaSearch({ session }: { session: Session | null }) {
  const [keyword, setKeyword]   = useState('');
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoErr, setAutoErr]   = useState('');
  const [cands, setCands]       = useState<AutoItem[]>([]);
  const [chosen, setChosen]     = useState<AutoItem | null>(null);
  const [trade, setTrade]       = useState('');

  const [busy, setBusy]     = useState(false);
  const [err, setErr]       = useState('');
  const [items, setItems]   = useState<JisanItem[]>([]);
  const [stats, setStats]   = useState<{ list: number; ho: number; truncated?: boolean; elapsed?: number } | null>(null);
  const [progress, setProgress] = useState<JisanProgress | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => () => { if (pollRef.current != null) window.clearInterval(pollRef.current); }, []);

  async function onAutocomplete(e: React.FormEvent) {
    e.preventDefault();
    const kw = keyword.trim(); if (!kw) return;
    setAutoBusy(true); setAutoErr(''); setCands([]); setChosen(null); setItems([]); setStats(null); setErr('');
    try {
      const r = await apiPost(session, '/api/jisan/autocomplete', { keyword: kw });
      setCands(r.items || []);
      if (!r.items?.length) setAutoErr('법정동 후보를 찾지 못했습니다 (동을 포함해 입력하세요)');
      else if (r.items.length === 1) setChosen(r.items[0]);
    } catch (e) { setAutoErr(String(e)); } finally { setAutoBusy(false); }
  }

  async function onSearch() {
    if (!chosen) return;
    setBusy(true); setErr(''); setItems([]); setStats(null); setProgress(null);
    if (pollRef.current != null) { window.clearInterval(pollRef.current); pollRef.current = null; }
    try {
      const start = await apiPost(session, '/api/jisan/search/start', {
        cortar_no: chosen.legalDivisionNumber,
        trade_type: trade,
        addr: keyword.trim(),   // 지번/건물 필터 — 입력에 지번 있으면 그 건물만
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
               placeholder="주소·지번·건물명 (예: 다산동 6143 또는 다산동 현대테라타워)"
               className="flex-1 min-w-[220px] h-10 px-3 rounded-lg border border-[color:var(--color-border)] text-sm"
               disabled={autoBusy} />
        <button type="submit" disabled={autoBusy || !keyword.trim()}
                className="h-10 px-4 rounded-lg bg-[color:var(--color-brand)] text-white text-sm font-semibold disabled:opacity-50">
          {autoBusy ? '검색 중...' : '주소 찾기'}
        </button>
      </form>
      <div className="text-xs text-sky-700 bg-sky-50 border border-sky-200 rounded px-2 py-1.5">
        지식산업센터 전용 (KB 부동산). 동 뒤에 <b>지번</b>(예: 다산동 6143) 또는 <b>건물명</b>(예: 다산동 현대테라타워)을 넣으면 그 건물 매물만 나옵니다.
        호수는 KB 등기주소(예: <b>제5층 제에프536호</b>) 원문. 지도는 위치 <b>확인용</b>입니다.
      </div>
      {autoErr && <div className="text-sm text-red-600">{autoErr}</div>}

      {cands.length > 1 && !chosen && (
        <div className="border border-[color:var(--color-border)] rounded-lg p-3 space-y-1">
          <div className="text-xs text-[color:var(--color-muted)] mb-1">법정동 후보 선택:</div>
          {cands.map(c => (
            <button key={c.legalDivisionNumber} onClick={() => setChosen(c)}
                    className="block w-full text-left px-3 py-2 rounded hover:bg-[color:var(--color-bg-soft)] text-sm">
              <span className="font-mono text-[color:var(--color-muted)] mr-2">{c.legalDivisionNumber}</span>{c.name}
            </button>
          ))}
        </div>
      )}

      {chosen && (
        <div className="bg-[color:var(--color-bg-soft)] border border-[color:var(--color-border)] rounded-lg p-3 flex flex-wrap gap-3 items-center">
          <div className="text-sm">
            <span className="text-[color:var(--color-muted)] mr-2">선택됨:</span>
            <span className="font-semibold">{chosen.name}</span>
            <button onClick={() => { setChosen(null); setItems([]); setStats(null); }}
                    className="ml-2 text-xs text-[color:var(--color-muted)] underline">변경</button>
          </div>
          <label className="flex items-center gap-1 text-sm">
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
      )}

      {err && <div className="text-sm text-red-600">{err}</div>}
      {progress && progress.status === 'running' && <ProgressBar p={progress} />}
      {stats && (
        <div className="text-sm text-[color:var(--color-muted)]">
          {stats.list}건
          {stats.truncated && <span className="text-amber-600 ml-2">(호수보강 상한 초과)</span>}
          {stats.elapsed != null && <span className="ml-2">({stats.elapsed}s)</span>}
        </div>
      )}

      {items.length > 0 && (
        <>
          <RefMap items={items} fallback={chosen} />
          <ResultTable items={items} exportName={chosen?.name || ''} />
        </>
      )}
    </div>
  );
}

// ── 네이버 매물번호 → 지산 호수 조회 ─────────────────────────────────────────
function ArticleByNaverNo({ session }: { session: Session | null }) {
  const [no, setNo]   = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [res, setRes] = useState<{ ho: string; ho_raw: string; ho_source: string; info: Record<string, unknown> } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = no.trim(); if (!v) return;
    setBusy(true); setErr(''); setRes(null);
    try {
      const r = await apiPost(session, '/api/jisan/article', { article_no: v });
      setRes({ ho: r.ho || '', ho_raw: r.ho_raw || '', ho_source: r.ho_source || '', info: r.info || {} });
      if (!r.ho) setErr('호수를 찾지 못했습니다 (neonet 미등록 매물이거나 지산이 아님)');
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  }

  const info = res?.info || {};
  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="flex gap-2 items-stretch">
        <input type="text" value={no} onChange={e => setNo(e.target.value)}
               placeholder="네이버 매물번호 (예: 2637876254)"
               className="flex-1 max-w-md h-10 px-3 rounded-lg border border-[color:var(--color-border)] text-sm"
               disabled={busy} />
        <button type="submit" disabled={busy || !no.trim()}
                className="h-10 px-4 rounded-lg bg-[color:var(--color-brand)] text-white text-sm font-semibold disabled:opacity-50">
          {busy ? '조회 중...' : '호수 조회'}
        </button>
      </form>
      <div className="text-xs text-sky-700 bg-sky-50 border border-sky-200 rounded px-2 py-1.5">
        네이버에 올라온 지산 매물의 번호로 호수를 조회합니다 (neonet 경로). 호수는 영숫자 원문(예: <b>sb-112</b>).
      </div>
      {err && <div className="text-sm text-red-600">{err}</div>}
      {res && res.ho && <JisanDetailCard info={info} ho={res.ho} hoRaw={res.ho_raw} articleNo={no.trim()} />}
    </div>
  );
}

// 만원 단위 → '억/만' 표기
function fmtMan(n: number): string {
  if (!n || n <= 0) return '';
  if (n >= 10000) {
    const eok = Math.floor(n / 10000), man = n % 10000;
    return man > 0 ? `${eok}억 ${man.toLocaleString()}만` : `${eok}억`;
  }
  return `${n.toLocaleString()}만`;
}

function JisanDetailCard({ info, ho, hoRaw, articleNo }:
  { info: Record<string, unknown>; ho: string; hoRaw: string; articleNo: string }) {
  const g = (k: string) => (info[k] != null && info[k] !== '' ? String(info[k]) : '');
  const n = (k: string) => { const x = Number(info[k]); return isFinite(x) ? x : 0; };

  const bldg  = g('buildingName') || g('bldNm') || g('articleName');
  const rtype = g('realEstateTypeName') || '지식산업센터';
  const trade = g('tradeTypeName');
  const deal  = n('price_deal') || n('dealPrice');
  const warrant = n('warrantPrice');
  const rent  = n('rentPrice') || n('rentPrc');
  let priceStr = '';
  if (trade === '매매') priceStr = fmtMan(deal || warrant);
  else if (trade === '전세') priceStr = fmtMan(warrant);
  else if (rent > 0) priceStr = `보증 ${fmtMan(warrant)} / 월 ${fmtMan(rent)}`;
  else priceStr = fmtMan(warrant || deal);

  const excl = g('exclusiveSpace') || g('area2');
  const sply = g('supplySpace') || g('area1');
  const areaStr = excl ? `전용 ${excl}㎡${sply ? ` / 공급 ${sply}㎡` : ''}` : '';
  const floor = g('floorInfo') || (g('correspondingFloorCount') ? `${g('correspondingFloorCount')}/${g('totalFloorCount')}` : '');
  const dir   = g('directionTypeName');
  const aprv  = g('useAprDay') || g('buildingUseAprvYmd');
  const parking = g('parkingPossibleYN') === 'Y' ? `가능${n('parkingCount') ? ` (${n('parkingCount')}대)` : ''}` : (g('parkingCount') ? `${g('parkingCount')}대` : '');
  const elvt  = g('elvtInfo') || (n('totalElvtCnt') ? `${n('totalElvtCnt')}대` : '');
  const moveIn = g('moveInTypeName') || g('moveInPossibleYmd');
  const realtor = g('realtorName') || g('representativeName');
  const tel   = g('representativeTelNo') || g('cellPhoneNo');
  const verif = g('verificationTypeName');
  const addr  = g('exposureAddress') || g('address');
  const feat  = g('articleFeatureDesc') || g('articleFeatureDescription');
  const tags  = Array.isArray(info['tagList']) ? (info['tagList'] as string[]) : [];
  const cpUrl = g('cpPcArticleUrl');

  const rows = ([
    ['거래', trade && priceStr ? `${trade}  ${priceStr}` : (trade || priceStr)],
    ['면적', areaStr],
    ['층', floor],
    ['방향', dir],
    ['사용승인', aprv],
    ['주차', parking],
    ['승강기', elvt],
    ['입주', moveIn],
    ['확인유형', verif],
    ['주소', addr],
  ] as [string, string][]).filter(([, v]) => v);

  return (
    <div className="border border-[color:var(--color-border)] rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg font-bold">{bldg || '지식산업센터'}</span>
            <span className="text-xs px-2 py-0.5 rounded bg-sky-100 text-sky-700 font-semibold">{rtype}</span>
          </div>
          <div className="text-xs text-[color:var(--color-muted)] mt-0.5">네이버 매물번호 {articleNo}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-[color:var(--color-muted)]">호수</div>
          <div className="text-3xl font-extrabold text-[color:var(--color-brand)] leading-tight">{ho}</div>
          {hoRaw && hoRaw !== ho && <div className="text-xs text-[color:var(--color-muted)]">{hoRaw}</div>}
        </div>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((t, i) => <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-[color:var(--color-bg-soft)] border border-[color:var(--color-border)]">{t}</span>)}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
        {rows.map(([label, v]) => (
          <div key={label} className="flex gap-2">
            <span className="text-[color:var(--color-muted)] text-xs w-16 shrink-0 pt-0.5">{label}</span>
            <span className="flex-1">{v}</span>
          </div>
        ))}
      </div>

      {feat && (
        <div className="text-sm bg-[color:var(--color-bg-soft)] rounded-lg px-3 py-2">
          <span className="text-xs text-[color:var(--color-muted)] mr-2">특징</span>{feat}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap pt-1 border-t border-[color:var(--color-border)]">
        <div className="text-sm">
          {realtor && <span className="font-semibold">{realtor}</span>}
          {tel && <span className="ml-2 text-[color:var(--color-muted)]">{tel}</span>}
        </div>
        {cpUrl && (
          <a href={cpUrl} target="_blank" rel="noopener noreferrer"
             className="text-xs text-blue-600 underline">원문(neonet) 보기 →</a>
        )}
      </div>
    </div>
  );
}

// ── 결과표 (유입·매물번호 컬럼 없음) ─────────────────────────────────────────
const COLUMNS = ['거래', '건물/지번', '호수', '층', '전용', '공급', '방향', '욕실',
  '매매/보증금(만원)', '월세(만원)', '준공', '입주', '특징', '등록일', '중개사', '전화'] as const;

function _s(v: unknown): string { return v == null || v === '' ? '' : String(v); }
function _n(v: unknown): number { const n = Number(v); return isFinite(n) && n > 0 ? n : 0; }
function _area(v: unknown): string { const m = _n(v); return m > 0 ? `${m}㎡·${(m / 3.3058).toFixed(1)}평` : ''; }
function _ymd(v: unknown): string {
  const s = _s(v).replace(/\D/g, '');
  if (s === 'NOW') return '즉시';
  if (s.length === 8) return `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)}`;
  if (s.length >= 6) return `${s.slice(0, 4)}.${s.slice(4, 6)}`;
  return _s(v) === 'NOW' ? '즉시' : _s(v);
}

function rowVals(it: JisanItem): string[] {
  const trade = _s(it['매물거래구분명']) || _s(it.매물거래명);
  const bldg  = _s(it.건물명) || _s(it.단지명) || _s(it.매물종별명);
  const bun   = _s(it.상세번지내용);
  const flr   = _s(it.해당층수);
  const tot   = _s(it['총층수']) || _s(it['총지상층수']);
  const floorCell = flr ? (tot ? `${flr}/${tot}` : flr) : (tot ? `-/${tot}` : '');
  const deal = _n(it.매매가), warrant = _n(it.월세보증금), rent = _n(it.월세가);
  const dw = deal > 0 ? deal : (warrant > 0 ? warrant : 0);
  const moveIn = _s(it['입주가능일내용']);
  return [
    trade,
    bldg + (bun ? ` ${bun}` : ''),
    _s(it.호수),
    floorCell,
    _area(it.전용면적),
    _area(it.공급면적),
    _s(it['방향구분명']),
    _s(it['욕실수']),
    dw > 0 ? String(dw) : '',
    rent > 0 ? String(rent) : '',
    _ymd(it['사용승인일']),
    moveIn === 'NOW' ? '즉시' : _ymd(moveIn),
    _s(it['특징광고내용']),
    _s(it['등록년월일']) || _s(it['매물확인년월일']),
    _s(it['중개업소명']),
    _s(it['중개업소전화번호']),
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
              const dw = v[8] ? Number(v[8]).toLocaleString() : '';
              const rent = v[9] ? Number(v[9]).toLocaleString() : '';
              return (
                <tr key={String(it.매물일련번호) || i} className="border-t border-[color:var(--color-border)] hover:bg-[color:var(--color-bg-soft)]">
                  <Td>{v[0]}</Td>
                  <Td className="max-w-[190px] truncate" title={v[1]}>{v[1]}</Td>
                  <Td className="font-semibold whitespace-nowrap">{v[2]}</Td>
                  <Td className="whitespace-nowrap">{v[3]}</Td>
                  <Td className="whitespace-nowrap">{v[4]}</Td>
                  <Td className="whitespace-nowrap">{v[5]}</Td>
                  <Td>{v[6]}</Td>
                  <Td className="text-center">{v[7]}</Td>
                  <Td className="text-right whitespace-nowrap">{dw}</Td>
                  <Td className="text-right whitespace-nowrap">{rent}</Td>
                  <Td className="whitespace-nowrap">{v[10]}</Td>
                  <Td className="whitespace-nowrap">{v[11]}</Td>
                  <Td className="max-w-[200px] truncate" title={v[12]}>{v[12]}</Td>
                  <Td className="whitespace-nowrap">{v[13]}</Td>
                  <Td className="max-w-[140px] truncate" title={v[14]}>{v[14]}</Td>
                  <Td className="whitespace-nowrap text-[color:var(--color-muted)]">{v[15]}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── 확인용 지도 (결과 위치 표시, 읽기전용) ───────────────────────────────────
function RefMap({ items, fallback }: { items: JisanItem[]; fallback: AutoItem | null }) {
  // 좌표 있는 매물 → 건물 단위로 dedupe (같은 좌표 묶기)
  const pts: { lat: number; lng: number; label: string; count: number }[] = [];
  const seen = new Map<string, number>();
  for (const it of items) {
    const lat = parseFloat(String(it.wgs84위도 ?? ''));
    const lng = parseFloat(String(it.wgs84경도 ?? ''));
    if (isNaN(lat) || isNaN(lng)) continue;
    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    const idx = seen.get(key);
    if (idx == null) {
      seen.set(key, pts.length);
      pts.push({ lat, lng, label: String(it.건물명 || it.상세번지내용 || ''), count: 1 });
    } else {
      pts[idx].count += 1;
    }
  }
  let center: [number, number] | null = pts.length ? [pts[0].lat, pts[0].lng] : null;
  if (!center && fallback) {
    const lat = parseFloat(fallback.latitude), lng = parseFloat(fallback.longitude);
    if (!isNaN(lat) && !isNaN(lng)) center = [lat, lng];
  }
  if (!center) return null;

  return (
    <div className="space-y-1">
      <div className="text-xs text-[color:var(--color-muted)]">📍 위치 확인용 지도 — 검색된 지번/건물 {pts.length}곳</div>
      <div className="h-[260px] border border-[color:var(--color-border)] rounded overflow-hidden">
        <MapContainer center={center} zoom={16} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
          <TileLayer attribution='© OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <FitBounds pts={pts} />
          {pts.map((p, i) => (
            <Marker key={i} position={[p.lat, p.lng]}>
              <Popup>{p.label || '지산'} · {p.count}건</Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}

function FitBounds({ pts }: { pts: { lat: number; lng: number }[] }) {
  const map = useMap();
  useEffect(() => {
    if (pts.length === 1) { map.setView([pts[0].lat, pts[0].lng], 17); return; }
    if (pts.length > 1) {
      const b = L.latLngBounds(pts.map(p => [p.lat, p.lng] as [number, number]));
      map.fitBounds(b, { padding: [30, 30], maxZoom: 17 });
    }
  }, [pts, map]);
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
