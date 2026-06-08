import { useEffect, useMemo, useRef, useState } from 'react';
import { extractCancel } from '../lib/api';
import type { Session } from '@supabase/supabase-js';
import {
  startExtract, getExtractStatus,
  exportExcel, exportCsv, exportZip,
  exportExcelBytes,
  savePortfolio,
  type ComplexItem, type JobStatus, ApiError,
} from '../lib/api';
import { isFsaSupported, getOrPickNfindRoot, writeFileToPath, forgetNfindRoot, isFsaNotFoundError } from '../lib/fsaccess';

interface Props {
  session: Session | null;
  complex: ComplexItem;
  keyword?: string;
  onBack: () => void;
}

export type Row = Record<string, unknown>;

// scrapers.py COLUMNS 순서 유지 (묶음행 전용 최고/최저 8개 제외 — 동일매물 묶기 기능 붙일 때 추가)
export interface Col {
  label: string;
  key: string;
  w?: number;    // 권장 폭(px)
  wrap?: boolean; // 긴 텍스트 줄바꿈 허용
  frozen?: boolean; // true 면 왼쪽 고정 (가로 스크롤 시 붙어있음)
  hidden?: boolean; // true 면 UI 에 표시 안 함 (row data 는 유지 — 내부용)
}

// 거래 ~ 층까지 왼쪽 고정, 그 뒤에 방향 이동 + 나머지는 가로 스크롤.
export const COLUMNS: Col[] = [
  { label: '거래',        key: '매물거래구분명',   w: 56,  frozen: true },
  { label: '단지명',      key: '단지명',          w: 130, frozen: true, hidden: true },
  { label: '동',          key: '건물동명',         w: 50,  frozen: true },
  { label: '호수',        key: '건물호명',         w: 60,  frozen: true },
  { label: '층',          key: '해당층수',         w: 56 },
  { label: '방향',        key: '방향구분명',       w: 56 },
  { label: '매물등록일',  key: '등록년월일',       w: 92 },
  { label: '인증종류',    key: '인증종류',         w: 72 },
  { label: '공급(㎡)',    key: '공급면적',         w: 74 },
  { label: '전용(㎡)',    key: '전용면적',         w: 74 },
  { label: '매매가',      key: '_매매가',          w: 110 },
  { label: '프리미엄(저)', key: '_저프리미엄',      w: 96 },
  { label: '프리미엄(고)', key: '_고프리미엄',      w: 96 },
  { label: '프리미엄(개별)', key: '_프리미엄개별', w: 100 },
  { label: '분양옵션',    key: '_분양옵션',        w: 88 },
  { label: '전세가',      key: '_전세가',          w: 104 },
  { label: '보증금',      key: '_보증금',          w: 96 },
  { label: '월세',        key: '_월세가',          w: 76 },
  { label: '방수',        key: '방수',             w: 48 },
  { label: '욕실',        key: '욕실수',           w: 48 },
  { label: '입주',        key: '입주가능일내용',   w: 92 },
  { label: '중개업소',    key: '중개업소명',       w: 150 },
  { label: '연락처',      key: '중개업소전화번호', w: 112 },
  { label: '매물설명',    key: '특징광고내용',     w: 320, wrap: true },
];

// 고정 컬럼의 누적 left offset 계산 (sticky CSS 용)
export function frozenOffset(cols: Col[], i: number): number | null {
  if (!cols[i]?.frozen) return null;
  let off = 0;
  for (let j = 0; j < i; j++) if (cols[j].frozen) off += cols[j].w ?? 0;
  return off;
}
// 고정 영역 끝나는 경계면(마지막 frozen 의 오른쪽 경계) — 구분선 스타일 적용용
export function isLastFrozen(cols: Col[], i: number): boolean {
  if (!cols[i]?.frozen) return false;
  return !cols[i + 1]?.frozen;
}

// 모바일용 컬럼 축소 — frozen 2개로 줄이고 폭 약 65% 축소
export function toMobileCols(cols: Col[]): Col[] {
  return cols.map((c) => ({
    ...c,
    frozen: c.frozen,   // base 의 frozen 그대로 보존 (단지명 hidden 후 거래/동/호수)
    w: Math.max(36, Math.round((c.w ?? 60) * 0.65)),
  }));
}

