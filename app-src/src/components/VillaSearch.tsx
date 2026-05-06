import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  villaAutocomplete, villaSearch, villaArticleDetail,
  type VillaAutocompleteItem, type VillaSearchItem, ApiError,
} from '../lib/api';

// Leaflet default marker icon URL fix (Vite 빌드 환경에서 깨지는 이슈 회피)
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: () => string })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface Props { session: Session | null; }

// 검증된 Naver realEstateType 코드 (2026-05-07): VL=빌라, YR=연립, DDDGG=다세대,
// DDDGN=단독, DGN=다가구. VBA 의 A05-A06-A07-C02 는 부정확 (상가/사무실 섞임).
const BUILDING_TYPES: { label: string; code: string }[] = [
  { label: '빌라/다세대/연립', code: 'VL:YR:DDDGG' },
  { label: '빌라만',          code: 'VL' },
  { label: '단독/다가구',     code: 'DDDGN:DGN' },
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

type SubTab = 'area' | 'article';

export default function VillaSearch({ session }: Props) {
  const [subTab, setSubTab] = useState<SubTab>('area');

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-[color:var(--color-border)]">
        <SubTabBtn active={subTab === 'area'}    onClick={() => setSubTab('area')}>동별 검색</SubTabBtn>
        <SubTabBtn active={subTab === 'article'} onClick={() => setSubTab('article')}>매물번호 조회</SubTabBtn>
      </div>
      {subTab === 'area'    && <AreaSearch session={session} />}
      {subTab === 'article' && <ArticleByNo session={session} />}
    </div>
  );
}

function SubTabBtn({ active, onClick, children }:
  { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={
        'px-4 py-2 text-sm font-semibold border-b-2 transition ' +
        (active
          ? 'border-[color:var(--color-brand)] text-[color:var(--color-brand)]'
          : 'border-transparent text-[color:var(--color-muted)] hover:text-[color:var(--color-ink)]')
      }
    >
      {children}
    </button>
  );
}

