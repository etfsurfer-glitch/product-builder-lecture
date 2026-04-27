// 호스트별 백그라운드 헬스 체크.
// 각 요청마다 abort timeout 으로 죽음 감지하던 방식은 "느린 요청 = abort" 부작용이 큼.
// 별도 ping 으로 살아있음을 추적하고, fetchWithFailover 는 dead 호스트만 사전 제외.
//
// 설계:
//   - 부팅 시 즉시 1회 ping + 20s 인터벌
//   - /health timeout 5s
//   - 연속 3회 실패 → dead, 1회 성공 → alive 즉시 복귀
//   - 미체크 상태(첫 ping 전)는 alive 로 가정 (낙관)
//   - 포어그라운드 복귀 시 즉시 ping (브라우저 background tab throttling 회복)

const PING_INTERVAL_MS = 20_000;
const PING_TIMEOUT_MS  = 5_000;
const FAIL_THRESHOLD   = 3;

interface HostState {
  alive: boolean;
  failCount: number;
  lastChecked: number;
  lastLatencyMs: number;
}

const state = new Map<string, HostState>();
let started = false;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let trackedHosts: readonly string[] = [];

export function isHostAlive(host: string): boolean {
  const s = state.get(host);
  return s ? s.alive : true;
}

// 진단/표시용 — { host, alive, failCount, lastLatencyMs, ageMs }
export function getHealthSnapshot(): Array<{
  host: string; alive: boolean; failCount: number;
  lastLatencyMs: number; ageMs: number;
}> {
  const now = Date.now();
  return trackedHosts.map(h => {
    const s = state.get(h);
    return {
      host: h,
      alive: s?.alive ?? true,
      failCount: s?.failCount ?? 0,
      lastLatencyMs: s?.lastLatencyMs ?? -1,
      ageMs: s ? now - s.lastChecked : -1,
    };
  });
}

async function pingOnce(host: string): Promise<void> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS);
  const t0 = Date.now();
  let ok = false;
  try {
    const r = await fetch(`${host}/health`, {
      signal: ctrl.signal,
      cache: 'no-store',
      credentials: 'omit',
    });
    ok = r.ok;
  } catch { /* network error / timeout */ }
  finally { clearTimeout(timer); }

  const latency = Date.now() - t0;
  const cur = state.get(host) ?? {
    alive: true, failCount: 0, lastChecked: 0, lastLatencyMs: -1,
  };
  cur.lastChecked = Date.now();
  cur.lastLatencyMs = latency;
  if (ok) {
    cur.failCount = 0;
    cur.alive = true;
  } else {
    cur.failCount++;
    if (cur.failCount >= FAIL_THRESHOLD) cur.alive = false;
  }
  state.set(host, cur);
}

function pingAll(): Promise<void[]> {
  return Promise.all(trackedHosts.map(pingOnce));
}

export function startHealthPinger(hosts: readonly string[]): void {
  if (started) return;
  if (hosts.length < 2) return;
  started = true;
  trackedHosts = hosts;

  void pingAll();
  pingTimer = setInterval(() => { void pingAll(); }, PING_INTERVAL_MS);

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void pingAll();
    });
  }
}

// 테스트/HMR 용 — 일반 코드 경로에선 호출 안 함.
export function _stopHealthPinger(): void {
  if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
  started = false;
  state.clear();
}