// 정렬용 값 추출 — 숫자/문자열 혼합 컬럼 지원
export function getSortable(row: Row, key: string): number | string {
  const num = (v: unknown): number => {
    const n = parseInt(String(v ?? '').replace(/,/g, ''), 10);
    return Number.isFinite(n) ? n : 0;
  };
  const firstDigit = (v: unknown): number => {
    const m = String(v ?? '').match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  };
  const parseKrPrice = (s: unknown): number => {
    // "10억 5,000만" → 105000 (만원 단위)
    const str = String(s ?? '');
    if (!str) return 0;
    let total = 0;
    const m1 = str.match(/(\d+)\s*억/);
    if (m1) total += parseInt(m1[1], 10) * 10000;
    const m2 = str.match(/([\d,]+)\s*만/);
    if (m2) total += parseInt(m2[1].replace(/,/g, ''), 10);
    if (!m1 && !m2) {
      const n = parseInt(str.replace(/[^\d]/g, ''), 10);
      if (Number.isFinite(n)) total = n;
    }
    return total;
  };
  switch (key) {
    case '_매매가': return num(row['매매가'] ?? row['매매일반거래가']);
    case '_전세가': return num(row['전세가'] ?? row['전세일반거래가']);
    case '_보증금': return num(row['월세보증금'] ?? row['월세보증금액']);
    case '_월세가': return num(row['월세가']);
    // 묶음 모드 최고/최저 — 이미 포맷된 문자열
    case '_매매최고': case '_매매최저':
    case '_전세최고': case '_전세최저':
    case '_보증최고': case '_보증최저':
    case '_월세최고': case '_월세최저':
      return parseKrPrice(row[key]);
    case '건물동명':
    case '건물호명':
    case '해당층수':
      return firstDigit(row[key]);
    case '공급면적':
    case '전용면적':
    case '방수':
    case '욕실수':
      return parseFloat(String(row[key] ?? '')) || 0;
    case '등록년월일':
      return parseInt(String(row[key] ?? '').replace(/[^\d]/g, ''), 10) || 0;
    default:
      return String(row[key] ?? '');
  }
}

export function useIsMobile(breakpoint = 640): boolean {
  const [m, setM] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(`(max-width: ${breakpoint}px)`).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const h = (e: MediaQueryListEvent) => setM(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, [breakpoint]);
  return m;
}

// 묶음 모드: 단일 가격 컬럼 4개를 최고/최저 8개로 교체. scrapers.py GROUP_ONLY_COLS 와 동일.
const GROUP_PRICE_COLS: Col[] = [
  { label: '매매최고',    key: '_매매최고',        w: 100 },
  { label: '매매최저',    key: '_매매최저',        w: 100 },
  { label: '전세최고',    key: '_전세최고',        w: 100 },
  { label: '전세최저',    key: '_전세최저',        w: 100 },
  { label: '보증최고',    key: '_보증최고',        w: 90 },
  { label: '보증최저',    key: '_보증최저',        w: 90 },
  { label: '월세최고',    key: '_월세최고',        w: 80 },
  { label: '월세최저',    key: '_월세최저',        w: 80 },
];

export const TRADE_BG_EXPORT = { 매매: 'bg-green-50', 전세: 'bg-amber-50', 월세: 'bg-blue-50' } as const;

function makeGroupedColumns(): Col[] {
  const out: Col[] = [];
  for (const c of COLUMNS) {
    // 매매가 자리에 최고/최저 8개를 모두 삽입, 나머지 단일 가격 컬럼(전세가/보증금/월세)은 제거
    if (c.key === '_매매가') { out.push(...GROUP_PRICE_COLS); continue; }
    if (c.key === '_전세가' || c.key === '_보증금' || c.key === '_월세가') continue;
    out.push(c);
  }
  return out;
}
export const COLUMNS_GROUPED: Col[] = makeGroupedColumns();

// 거래별 행 배경 (scrapers.py TRADE_COLORS)
const TRADE_BG: Record<string, string> = {
  매매: 'bg-green-50',
  전세: 'bg-amber-50',
  월세: 'bg-blue-50',
};

// 인증 코드 → 한글 (scrapers.py item_values 로직 이식)
const VERIF_KO = new Set(['신홍보', '구홍보', '현장', '집주인', '전화확인', '협회', '공동중개']);
export function verifKo(raw: unknown): string {
  const c = String(raw ?? '');
  if (!c) return '';
  if (VERIF_KO.has(c)) return c;
  if (['NDOC', 'NDOC1', 'NDOC2', 'DOCV2', 'CONFIRMED'].includes(c)) return '신홍보';
  if (['DOC', 'DOC1', 'UNCONFIRMED'].includes(c)) return '구홍보';
  if (['SITE', 'S_VR', 'SITEV1', 'SITEV2'].includes(c)) return '현장';
  if (['OWNER', 'MOBL', 'MOBLV1', 'MOBLV2'].includes(c)) return '집주인';
  if (['TEL', 'PHONE'].includes(c)) return '전화확인';
  if (c === 'NONE') return '협회';
  if (['JOINT', 'CO_BRK'].includes(c)) return '공동중개';
  return '';
}

function fmtPrice(v: unknown): string {
  if (v == null || v === '' || v === 0 || v === '0') return '';
  const n = typeof v === 'number' ? v : parseInt(String(v).replace(/,/g, ''), 10);
  if (!Number.isFinite(n) || n === 0) return '';
  if (n >= 10000) {
    const ok = Math.floor(n / 10000);
    const r = n % 10000;
    return r > 0 ? `${ok}억 ${r.toLocaleString()}만` : `${ok}억`;
  }
  return `${n.toLocaleString()}만`;
}