// ── 동별 검색 ─────────────────────────────────────────────────────────────
function AreaSearch({ session }: { session: Session | null }) {
  const [keyword, setKeyword]     = useState('');
  const [autoBusy, setAutoBusy]   = useState(false);
  const [autoErr, setAutoErr]     = useState('');
  const [cands, setCands]         = useState<VillaAutocompleteItem[]>([]);
  const [chosen, setChosen]       = useState<VillaAutocompleteItem | null>(null);

  const [bdType, setBdType]       = useState(BUILDING_TYPES[0].code);
  const [trade, setTrade]         = useState(TRADE_TYPES[0].code);
  const [sinceYmd, setSinceYmd]   = useState('');                   // YYYYMMDD
  const [priceMin, setPriceMin]   = useState('');                   // 만원
  const [priceMax, setPriceMax]   = useState('');
  const [areaMin, setAreaMin]     = useState('');                   // ㎡
  const [areaMax, setAreaMax]     = useState('');
  // 지도 + 반경 (cortar 선택 후 활성)
  const [pickedLat, setPickedLat] = useState<number | null>(null);
  const [pickedLng, setPickedLng] = useState<number | null>(null);
  const [radiusKm, setRadiusKm]   = useState<number>(0);            // 0 = 동 전체

  const [searchBusy, setSearchBusy] = useState(false);
  const [searchErr, setSearchErr]   = useState('');
  const [items, setItems]           = useState<VillaSearchItem[]>([]);
  const [stats, setStats]           = useState<{ list: number; detail: number; truncated?: boolean; elapsed?: number } | null>(null);

  // chosen 변경 시 지도 중심 reset
  useEffect(() => {
    if (chosen) {
      const lat = parseFloat(chosen.latitude);
      const lng = parseFloat(chosen.longitude);
      if (!isNaN(lat) && !isNaN(lng)) {
        setPickedLat(lat); setPickedLng(lng);
      }
      setRadiusKm(0);
    } else {
      setPickedLat(null); setPickedLng(null); setRadiusKm(0);
    }
  }, [chosen]);

  async function onAutocomplete(e: React.FormEvent) {
    e.preventDefault();
    const kw = keyword.trim();
    if (!kw) return;
    setAutoBusy(true); setAutoErr(''); setCands([]); setChosen(null);
    setItems([]); setStats(null); setSearchErr('');
    try {
      const r = await villaAutocomplete(session, kw);
      setCands(r.items);
      if (r.items.length === 0)      setAutoErr('해당 주소의 법정동 후보를 찾지 못했습니다');
      else if (r.items.length === 1) setChosen(r.items[0]);
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
      const useRadius = radiusKm > 0 && pickedLat != null && pickedLng != null;
      const r = await villaSearch(session, {
        cortar_no:        chosen.legalDivisionNumber,
        real_estate_type: bdType,
        trade_type:       trade,
        since_ymd:        sinceYmd.trim(),
        price_min:        priceMin ? Number(priceMin) : undefined,
        price_max:        priceMax ? Number(priceMax) : undefined,
        area_min:         areaMin  ? Number(areaMin)  : undefined,
        area_max:         areaMax  ? Number(areaMax)  : undefined,
        center_lat:       useRadius ? pickedLat ?? undefined : undefined,
        center_lng:       useRadius ? pickedLng ?? undefined : undefined,
        radius_km:        useRadius ? radiusKm : undefined,
        max_pages:        50,
        fetch_detail:     true,
        detail_limit:     200,
      });
      setItems(r.items);
      setStats({ list: r.list_count, detail: r.detail_count, truncated: r.truncated, elapsed: r.elapsed_sec });
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
            <button key={c.legalDivisionNumber} onClick={() => setChosen(c)}
                    className="block w-full text-left px-3 py-2 rounded hover:bg-[color:var(--color-bg-soft)] text-sm">
              <span className="font-mono text-[color:var(--color-muted)] mr-2">{c.legalDivisionNumber}</span>
              {c.name}
              {c.level && <span className="ml-2 text-xs text-[color:var(--color-muted)]">[{c.level}]</span>}
            </button>
          ))}
        </div>
      )}

      {/* 선택 + 지도 + 필터 */}
      {chosen && (
        <div className="bg-[color:var(--color-bg-soft)] border border-[color:var(--color-border)] rounded-lg p-3 space-y-3">
          <div className="text-sm">
            <span className="text-[color:var(--color-muted)] mr-2">선택됨:</span>
            <span className="font-semibold">{chosen.name}</span>
            <span className="ml-2 font-mono text-xs text-[color:var(--color-muted)]">cortarNo={chosen.legalDivisionNumber}</span>
            <button onClick={() => { setChosen(null); setItems([]); setStats(null); }}
                    className="ml-2 text-xs text-[color:var(--color-muted)] underline">변경</button>
          </div>

          {/* 지도: 클릭으로 검색 중심점 설정 + 반경 슬라이더 */}
          {pickedLat != null && pickedLng != null && (
            <div className="space-y-2">
              <div className="text-xs text-[color:var(--color-muted)]">
                지도 클릭 → 검색 중심점 설정.
                {radiusKm > 0 ? (
                  <> 반경 <span className="font-semibold text-[color:var(--color-ink)]">{radiusKm}km</span> 안만 detail 호출 (속도↑)</>
                ) : (
                  <> 반경 = 동 전체 (slider 조정 시 좁힘)</>
                )}
              </div>
              <div className="h-[280px] border border-[color:var(--color-border)] rounded">
                <MapContainer center={[pickedLat, pickedLng]} zoom={15}
                              style={{ height: '100%', width: '100%' }}
                              scrollWheelZoom>
                  <TileLayer
                    attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <MapClickHandler onClick={(lat, lng) => { setPickedLat(lat); setPickedLng(lng); }} />
                  <CenterUpdater lat={pickedLat} lng={pickedLng} />
                  <Marker position={[pickedLat, pickedLng]} />
                  {radiusKm > 0 && (
                    <Circle center={[pickedLat, pickedLng]} radius={radiusKm * 1000}
                            pathOptions={{ color: '#3b82f6', fillOpacity: 0.1 }} />
                  )}
                </MapContainer>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-[color:var(--color-muted)]">반경:</span>
                {[0, 0.3, 0.5, 1, 2, 5].map(km => (
                  <button key={km}
                          onClick={() => setRadiusKm(km)}
                          className={
                            'px-2 py-1 rounded border ' +
                            (radiusKm === km
                              ? 'bg-[color:var(--color-brand)] text-white border-[color:var(--color-brand)]'
                              : 'bg-white border-[color:var(--color-border)] hover:bg-[color:var(--color-bg-soft)]')
                          }>
                    {km === 0 ? '동 전체' : `${km}km`}
                  </button>
                ))}
                <span className="text-[color:var(--color-muted)] ml-2 font-mono">
                  ({pickedLat.toFixed(4)}, {pickedLng.toFixed(4)})
                </span>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-3 text-sm items-end">
            <FilterField label="건물유형">
              <select value={bdType} onChange={e => setBdType(e.target.value)}
                      className="h-8 px-2 rounded border border-[color:var(--color-border)] text-sm">
                {BUILDING_TYPES.map(b => <option key={b.code} value={b.code}>{b.label}</option>)}
              </select>
            </FilterField>
            <FilterField label="거래유형">
              <select value={trade} onChange={e => setTrade(e.target.value)}
                      className="h-8 px-2 rounded border border-[color:var(--color-border)] text-sm">
                {TRADE_TYPES.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
              </select>
            </FilterField>
            <FilterField label="등록일 ≥">
              <input type="text" value={sinceYmd} onChange={e => setSinceYmd(e.target.value)}
                     placeholder="YYYYMMDD" maxLength={8}
                     className="w-28 h-8 px-2 rounded border border-[color:var(--color-border)] text-sm" />
            </FilterField>
            <FilterField label="가격(만원)">
              <input type="number" value={priceMin} onChange={e => setPriceMin(e.target.value)}
                     placeholder="최소" className="w-24 h-8 px-2 rounded border border-[color:var(--color-border)] text-sm" />
              <span className="mx-1 text-[color:var(--color-muted)]">~</span>
              <input type="number" value={priceMax} onChange={e => setPriceMax(e.target.value)}
                     placeholder="최대" className="w-24 h-8 px-2 rounded border border-[color:var(--color-border)] text-sm" />
            </FilterField>
            <FilterField label="면적(㎡)">
              <input type="number" value={areaMin} onChange={e => setAreaMin(e.target.value)}
                     placeholder="최소" className="w-20 h-8 px-2 rounded border border-[color:var(--color-border)] text-sm" />
              <span className="mx-1 text-[color:var(--color-muted)]">~</span>
              <input type="number" value={areaMax} onChange={e => setAreaMax(e.target.value)}
                     placeholder="최대" className="w-20 h-8 px-2 rounded border border-[color:var(--color-border)] text-sm" />
            </FilterField>
            <button onClick={onSearch} disabled={searchBusy}
                    className="h-8 px-4 rounded-lg bg-[color:var(--color-brand)] text-white text-sm font-semibold disabled:opacity-50">
              {searchBusy ? '검색 중...' : '매물 검색'}
            </button>
          </div>
        </div>
      )}

      {searchErr && <div className="text-sm text-red-600">{searchErr}</div>}
      {stats && (
        <div className="text-sm text-[color:var(--color-muted)]">
          전체 {stats.list}건 / detail {stats.detail}건
          {stats.truncated && <span className="text-amber-600 ml-2">(detail_limit 초과 — 일부만 상세 로드)</span>}
          {stats.elapsed != null && <span className="ml-2">({stats.elapsed}s)</span>}
        </div>
      )}

      {items.length > 0 && <VillaResultTable items={items} />}
    </div>
  );
}

// ── 매물번호 조회 (빌라 단건) ────────────────────────────────────────────
function ArticleByNo({ session }: { session: Session | null }) {
  const [no, setNo]       = useState('');
  const [busy, setBusy]   = useState(false);
  const [err, setErr]     = useState('');
  const [info, setInfo]   = useState<VillaSearchItem | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = no.trim();
    if (!v) return;
    setBusy(true); setErr(''); setInfo(null);
    try {
      const r = await villaArticleDetail(session, v);
      setInfo(r.info);
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.status} · ${e.message}` : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="flex gap-2 items-stretch">
        <input
          type="text" value={no} onChange={e => setNo(e.target.value)}
          placeholder="매물번호 (예: 2624640374)"
          className="flex-1 max-w-md h-10 px-3 rounded-lg border border-[color:var(--color-border)] text-sm"
          disabled={busy}
        />
        <button type="submit" disabled={busy || !no.trim()}
                className="h-10 px-4 rounded-lg bg-[color:var(--color-brand)] text-white text-sm font-semibold disabled:opacity-50">
          {busy ? '조회 중...' : '조회'}
        </button>
      </form>
      {err && <div className="text-sm text-red-600">{err}</div>}
      {info && <VillaResultTable items={[info]} />}
    </div>
  );
}

// ── 결과 표 (빌라용 컬럼 — VBA ParseJson호수 기반) ─────────────────────────
// 빌라는 방향/주소(시도 prefix)/프리미엄 컬럼 없음. 매물번호/입주시기 위치 변경.
function VillaResultTable({ items }: { items: VillaSearchItem[] }) {
  return (
    <div className="overflow-x-auto border border-[color:var(--color-border)] rounded-lg">
      <table className="min-w-full text-xs">
        <thead className="bg-[color:var(--color-bg-soft)]">
          <tr>
            <Th>거래</Th>
            <Th>매물명/건물명</Th>
            <Th>동/타입</Th>
            <Th>호수</Th>
            <Th>층(현/최고)</Th>
            <Th>면적(전용/공급㎡)</Th>
            <Th>방/욕실</Th>
            <Th>용도</Th>
            <Th>인증</Th>
            <Th>가격(만원)</Th>
            <Th>특징광고</Th>
            <Th>등록일</Th>
            <Th>매물번호</Th>
            <Th>입주시기</Th>
            <Th>중개사</Th>
          </tr>
        </thead>
        <tbody>
          {items.map(it => <VillaRow key={it.articleNo} it={it} />)}
        </tbody>
      </table>
    </div>
  );
}

function VillaRow({ it }: { it: VillaSearchItem }) {
  const name = String((it.articleName as string) || (it.bldNm as string) || '');
  const dong = String((it.buildingName as string) || (it as any).dongNm || '');
  const ptp  = String((it.ptpName as string) || '');
  const ho   = String((it.unitNumber as string) || (it.hoName as string) || (it as any).existHo || '');
  const cf   = it.correspondingFloorCount ?? '';
  const tf   = it.totalFloorCount ?? '';
  const exclusive = it.exclusiveSpace || it.area2 || (it as any).totArea || '';
  const supply    = it.supplySpace || it.area1 || (it as any).buildingSpace || '';
  const room  = (it.roomCount as any) ?? '';
  const bath  = (it.bathroomCount as any) ?? '';
  const usage = String((it as any).usageTypeName || (it as any).mainPurpsCdNm || '');
  const ver   = String(it.verificationTypeCode || '');
  const deal  = Number(it.dealPrice || 0);
  const warrant = Number(it.warrantPrice || 0);
  const rent  = Number(it.rentPrice || it.rentPrc || 0);
  const tradeName = String(it.tradeTypeName || '');
  const cpUrl = it.cpPcArticleUrl as string | undefined;
  const realtor = String(it.realtorName || '');
  const tel   = String((it as any).representativeTelNo || (it as any).cellPhoneNo || '');
  const moveIn = String((it as any).moveInTypeName || (it as any).moveInPossibleYmd || '');
  const feat  = String(it.articleFeatureDesc || '');

  // 가격 표시: 매매=deal, 전세=warrant, 월세='warrant/rent'
  let priceDisp = '';
  if (rent > 0)        priceDisp = `${warrant.toLocaleString()}/${rent.toLocaleString()}`;
  else if (warrant > 0) priceDisp = warrant.toLocaleString();
  else if (deal > 0)    priceDisp = deal.toLocaleString();

  const exclusiveDisp = typeof exclusive === 'number' ? exclusive.toFixed(1) : String(exclusive);
  const supplyDisp    = typeof supply    === 'number' ? supply.toFixed(1)    : String(supply);

  return (
    <tr className="border-t border-[color:var(--color-border)] hover:bg-[color:var(--color-bg-soft)]">
      <Td>{tradeName}</Td>
      <Td className="max-w-[180px] truncate" title={name}>{name}</Td>
      <Td className="max-w-[100px] truncate" title={`${dong} / ${ptp}`}>
        {dong}{ptp && <span className="text-[color:var(--color-muted)]"> / {ptp}</span>}
      </Td>
      <Td>{ho}</Td>
      <Td>{cf || tf ? `${cf}/${tf}` : ''}</Td>
      <Td className="whitespace-nowrap">
        {exclusiveDisp || ''}{supplyDisp ? ` / ${supplyDisp}` : ''}
      </Td>
      <Td>{room && bath ? `${room}/${bath}` : (room || bath || '')}</Td>
      <Td className="max-w-[100px] truncate" title={usage}>{usage}</Td>
      <Td>{ver}</Td>
      <Td className="whitespace-nowrap">{priceDisp}</Td>
      <Td className="max-w-[200px] truncate" title={feat}>{feat}</Td>
      <Td className="whitespace-nowrap">{it.articleConfirmYmd || ''}</Td>
      <Td>
        {cpUrl
          ? <a href={cpUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{it.articleNo}</a>
          : it.articleNo}
      </Td>
      <Td className="max-w-[100px] truncate" title={moveIn}>{moveIn}</Td>
      <Td className="max-w-[150px] truncate" title={`${realtor} ${tel}`}>
        {realtor}{tel && <div className="text-xs text-[color:var(--color-muted)]">{tel}</div>}
      </Td>
    </tr>
  );
}

// 지도 클릭 → 좌표 콜백
function MapClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => onClick(e.latlng.lat, e.latlng.lng),
  });
  return null;
}

// chosen 변경 시 지도 중심을 새 좌표로 panTo
function CenterUpdater({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  const lastRef = useRef<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (lastRef.current && lastRef.current.lat === lat && lastRef.current.lng === lng) return;
    map.setView([lat, lng], map.getZoom());
    lastRef.current = { lat, lng };
  }, [lat, lng, map]);
  return null;
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-1">
      <span className="text-[color:var(--color-muted)] text-xs">{label}:</span>
      {children}
    </label>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-2 py-2 text-left text-xs font-semibold text-[color:var(--color-muted)] whitespace-nowrap">{children}</th>;
}
function Td({ children, className = '', title }: { children: React.ReactNode; className?: string; title?: string }) {
  return <td className={`px-2 py-1.5 ${className}`} title={title}>{children}</td>;
}
