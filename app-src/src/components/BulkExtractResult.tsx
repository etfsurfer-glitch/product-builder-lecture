import { useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  getExtractStatus, exportExcel, exportCsv, exportZip,
  exportExcelBytes,
  type BulkExtractJob, ApiError,
} from '../lib/api';
import { isFsaSupported, getOrPickNfindRoot, writeFileToPath } from '../lib/fsaccess';
import {
  COLUMNS, COLUMNS_GROUPED, TRADE_BG_EXPORT, cellValue, groupRows,
  frozenOffset, isLastFrozen, toMobileCols, useIsMobile,
  type Row, type Col,
} from './ExtractResult';

interface Props {
  session: Session | null;
  jobs:    BulkExtractJob[];   // complex_no + job_id + name
  onBack:  () => void;
}

type JobState = {
  complex_no: string;
  name:       string;
  addr_full?: string;
  job_id:     string | null;
  status:     'pending' | 'running' | 'done' | 'error';
  pct:        number;
  msg:        string;
  rows:       Row[];
  err?:       string;
};

function initialState(jobs: BulkExtractJob[]): JobState[] {
  return jobs.map(j => ({
    complex_no: j.complex_no,
    name:       j.name || j.complex_no,
    addr_full:  j.addr_full,
    job_id:     j.job_id,
    status:     j.job_id ? 'pending' : 'error',
    pct:        0,
    msg:        j.error || (j.job_id ? '대기 중' : '시작 실패'),
    rows:       [],
    err:        j.error,
  }));
}