function dep(row: Row): unknown {
  return row['월세보증금'] ?? row['월세보증금액'];
}

export function formatPhone(tel: string): string {
  const s = tel.replace(/[^0-9]/g, '');
  if (!s) return tel;
  if (s.startsWith('02')) {
    if (s.length === 10) return `02-${s.slice(2, 6)}-${s.slice(6)}`;
    if (s.length === 9)  return `02-${s.slice(2, 5)}-${s.slice(5)}`;
  }
  if (s.length === 11) return `${s.slice(0, 3)}-${s.slice(3, 7)}-${s.slice(7)}`;
  if (s.length === 10) return `${s.slice(0, 3)}-${s.slice(3, 6)}-${s.slice(6)}`;
  if (s.length === 9)  return `${s.slice(0, 2)}-${s.slice(2, 5)}-${s.slice(5)}`;
  if (s.length === 8)  return `${s.slice(0, 4)}-${s.slice(4)}`;
  return tel;
}

// 한 셀에 다수 번호가 "; " 또는 "/" 또는 "," 로 묶여올 수 있어 분리 후 각각 포맷
export function formatPhoneCell(raw: string): string {
  const parts = raw.split(/\s*[;,/|]\s*/).filter(Boolean);
  if (parts.length <= 1) return formatPhone(raw);
  return parts.map(formatPhone).join(', ');
}

export function cellValue(row: Row, col: Col): string {
  const trade = String(row['매물거래구분명'] ?? '');
  const presale = Boolean(row['_isPresale']);

  switch (col.key) {
    case '_매매가':
      if (trade !== '매매') return '';
      if (presale && row['_dealPrice']) return fmtPrice(row['_dealPrice']);
      return fmtPrice(row['매매가'] ?? row['매매일반거래가']);
    case '_프리미엄개별': return presale && row['_premiumActual'] != null ? fmtPrice(row['_premiumActual']) : '';
    case '_저프리미엄':
      return presale && row['_premiumMin'] != null ? fmtPrice(row['_premiumMin']) : '';
    case '_고프리미엄':
      return presale && row['_premiumMax'] != null ? fmtPrice(row['_premiumMax']) : '';
    case '_분양옵션':
      return presale && row['_optionPrice'] != null ? fmtPrice(row['_optionPrice']) : '';
    case '_전세가':
      return trade === '전세' ? fmtPrice(row['전세가'] ?? row['전세일반거래가']) : '';
    case '_보증금':
      return trade === '월세' ? fmtPrice(dep(row)) : '';
    case '_월세가':
      return trade === '월세' ? fmtPrice(row['월세가']) : '';
    // ── 묶음 모드 min/max ────────────────────────
    case '_매매최고':
    case '_매매최저':
    case '_전세최고':
    case '_전세최저':
    case '_보증최고':
    case '_보증최저':
    case '_월세최고':
    case '_월세최저': {
      const v = row[col.key];
      return v == null ? '' : String(v);
    }
    case '인증종류':
      return verifKo(row['인증종류']);
    case '중개업소전화번호':
      return formatPhoneCell(String(row['중개업소전화번호'] ?? ''));
    case '입주가능일내용': {
      const v = String(row['입주가능일내용'] ?? '').trim();
      return v.toUpperCase() === 'NOW' ? '상시' : v;
    }
    default: {
      const v = row[col.key];
      return v == null ? '' : String(v);
    }
  }
}

