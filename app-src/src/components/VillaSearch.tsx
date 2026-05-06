import { useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  villaAutocomplete, villaSearch,
  type VillaAutocompleteItem, type VillaSearchItem, ApiError,
} from '../lib/api';

interface Props { session: Session | null; }

const BUILDING_TYPES: { label: string; code: string }[] = [
  { label: '빌라/다세대/연립', code: 'A05-A06-A07-C02' },
  { label: '단독/다가구',     code: 'C03' },
];

const TRADE_TYPES: { label: string; code: string }[] = [
  { label: '전체',     code: 'A1:B1:B2' },
  { label: '매매',     code: 'A1' },
  { label: '전세',     code: 'B1' },
  { label: '월세',     code: 'B2' },
  { label: '단기',     code: 'B3' },
  { label: '매매전세', code: 'A1:B1' },
  { label: '전세월세', code: 'B1:B2' },
];

export default function VillaSearch({ session }: Props) {
  const [keyword, setKeyword]     = useState('');
  const [autoBusy, setAutoBusy]   = useState(false);
  const [autoErr, setAutoErr]     = useState('');
  const [cands, setCands]         = useState<VillaAutocompleteItem[]>([]);
  const [chosen, setChosen]       = useState<VillaAutocompleteItem | null>(null);

  const [bdType, setBdType]       = useState(BUILDING_TYPES[0].code);
  const [trade, setTrade]         = useState(TRADE_TYPES[0].code);

  const [searchBusy, setSearchBusy] = useState(false);
  const [searchErr, setSearchErr]   = useState('');
  const [items, setItems]           = useState<VillaSearchItem[]>([]);
  const [stats, setStats]           = useState<{ list: number; detail: number; truncated?: boolean; elapsed?: number } | null>(null);

  async function onAutocomplete(e: React.FormEvent) {
    e.preventDefault();
    const kw = keyword.trim();
    if (!kw) return;
    setAutoBusy(true); setAutoErr(''); setCands([]); setChosen(null);
    setItems([]); setStats(null); setSearchErr('');
    try {
      const r = await villaAutocomplete(session, kw);
      setCands(r.items);
      if (r.items.length === 0) {
        setAutoErr('해당 주소의 법정동 후보를 찾지 못했습니다');
      } else if (r.items.length === 1) {
        setChosen(r.items[0]);
      }
    } catch (e) {
      setAutoErr(e instanceof ApiError ? `${e.status} · ${e.message}` : String(e));
    } finally {
      setAutoBusy(false);
    }
  }

  async function onSearch() {
    if (!chosen) return;
    setSearchBusy(true); setSearchErr(''); setItems([]); setStats(null);
    try {
      const r = await villaSearch(session, {
        cortar_no:        chosen.legalDivisionNumber,
        real_estate_type: bdType,
        trade_type:       trade,
        max_pages:        50,    // 충분히 — 보통 동 단위는 3~10 페이지
        fetch_detail:     true,
        detail_limit:     200,   // 단건 detail 호출 cap (안전장치)
      });
      setItems(r.items);
      setStats({
        list:      r.list_count,
        detail:    r.detail_count,
        truncated: r.truncated,
        elapsed:   r.elapsed_sec,
      });
      if (r.items.length === 0) setSearchErr('검색 결과 없음');
    } catch (e) {
      setSearchErr(e instanceof ApiError ? `${e.status} · ${e.message}` : String(e));
    } finally {
      setSearchBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* 주소 입력 */}
      <form onSubmit={onAutocomplete} className="flex flex-wrap gap-2 items-stretch">
        <input
          type="text"
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          placeholder="법정동 입력 (예: 분당구 야탑동)"
          className="flex-1 min-w-[200px] h-10 px-3 rounded-lg border border-[color:var(--color-border)] text-sm"
          disabled={autoBusy}
        />
        <button
          type="submit"
          disabled={autoBusy || !keyword.trim()}
          className="h-10 px-4 rounded-lg bg-[color:var(--color-brand)] text-white text-sm font-semibold disabled:opacity-50"
        >
          {autoBusy ? '검색 중...' : '주소 찾기'}
        </button>
      </form>
      {autoErr && <div className="text-sm text-red-600">{autoErr}</div>}

      {/* 자동완성 후보 */}
      {cands.length > 1 && !chosen && (
        <div className="border border-[color:var(--color-border)] rounded-lg p-3 space-y-1">
          <div className="text-xs text-[color:var(--color-muted)] mb-1">법정동 후보 선택:</div>
          {cands.map(c => (
            <button
              key={c.legalDivisionNumber}
              onClick={() => setChosen(c)}
              className="block w-full text-left px-3 py-2 rounded hover:bg-[color:var(--color-bg-soft)] text-sm"
            >
              <span className="font-mono text-[color:var(--color-muted)] mr-2">{c.legalDivisionNumber}</span>
              {c.name}
              {c.level && <span className="ml-2 text-xs text-[color:var(--color-muted)]">[{c.level}]</span>}
            </button>
          ))}
        </div>
      )}

      {/* 선택된 cortar 표시 */}
      {chosen && (
        <div className="bg-[color:var(--color-bg-soft)] border border-[color:var(--color-border)] rounded-lg p-3 space-y-3">
          <div className="text-sm">
            <span className="text-[color:var(--color-muted)] mr-2">선택됨:</span>
            <span className="font-semibold">{chosen.name}</span>
            <span className="ml-2 font-mono text-xs text-[color:var(--color-muted)]">
              cortarNo={chosen.legalDivisionNumber}
            </span>
            <button
              onClick={() => { setChosen(null); setItems([]); setStats(null); }}
              className="ml-2 text-xs text-[color:var(--color-muted)] underline"
            >변경</button>
          </div>

          <div className="flex flex-wrap gap-3 text-sm">
            <label className="flex items-center gap-2">
              <span className="text-[color:var(--color-muted)]">건물유형:</span>
              <select value={bdType} onChange={e => setBdType(e.target.value)}
                      className="h-8 px-2 rounded border border-[color:var(--color-border)] text-sm">
                {BUILDING_TYPES.map(b => <option key={b.code} value={b.code}>{b.label}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className="text-[color:var(--color-muted)]">거래유형:</span>
              <select value={trade} onChange={e => setTrade(e.target.value)}
                      className="h-8 px-2 rounded border border-[color:var(--color-border)] text-sm">
                {TRADE_TYPES.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
              </select>
            </label>
            <button
              onClick={onSearch}
              disabled={searchBusy}
              className="h-8 px-4 rounded-lg bg-[color:var(--color-brand)] text-white text-sm font-semibold disabled:opacity-50"
            >
              {searchBusy ? '검색 중...' : '매물 검색'}
            </button>
          </div>
        </div>
      )}

      {searchErr && <div className="text-sm text-red-600">{searchErr}</div>}

      {/* 결과 통계 */}
      {stats && (
        <div className="text-sm text-[color:var(--color-muted)]">
          전체 {stats.list}건 / detail {stats.detail}건
          {stats.truncated && <span className="text-amber-600 ml-2">(detail_limit 초과 — 일부만 상세 로드)</span>}
          {stats.elapsed != null && <span className="ml-2">({stats.elapsed}s)</span>}
        </div>
      )}

      {/* 결과 표 */}
      {items.length > 0 && (
        <div className="overflow-x-auto border border-[color:var(--color-border)] rounded-lg">
          <table className="min-w-full text-sm">
            <thead className="bg-[color:var(--color-bg-soft)]">
              <tr>
                <Th>매물번호</Th>
                <Th>거래</Th>
                <Th>매물명/건물명</Th>
                <Th>층</Th>
                <Th>면적(㎡)</Th>
                <Th>방향</Th>
                <Th>가격(거래/월세)</Th>
                <Th>중개</Th>
                <Th>등록일</Th>
                <Th>특징</Th>
              </tr>
            </thead>
            <tbody>
              {items.map(it => {
                const name = (it.articleName as string) || (it.bldNm as string) || '';
                const floor = (it.totalFloorCount && it.correspondingFloorCount)
                  ? `${it.correspondingFloorCount}/${it.totalFloorCount}`
                  : (it.floorInfo || '');
                const area = it.exclusiveSpace || it.supplySpace || it.area1 || '';
                const direction = (it.directionTypeName as string) || (it.direction as string) || '';
                const deal = it.dealOrWarrantPrc || it.dealPrice || it.warrantPrice || 0;
                const rent = it.rentPrice || it.rentPrc || 0;
                const cpUrl = it.cpPcArticleUrl as string | undefined;
                return (
                  <tr key={it.articleNo} className="border-t border-[color:var(--color-border)] hover:bg-[color:var(--color-bg-soft)]">
                    <Td>
                      {cpUrl ? (
                        <a href={cpUrl} target="_blank" rel="noopener noreferrer"
                           className="text-blue-600 underline">{it.articleNo}</a>
                      ) : it.articleNo}
                    </Td>
                    <Td>{it.tradeTypeName || ''}</Td>
                    <Td className="max-w-[180px] truncate" title={String(name)}>{String(name)}</Td>
                    <Td>{String(floor)}</Td>
                    <Td>{typeof area === 'number' ? area.toFixed(1) : area}</Td>
                    <Td>{String(direction)}</Td>
                    <Td className="whitespace-nowrap">
                      {Number(deal) > 0 && Number(rent) > 0
                        ? `${deal} / ${rent}`
                        : Number(deal) > 0 ? String(deal)
                        : Number(rent) > 0 ? String(rent) : ''}
                    </Td>
                    <Td className="max-w-[130px] truncate" title={String(it.realtorName || '')}>{String(it.realtorName || '')}</Td>
                    <Td>{it.articleConfirmYmd || ''}</Td>
                    <Td className="max-w-[200px] truncate" title={String(it.articleFeatureDesc || '')}>
                      {String(it.articleFeatureDesc || '')}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left text-xs font-semibold text-[color:var(--color-muted)] whitespace-nowrap">{children}</th>;
}
function Td({ children, className = '', title }: { children: React.ReactNode; className?: string; title?: string }) {
  return <td className={`px-3 py-2 ${className}`} title={title}>{children}</td>;
}