export default function BulkExtractResult({ session, jobs, onBack }: Props) {
  const [states, setStates] = useState<JobState[]>(() => initialState(jobs));
  const [groupMode, setGroupMode] = useState(true);
  const [exporting, setExporting] = useState<'' | 'xlsx' | 'csv' | 'zip' | 'fsa'>('');
  const fsaSupported = isFsaSupported();
  const timersRef = useRef<Map<string, number>>(new Map());

  function buildExportName(): string {
    const names = states.filter(s => s.status === 'done').map(s => s.name);
    return names.length > 1
      ? `${names[0]} 외 ${names.length - 1}단지`
      : (names[0] || '관심단지');
  }

  async function download(kind: 'xlsx' | 'csv' | 'zip') {
    const doneIds = states.filter(s => s.status === 'done' && s.job_id).map(s => s.job_id!);
    if (!doneIds.length) { alert('완료된 추출 결과가 없습니다'); return; }
    const exportName = buildExportName();
    setExporting(kind);
    try {
      const body = { job_ids: doneIds, group_on: groupMode, export_name: exportName };
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
    const doneIds = states.filter(s => s.status === 'done' && s.job_id).map(s => s.job_id!);
    if (!doneIds.length) { alert('완료된 추출 결과가 없습니다'); return; }
    const exportName = buildExportName();
    setExporting('fsa');
    try {
      const root = await getOrPickNfindRoot();
      if (!root) { setExporting(''); return; }
      const body = { job_ids: doneIds, group_on: groupMode, export_name: exportName };
      const xl = await exportExcelBytes(session, body);
      await writeFileToPath(root, ['매물엑셀파일', exportName], xl.filename, xl.bytes);
      alert(`✓ 저장 완료\n${root.name}/매물엑셀파일/${exportName}/${xl.filename}`);
    } catch (e) {
      alert(e instanceof ApiError
        ? `${e.status} · ${e.message}`
        : `저장 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting('');
    }
  }

  const isMobile = useIsMobile();
  const displayCols: Col[] = useMemo(() => {
    const base = groupMode ? COLUMNS_GROUPED : COLUMNS;
    return isMobile ? toMobileCols(base) : base;
  }, [groupMode, isMobile]);

  // 모든 완료된 job 의 row 를 병합 + 단지별 구분
  const mergedRows: Row[] = useMemo(() => {
    const all: Row[] = [];
    for (const s of states) {
      if (s.status !== 'done') continue;
      // 각 row 에 단지명이 이미 들어있지만, 혹시 비어있으면 job 이름으로 채움
      for (const r of s.rows) {
        const copy: Row = { ...r };
        if (!copy['단지명']) copy['단지명'] = s.name;
        all.push(copy);
      }
    }
    return groupMode ? groupRows(all) : all;
  }, [states, groupMode]);

  const totalRaw = states.reduce((acc, s) => acc + (s.status === 'done' ? s.rows.length : 0), 0);
  const doneCnt = states.filter(s => s.status === 'done').length;
  const anyRunning = states.some(s => s.status === 'pending' || s.status === 'running');

  // job 별 폴링
  useEffect(() => {
    let cancelled = false;

    async function poll(s: JobState) {
      if (!s.job_id || cancelled) return;
      try {
        const r = await getExtractStatus(session, s.job_id, false);
        if (cancelled) return;
        if (r.job.state === 'done') {
          const full = await getExtractStatus(session, s.job_id, true);
          if (cancelled) return;
          setStates(prev => prev.map(p => p.complex_no === s.complex_no
            ? { ...p, status: 'done', pct: 100, msg: '완료',
                rows: (full.job.result ?? []) as Row[] }
            : p));
          return;
        }
        if (r.job.state === 'error') {
          setStates(prev => prev.map(p => p.complex_no === s.complex_no
            ? { ...p, status: 'error', err: r.job.error || '실패', msg: '실패' }
            : p));
          return;
        }
        setStates(prev => prev.map(p => p.complex_no === s.complex_no
          ? { ...p, status: 'running', pct: r.job.pct ?? 0, msg: r.job.msg || '진행 중' }
          : p));
        const t = window.setTimeout(() => poll(s), 1500);
        timersRef.current.set(s.complex_no, t);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof ApiError ? `${e.status} · ${e.message}` : String(e);
        setStates(prev => prev.map(p => p.complex_no === s.complex_no
          ? { ...p, status: 'error', err: msg, msg: '통신 오류' }
          : p));
      }
    }

    for (const s of states) {
      if (s.status === 'pending' && s.job_id) {
        poll(s);
      }
    }
    return () => {
      cancelled = true;
      timersRef.current.forEach(id => window.clearTimeout(id));
      timersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overallPct = states.length
    ? Math.round(states.reduce((a, s) =>
        a + (s.status === 'done' ? 100 : s.status === 'error' ? 100 : s.pct), 0) / states.length)
    : 0;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <button
            onClick={onBack}
            className="text-sm text-[color:var(--color-muted)] hover:text-[color:var(--color-brand)] mb-2"
          >
            ← 돌아가기
          </button>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            관심단지 일괄 추출
          </h1>
          <div className="text-sm text-[color:var(--color-muted)]">
            {states.length}개 단지 · 완료 {doneCnt}/{states.length}
          </div>
        </div>
      </div>

      {/* 전체 진행바 */}
      {anyRunning && (
        <div className="mb-4 p-4 rounded-xl bg-[color:var(--color-bg-soft)] border border-[color:var(--color-border)]">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold text-sm">전체 진행</div>
            <div className="font-mono text-sm">{overallPct}%</div>
          </div>
          <div className="h-2 rounded-full bg-[color:var(--color-border)] overflow-hidden">
            <div className="h-full bg-[color:var(--color-brand)] transition-[width] duration-300"
                 style={{ width: `${overallPct}%` }} />
          </div>
        </div>
      )}

      {/* 단지별 상태 요약 */}
      <div className="mb-6 rounded-xl border border-[color:var(--color-border)] bg-white overflow-hidden">
        <div className="divide-y divide-[color:var(--color-border)]">
          {states.map(s => (
            <div key={s.complex_no} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0">
                <div className="font-semibold truncate">{s.name}</div>
                {s.addr_full && (
                  <div className="text-xs text-[color:var(--color-muted)] truncate">{s.addr_full}</div>
                )}
              </div>
              <div className="shrink-0 flex items-center gap-3">
                {s.status === 'done' && (
                  <span className="text-xs text-green-700 font-semibold">✓ {s.rows.length}건</span>
                )}
                {s.status === 'error' && (
                  <span className="text-xs text-red-700 font-semibold" title={s.err || ''}>✕ {s.msg}</span>
                )}
                {(s.status === 'pending' || s.status === 'running') && (
                  <span className="text-xs text-[color:var(--color-muted)]">{s.msg} {s.pct}%</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {mergedRows.length > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-[color:var(--color-muted)]">
              총 <span className="font-bold text-[color:var(--color-ink)]">{totalRaw}</span>건
              {groupMode && (
                <> → <span className="font-bold text-[color:var(--color-ink)]">{mergedRows.length}</span>묶음</>
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
              >
                {groupMode ? '묶기 해제' : '동일매물 묶기'}
              </button>
              <div className="w-px h-6 bg-[color:var(--color-border)]" />
              {fsaSupported && (
                <button onClick={saveToNfindFolder} disabled={!!exporting || doneCnt === 0}
                        className="h-9 px-3 rounded-lg text-sm font-semibold border border-[color:var(--color-brand)] bg-[color:var(--color-brand-soft)] text-[color:var(--color-brand)] hover:brightness-95 disabled:opacity-50"
                        title="Nfind/매물엑셀파일/단지명/ 에 직접 저장">
                  {exporting === 'fsa' ? '저장 중...' : '📁 Nfind 폴더에 저장'}
                </button>
              )}
              <button onClick={() => download('xlsx')} disabled={!!exporting || doneCnt === 0}
                      className="h-9 px-3 rounded-lg text-sm font-semibold border border-[color:var(--color-border)] bg-white hover:bg-[color:var(--color-bg-soft)] disabled:opacity-50"
                      title="Excel — '전체' 시트 + 단지별 시트">
                {exporting === 'xlsx' ? '생성 중...' : '📊 Excel'}
              </button>
              <button onClick={() => download('csv')} disabled={!!exporting || doneCnt === 0}
                      className="h-9 px-3 rounded-lg text-sm font-semibold border border-[color:var(--color-border)] bg-white hover:bg-[color:var(--color-bg-soft)] disabled:opacity-50"
                      title="CSV (UTF-8 BOM)">
                {exporting === 'csv' ? '생성 중...' : '📄 CSV'}
              </button>
              <button onClick={() => download('zip')} disabled={!!exporting || doneCnt === 0}
                      className="h-9 px-3 rounded-lg text-sm font-semibold border border-[color:var(--color-border)] bg-white hover:bg-[color:var(--color-bg-soft)] disabled:opacity-50"
                      title="Excel+CSV 를 ZIP (매물엑셀파일/단지명/ 폴더 구조)">
                {exporting === 'zip' ? '생성 중...' : '📦 ZIP (폴더구조)'}
              </button>
            </div>
          </div>
          <div className="overflow-auto rounded-xl border border-[color:var(--color-border)] bg-white max-h-[calc(100vh-260px)]">
            <table className="text-[13px] border-collapse" style={{ minWidth: '100%' }}>
              <thead className="bg-[color:var(--color-bg-soft)] border-b border-[color:var(--color-border)] sticky top-0 z-[2]">
                <tr>
                  {displayCols.map((c, i) => {
                    const off = frozenOffset(displayCols, i);
                    const lastFr = isLastFrozen(displayCols, i);
                    return (
                      <th key={c.key}
                          className={
                            'px-2.5 py-2 text-left font-semibold whitespace-nowrap bg-[color:var(--color-bg-soft)] ' +
                            (c.frozen ? 'sticky z-[3] ' : '') +
                            (lastFr ? 'border-r border-[color:var(--color-border-strong)]' : '')
                          }
                          style={{ minWidth: c.w, maxWidth: c.wrap ? c.w : undefined,
                                   left: off ?? undefined }}>
                        {c.label}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {mergedRows.map((row, i) => {
                  const trade = String(row['매물거래구분명'] ?? '').split('/')[0];
                  const rowBg = (TRADE_BG_EXPORT as Record<string, string>)[trade] ?? 'bg-white';
                  const grouped = Boolean(row['_grouped']);
                  return (
                    <tr key={i}
                        className={`border-b border-[color:var(--color-border)] last:border-b-0 ${rowBg} hover:brightness-97${grouped ? ' font-medium' : ''}`}>
                      {displayCols.map((c, j) => {
                        const v = cellValue(row, c);
                        const off = frozenOffset(displayCols, j);
                        const lastFr = isLastFrozen(displayCols, j);
                        return (
                          <td key={c.key}
                              className={
                                'px-2.5 py-1.5 ' +
                                (c.wrap ? 'whitespace-normal break-words ' : 'whitespace-nowrap ') +
                                (c.frozen ? `sticky z-[1] ${rowBg} ` : '') +
                                (lastFr ? 'border-r border-[color:var(--color-border-strong)]' : '')
                              }
                              style={{ maxWidth: c.wrap ? c.w : undefined,
                                       left: off ?? undefined }}
                              title={c.wrap && v.length > 40 ? v : undefined}>
                            {v}
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

      {!anyRunning && mergedRows.length === 0 && (
        <div className="text-center py-12 text-[color:var(--color-muted)]">
          추출된 매물이 없습니다.
        </div>
      )}
    </div>
  );
}