// scrapers.py group_items() 포팅. 같은 (동, 호, 거래) 행들을 하나로 묶고 최고/최저 계산.
function rawNum(v: unknown): number {
  const n = parseInt(String(v ?? '').replace(/,/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

export function groupRows(rows: Row[]): Row[] {
  const map = new Map<string, Row[]>();
  for (const r of rows) {
    const k = `${r['건물동명'] ?? ''}|${r['건물호명'] ?? ''}|${r['매물거래구분명'] ?? ''}`;
    const arr = map.get(k);
    if (arr) arr.push(r); else map.set(k, [r]);
  }
  const out: Row[] = [];
  for (const group of map.values()) {
    const isGrouped = group.length > 1;

    const merged: Row = { ...group[0] };
    if (isGrouped) {
      const trades = Array.from(new Set(
        group.map(it => String(it['매물거래구분명'] ?? '')).filter(Boolean)
      ));
      const seen = new Set<string>();
      const uniqueBrokers: Row[] = [];
      for (const it of group) {
        const nm = String(it['중개업소명'] ?? '');
        if (nm && !seen.has(nm)) { seen.add(nm); uniqueBrokers.push(it); }
      }
      const rep = uniqueBrokers[0] ?? group[0] ?? {};
      const repName = String(rep['중개업소명'] ?? '');
      const repTel  = String(rep['중개업소전화번호'] ?? '');
      const dates = group
        .map(it => String(it['등록년월일'] ?? ''))
        .filter(Boolean).sort().reverse();

      merged['_grouped'] = true;
      merged['_count']   = group.length;
      merged['_items']   = group;
      merged['매물거래구분명']   = trades.join('/');
      merged['중개업소명']       = uniqueBrokers.length > 1
        ? `${repName} 외 ${uniqueBrokers.length - 1}` : repName;
      merged['중개업소전화번호'] = repTel;
      merged['등록년월일']       = dates[0] ?? '';
      merged['매물일련번호']     = `(${group.length}건 묶음)`;
      merged['특징광고내용']     = '';
    }

    // 최고/최저 — 단일/다중 모두 동일하게 채움 (단일이면 최고=최저, 최저는 공란)
    const computeMinMax = (
      items: Row[],
      pick: (it: Row) => number,
      hiKey: string,
      loKey: string,
    ) => {
      const vals = items.map(it => ({ v: pick(it), it })).filter(x => x.v > 0);
      if (!vals.length) { merged[hiKey] = ''; merged[loKey] = ''; return; }
      const hi = vals.reduce((a, b) => a.v >= b.v ? a : b);
      const lo = vals.reduce((a, b) => a.v <= b.v ? a : b);
      merged[hiKey] = fmtPrice(hi.v);
      merged[loKey] = hi.v !== lo.v ? fmtPrice(lo.v) : '';
    };

    const 매매 = group.filter(it => it['매물거래구분명'] === '매매');
    const 전세 = group.filter(it => it['매물거래구분명'] === '전세');
    const 월세 = group.filter(it => it['매물거래구분명'] === '월세');
    // 분양권은 fin.land 의 정확한 _dealPrice (만원 정수) 우선. 없으면 KB/cluster 의 매매가.
    // 묶기 OFF 표시(213~216줄) 와 동일한 우선순위 — round 값으로 묶임 결과 오염 방지.
    computeMinMax(매매, it => rawNum(it['_dealPrice'] ?? it['매매가'] ?? it['매매일반거래가']), '_매매최고', '_매매최저');
    computeMinMax(전세, it => rawNum(it['전세가'] ?? it['전세일반거래가']), '_전세최고', '_전세최저');
    computeMinMax(월세, it => rawNum(dep(it)), '_보증최고', '_보증최저');
    computeMinMax(월세, it => rawNum(it['월세가']), '_월세최고', '_월세최저');

    // 분양권 프리미엄 min/max (단일은 동일값)
    const premVals = group
      .filter(it => it['_isPresale'] && it['_premiumMin'] != null)
      .map(it => Number(it['_premiumMin']))
      .filter(n => Number.isFinite(n));
    if (premVals.length) {
      merged['_isPresale']  = true;
      merged['_premiumMin'] = Math.min(...premVals);
      merged['_premiumMax'] = Math.max(...premVals);
    }

    out.push(merged);
  }
  return out;
}

export default function ExtractResult({ session, complex, keyword = '', onBack }: Props) {
  const [job, setJob] = useState<JobStatus | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [groupMode, setGroupMode] = useState(true);
  const [exporting, setExporting] = useState<'' | 'xlsx' | 'csv' | 'zip' | 'fsa'>('');
  const [savingPortfolio, setSavingPortfolio] = useState(false);
  const [portfolioMsg, setPortfolioMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const fsaSupported = isFsaSupported();
  const pollRef = useRef<number | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const jobIdRef = useRef<string | null>(null);
  const stateRef = useRef<string>('');

  // Phase 2: job 변화 시 ref 갱신 (페이지 이탈 cleanup 에서 사용)
  useEffect(() => {
    if (job) {
      jobIdRef.current = job.id;
      stateRef.current = job.state;
    }
  }, [job]);

  // Phase 2: 컴포넌트 unmount 시 running/pending 이면 자동 cancel
  useEffect(() => {
    return () => {
      const jid = jobIdRef.current;
      const st  = stateRef.current;
      if (jid && (st === 'running' || st === 'pending')) {
        extractCancel(session, jid).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Phase 2 step 2: 명시적 [취소] 버튼 핸들러
  async function handleCancel() {
    const jid = jobIdRef.current;
    if (!jid || cancelling) return;
    if (!window.confirm('추출을 취소하시겠습니까?')) return;
    setCancelling(true);
    try {
      await extractCancel(session, jid);
    } catch (e) {
      console.log('[extractCancel] error (이미 종료/없음 가능):', e);
    } finally {
      onBack();
    }
  }

  // 주소 기반 간결화 (예: "대전광역시 서구 둔산동" → "서구 둔산동") — 서버 export_name 으로 전달
  const exportName = (() => {
    const cn   = complex.name || '매물';
    const addr = complex.addr_full || complex.addr || '';
    if (!addr) return cn;
    const parts = addr.split(/\s+/);
    const short = parts.length >= 3 ? parts.slice(1, 3).join(' ') : addr;
    return `${cn}_${short}`.trim();
  })();

  // FSA 폴더 구조용 — `{시도}{단지명}` 폴더 + `{단지명}_{날짜시간}.xlsx`
  const fsaSafe = (s: string) => s.replace(/[\\/:*?"<>|\r\n]/g, '_').trim();
  const fsaFolderName = (() => {
    const cn   = complex.name || '매물';
    const addr = complex.addr_full || complex.addr || '';
    const sido = addr.split(/\s+/)[0] || '';
    return fsaSafe(sido + cn);
  })();
  const fsaTimestamp = (() => {
    // Asia/Seoul 기준 YYYY-MM-DD_HHmm (UTC+8 디바이스 -1h 표시 방지)
    const parts = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Seoul',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date());
    const get = (t: string) => parts.find(p => p.type === t)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')}_${get('hour')}${get('minute')}`;
  })();
  const fsaFileName = `${fsaSafe(complex.name || '매물')}_${fsaTimestamp}.xlsx`;

  async function download(kind: 'xlsx' | 'csv' | 'zip') {
    if (!job || !rows.length) return;
    setExporting(kind);
    try {
      const body = { job_id: job.id, group_on: groupMode, export_name: exportName };
      if (kind === 'xlsx')      await exportExcel(session, body);
      else if (kind === 'csv')  await exportCsv(session, body);
      else                      await exportZip(session, body);
    } catch (e) {
      alert(e instanceof ApiError ? `${e.status} · ${e.message}` : String(e));
    } finally {
      setExporting('');
    }
  }

  async function saveToNfindFolder() {
    if (!job || !rows.length) return;
    setExporting('fsa');
    try {
      const root = await getOrPickNfindRoot();
      if (!root) { setExporting(''); return; }
      const body = { job_id: job.id, group_on: groupMode, export_name: exportName };
      const xl = await exportExcelBytes(session, body);
      // {시도}{단지명}/{단지명}_{YYYY-MM-DD_HHmm}.xlsx (서버 발급 파일명 무시)
      await writeFileToPath(root, [fsaFolderName], fsaFileName, xl.bytes);
      alert(`✓ 저장 완료\n${root.name}/${fsaFolderName}/${fsaFileName}`);
    } catch (e) {
      if (isFsaNotFoundError(e)) {
        await forgetNfindRoot();
        alert('저장 폴더를 찾을 수 없습니다. 이전에 선택한 폴더가 삭제·이동되었을 수 있어요.\n버튼을 다시 누르시면 새 폴더 선택 창이 뜹니다.');
      } else {
        alert(e instanceof ApiError
          ? `${e.status} · ${e.message}`
          : `저장 실패: ${e instanceof Error ? e.message : String(e)}`);
      }
    } finally {
      setExporting('');
    }
  }

  async function saveToPortfolio() {
    if (!rows.length) return;
    setSavingPortfolio(true);
    setPortfolioMsg(null);
    try {
      // 매물설명(특징광고내용) 컬럼 제외 — 서버에서도 한번 더 거르지만 페이로드 절감
      const cleaned = rows.map(r => {
        const { 특징광고내용: _drop, ...rest } = r as Record<string, unknown>;
        void _drop;
        return rest;
      });
      const ret = await savePortfolio(session, {
        complex_pk:   String(complex.complex_no || complex.obj_idnfr || ''),
        complex_name: complex.name || '',
        address:      complex.addr_full || complex.addr || '',
        keyword,
        rows: cleaned,
      });
      setPortfolioMsg({
        kind: 'ok',
        text: `내 폴더에 저장됨 · ${ret.stats.total}건 (${(ret.size / 1024).toFixed(1)} KB)`,
      });
    } catch (e) {
      setPortfolioMsg({
        kind: 'err',
        text: e instanceof ApiError ? `${e.status} · ${e.message}` : String(e),
      });
    } finally {
      setSavingPortfolio(false);
      // 토스트 4초 후 자동 사라짐
      window.setTimeout(() => setPortfolioMsg(null), 4000);
    }
  }

  // ── 필터 / 정렬 ─────────────────────────────────────────────
  const [tradeFilter, setTradeFilter] = useState<Set<string>>(new Set());
  const [dongFilter,  setDongFilter]  = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);

  const tradeOptions = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      const t = String(r['매물거래구분명'] ?? '').split('/')[0];
      if (t) s.add(t);
    }
    const order = ['매매', '전세', '월세'];
    return Array.from(s).sort((a, b) =>
      (order.indexOf(a) >= 0 ? order.indexOf(a) : 9) - (order.indexOf(b) >= 0 ? order.indexOf(b) : 9)
    );
  }, [rows]);

  const dongOptions = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      const d = String(r['건물동명'] ?? '').trim();
      if (d) s.add(d);
    }
    return Array.from(s).sort((a, b) => {
      const na = parseInt(a, 10), nb = parseInt(b, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (!tradeFilter.size && !dongFilter.size) return rows;
    return rows.filter(r => {
      if (tradeFilter.size) {
        const t = String(r['매물거래구분명'] ?? '').split('/')[0];
        if (!tradeFilter.has(t)) return false;
      }
      if (dongFilter.size) {
        const d = String(r['건물동명'] ?? '').trim();
        if (!dongFilter.has(d)) return false;
      }
      return true;
    });
  }, [rows, tradeFilter, dongFilter]);

  const groupedRows = useMemo(
    () => (groupMode ? groupRows(filteredRows) : filteredRows),
    [filteredRows, groupMode],
  );

  const displayRows = useMemo(() => {
    if (!sort) return groupedRows;
    const out = [...groupedRows];
    out.sort((a, b) => {
      const av = getSortable(a, sort.key);
      const bv = getSortable(b, sort.key);
      let c: number;
      if (typeof av === 'number' && typeof bv === 'number') c = av - bv;
      else c = String(av).localeCompare(String(bv), 'ko');
      return sort.dir === 'asc' ? c : -c;
    });
    return out;
  }, [groupedRows, sort]);

  const isMobile = useIsMobile();
  const displayCols = useMemo(() => {
    const baseRaw = groupMode ? COLUMNS_GROUPED : COLUMNS;
    const base = baseRaw.filter(c => !c.hidden);
    return isMobile ? toMobileCols(base) : base;
  }, [groupMode, isMobile]);

  function toggleInSet(s: Set<string>, v: string): Set<string> {
    const n = new Set(s);
    if (n.has(v)) n.delete(v); else n.add(v);
    return n;
  }
  function onHeaderClick(key: string) {
    setSort(prev => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null;   // 세 번째 클릭 → 정렬 해제
    });
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await startExtract(session, complex, keyword);
        if (cancelled) return;
        poll(r.job_id);
      } catch (e) {
        if (cancelled) return;
        setErr(e instanceof ApiError ? `${e.status} · ${e.message}` : String(e));
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
      if (pollRef.current) window.clearTimeout(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function poll(jobId: string, transientFails = 0) {
    try {
      const r = await getExtractStatus(session, jobId, false);
      if (r.job.state === 'done') {
        // 결과를 받기 전엔 state 를 'done' 으로 반영하지 않음
        // (running=false + rows=[] 순간에 empty-state 가 깜빡이는 현상 방지)
        const full = await getExtractStatus(session, jobId, true);
        const result = (full.job.result ?? []) as Row[];
        setRows(result);
        setJob(full.job);
        setLoaded(true);
        return;
      }
      setJob(r.job);
      if (r.job.state === 'error' || r.job.state === 'blocked' || r.job.state === 'cancelled') {
        // 'blocked' 는 차단 게이트 자동 abort. 모달은 api.ts setBlockGateHandler 가 자동 노출.
        setErr(r.job.error === 'block_gate'
          ? (r.job.msg || '부동산광고시스템(타사) 오류발생 잠시 후 재시도 해주세요.')
          : (r.job.error || r.job.msg || '추출 실패'));
        setLoaded(true);
        return;
      }
      pollRef.current = window.setTimeout(() => poll(jobId, 0), 1200);
    } catch (e) {
      // ApiError (서버 4xx/5xx) 는 즉시 실패. 네트워크 에러 (iOS Safari 백그라운드
      // 전환, 일시적 cloudflare hiccup 등) 는 backoff 재시도 — 작업은 백그라운드에서
      // 계속 돌고 있으므로 폴링만 회복하면 결과 받을 수 있음.
      if (e instanceof ApiError) {
        setErr(`${e.status} · ${e.message}`);
        setLoaded(true);
        return;
      }
      const next = transientFails + 1;
      if (next >= 8) {
        setErr(`통신 오류 — 네트워크 확인 후 새로고침 (${String(e)})`);
        setLoaded(true);
        return;
      }
      const delay = Math.min(1000 * Math.pow(1.6, next), 8000);
      pollRef.current = window.setTimeout(() => poll(jobId, next), delay);
    }
  }

  const pct = job?.pct ?? 0;
  const running = job?.state === 'running' || job?.state === 'pending';

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <button
            onClick={onBack}
            className="text-sm text-[color:var(--color-muted)] hover:text-[color:var(--color-brand)] mb-2"
          >
            ← 검색으로
          </button>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight truncate">
            {complex.name}
          </h1>
          <div className="text-sm text-[color:var(--color-muted)] truncate">
            {complex.addr_full || complex.addr}
          </div>
        </div>
      </div>

      {err && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm">
          {err}
        </div>
      )}

      {portfolioMsg && (
        <div className={
          'mb-4 p-3 rounded-lg border text-sm ' +
          (portfolioMsg.kind === 'ok'
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800')
        }>
          {portfolioMsg.kind === 'ok' ? '✓ ' : '⚠ '}{portfolioMsg.text}
        </div>
      )}

      {running && (
        <div className="mb-6 p-5 rounded-xl bg-[color:var(--color-bg-soft)] border border-[color:var(--color-border)]">
          <div className="flex items-center justify-between mb-3 gap-3">
            <div className="font-semibold flex-1 min-w-0 truncate">{job?.msg || '준비 중...'}</div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="font-mono text-sm">{pct}%</div>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="px-3 py-1 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 text-xs font-semibold disabled:opacity-50"
              >
                {cancelling ? '취소 중...' : '✕ 취소'}
              </button>
            </div>
          </div>
          <div className="h-2 rounded-full bg-[color:var(--color-border)] overflow-hidden">
            <div
              className="h-full bg-[color:var(--color-brand)] transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div>
          {/* 필터: 거래 + 동 */}
          <div className="mb-3 space-y-2">
            {tradeOptions.length > 1 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-[color:var(--color-muted)] mr-1">거래</span>
                <ChipBtn active={tradeFilter.size === 0} onClick={() => setTradeFilter(new Set())}>전체</ChipBtn>
                {tradeOptions.map(t => (
                  <ChipBtn key={t} active={tradeFilter.has(t)}
                           onClick={() => setTradeFilter(s => toggleInSet(s, t))}>{t}</ChipBtn>
                ))}
              </div>
            )}
            {dongOptions.length > 1 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-[color:var(--color-muted)] mr-1">동</span>
                <ChipBtn active={dongFilter.size === 0} onClick={() => setDongFilter(new Set())}>전체</ChipBtn>
                {dongOptions.map(d => (
                  <ChipBtn key={d} active={dongFilter.has(d)}
                           onClick={() => setDongFilter(s => toggleInSet(s, d))}>{d}</ChipBtn>
                ))}
              </div>
            )}
          </div>

          <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-[color:var(--color-muted)]">
              총 <span className="font-bold text-[color:var(--color-ink)]">{rows.length}</span>건
              {(tradeFilter.size || dongFilter.size) ? (
                <> · 필터 <span className="font-bold text-[color:var(--color-ink)]">{filteredRows.length}</span>건</>
              ) : null}
              {groupMode && (
                <> → <span className="font-bold text-[color:var(--color-ink)]">{displayRows.length}</span>묶음</>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setGroupMode(v => !v)}
                className={
                  'h-9 px-3 rounded-lg text-sm font-semibold border transition ' +
                  (groupMode
                    ? 'bg-[color:var(--color-brand)] text-white border-[color:var(--color-brand)] hover:bg-[color:var(--color-brand-dark)]'
                    : 'bg-white text-[color:var(--color-ink)] border-[color:var(--color-border)] hover:bg-[color:var(--color-bg-soft)]')
                }
                title="같은 동·호·거래인 매물을 하나로 묶고 최고/최저가 표시"
              >
                {groupMode ? '묶기 해제' : '동일매물 묶기'}
              </button>
              <div className="w-px h-6 bg-[color:var(--color-border)]" />
              <div className="relative group">
                <button
                  onClick={saveToPortfolio}
                  disabled={savingPortfolio || !rows.length}
                  className="h-9 px-3 rounded-lg text-sm font-semibold border border-[color:var(--color-brand)] bg-[color:var(--color-brand)] text-white hover:bg-[color:var(--color-brand-dark)] disabled:opacity-50"
                >
                  {savingPortfolio ? '저장 중...' : '💾 내 폴더에 저장'}
                </button>
                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-30 w-72
                                px-3 py-2 rounded-lg bg-gray-900 text-white text-xs leading-relaxed
                                shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible
                                transition pointer-events-none">
                  <div className="font-semibold mb-1">☁️ 클라우드 저장 (Nfind 서버)</div>
                  <div className="text-gray-200">
                    현재 검색 결과를 Nfind 서버에 보관합니다.
                    <br />• 6개월 보관 — 시점별 비교 가능
                    <br />• 다른 기기·브라우저에서도 접근
                    <br />• PWA 의 '내 폴더' 탭에서 열람
                  </div>
                </div>
              </div>
              {fsaSupported && (
                <div className="relative group">
                  <button
                    onClick={saveToNfindFolder}
                    disabled={!!exporting}
                    className="h-9 px-3 rounded-lg text-sm font-semibold border border-[color:var(--color-brand)] bg-[color:var(--color-brand-soft)] text-[color:var(--color-brand)] hover:brightness-95 disabled:opacity-50"
                  >
                    {exporting === 'fsa' ? '저장 중...' : '📁 Nfind 폴더에 저장'}
                  </button>
                  <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-30 w-72
                                  px-3 py-2 rounded-lg bg-gray-900 text-white text-xs leading-relaxed
                                  shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible
                                  transition pointer-events-none">
                    <div className="font-semibold mb-1">💻 이 컴퓨터의 Nfind 폴더에 저장</div>
                    <div className="text-gray-200">
                      엑셀 파일을 자동으로 단지별 폴더에 분류 저장합니다.
                      <br />• 경로 — <span className="font-mono">문서/Nfind/{'{시도}{단지명}'}/{'{단지명}_{날짜시간}'}.xlsx</span>
                      <br />• 첫 1회 폴더 선택 후 영구 기억
                      <br />• 같은 단지 재추출 시 자동으로 같은 폴더에 누적
                      <br />• Chrome / Edge 에서만 지원
                    </div>
                  </div>
                </div>
              )}
              <button
                onClick={() => download('xlsx')}
                disabled={!!exporting}
                className="h-9 px-3 rounded-lg text-sm font-semibold border border-[color:var(--color-border)] bg-white hover:bg-[color:var(--color-bg-soft)] disabled:opacity-50"
                title="Excel 파일 다운로드"
              >
                {exporting === 'xlsx' ? '생성 중...' : '📊 Excel'}
              </button>
              <button
                onClick={() => download('csv')}
                disabled={!!exporting}
                className="h-9 px-3 rounded-lg text-sm font-semibold border border-[color:var(--color-border)] bg-white hover:bg-[color:var(--color-bg-soft)] disabled:opacity-50"
                title="CSV 파일 다운로드 (UTF-8 BOM, Excel 한글 호환)"
              >
                {exporting === 'csv' ? '생성 중...' : '📄 CSV'}
              </button>
            </div>
          </div>
          <div className="overflow-auto rounded-xl border border-[color:var(--color-border)] bg-white max-h-[calc(100vh-220px)]">
            <table className="text-[13px] border-collapse" style={{ minWidth: '100%' }}>
              <thead className="bg-[color:var(--color-bg-soft)] border-b border-[color:var(--color-border)] sticky top-0 z-[2]">
                <tr>
                  {displayCols.map((c, i) => {
                    const off = frozenOffset(displayCols, i);
                    const lastFr = isLastFrozen(displayCols, i);
                    const active = sort?.key === c.key;
                    const arrow = active ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '';
                    return (
                      <th
                        key={c.key}
                        onClick={() => onHeaderClick(c.key)}
                        className={
                          'px-2.5 py-2 text-left font-semibold whitespace-nowrap bg-[color:var(--color-bg-soft)] cursor-pointer select-none hover:bg-[color:var(--color-brand-soft)]/50 ' +
                          (c.frozen ? 'sticky z-[3] ' : '') +
                          (lastFr ? 'border-r border-[color:var(--color-border-strong)] shadow-[2px_0_0_0_rgba(0,0,0,0.03)] ' : '') +
                          (active ? 'text-[color:var(--color-brand)]' : '')
                        }
                        style={{
                          minWidth: c.w, maxWidth: c.wrap ? c.w : undefined,
                          left: off ?? undefined,
                        }}
                        title={active ? `${sort!.dir === 'asc' ? '오름' : '내림'}차순 (다시 누르면 해제)` : '정렬'}
                      >
                        {c.label}{arrow}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row, i) => {
                  const trade = String(row['매물거래구분명'] ?? '').split('/')[0];
                  const rowBg = TRADE_BG[trade] ?? 'bg-white';
                  const grouped = Boolean(row['_grouped']);
                  return (
                    <tr
                      key={i}
                      className={`border-b border-[color:var(--color-border)] last:border-b-0 ${rowBg} hover:brightness-97${grouped ? ' font-medium' : ''}`}
                    >
                      {displayCols.map((c, j) => {
                        const v = cellValue(row, c);
                        const off = frozenOffset(displayCols, j);
                        const lastFr = isLastFrozen(displayCols, j);
                        return (
                          <td
                            key={c.key}
                            className={
                              'px-2.5 py-1.5 ' +
                              (c.wrap ? 'whitespace-normal break-words ' : 'whitespace-nowrap ') +
                              (c.frozen ? `sticky z-[1] ${rowBg} ` : '') +
                              (lastFr ? 'border-r border-[color:var(--color-border-strong)] shadow-[2px_0_0_0_rgba(0,0,0,0.03)]' : '')
                            }
                            style={{
                              maxWidth: c.wrap ? c.w : undefined,
                              left: off ?? undefined,
                            }}
                            title={c.wrap && v.length > 40 ? v : undefined}
                          >
                            {c.key === '중개업소전화번호' && v
                              ? v.split(', ').map((p, k, arr) => {
                                  const digits = p.replace(/[^0-9]/g, '');
                                  return (
                                    <span key={k}>
                                      {digits ? <a href={`tel:${digits}`} className="text-blue-700 hover:underline">{p}</a> : p}
                                      {k < arr.length - 1 ? ', ' : ''}
                                    </span>
                                  );
                                })
                              : v}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {loaded && rows.length === 0 && !err && (
        <div className="text-center py-12 text-[color:var(--color-muted)]">
          추출된 매물이 없습니다.
        </div>
      )}
    </div>
  );
}

export function ChipBtn({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'h-7 px-2.5 rounded-full text-xs font-semibold border transition ' +
        (active
          ? 'bg-[color:var(--color-brand)] text-white border-[color:var(--color-brand)]'
          : 'bg-white text-[color:var(--color-ink)] border-[color:var(--color-border)] hover:bg-[color:var(--color-bg-soft)]')
      }
    >
      {children}
    </button>
  );
}
