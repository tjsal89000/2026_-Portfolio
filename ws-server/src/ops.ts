/**
 * 운영 지표 조회 (SLO / CI 상태 / 결제 trace)
 *
 * 세 데이터 모두 외부 시스템(Prometheus, GitHub API, Tempo)에서 가져오므로, 대시보드가 매번
 * 직접 호출하면 GitHub 시간당 호출 한도(비인증 60회)를 금방 넘고 Tempo/Prometheus에도 부담이 간다.
 * 그래서 ws-server가 대신 받아서 짧게 캐시한 뒤 내려준다.
 */

const PROMETHEUS_URL = process.env.PROMETHEUS_URL ?? "http://prometheus:9090/prometheus";
const TEMPO_URL = process.env.TEMPO_URL ?? "http://tempo:3200";
const GITHUB_REPO = process.env.GITHUB_REPO ?? "tjsal89000/2026_-Portfolio";

// SLO 목표값. 결제 API 가용성 99.9%를 목표로 잡고, 에러 예산은 (1 - 목표)에서 실제 실패율이 얼마나 쓰였는지로 계산한다.
export const SLO_TARGET = 0.999;

// ---------- 캐시 ----------
// 값 하나당 만료 시각만 기억하는 아주 작은 캐시. 같은 값을 여러 브라우저가 동시에 요청해도 외부 호출은 한 번만 나간다.
const cache = new Map<string, { expiresAt: number; value: unknown }>();

async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as T;
  const value = await load();
  cache.set(key, { expiresAt: Date.now() + ttlMs, value });
  return value;
}

// ---------- SLO (Prometheus) ----------
interface PromResponse {
  status: string;
  data?: { result?: { value?: [number, string] }[] };
}

async function promInstant(query: string): Promise<number | null> {
  const res = await fetch(`${PROMETHEUS_URL}/api/v1/query?query=${encodeURIComponent(query)}`);
  const json = (await res.json()) as PromResponse;
  const raw = json.data?.result?.[0]?.value?.[1];
  if (raw === undefined) return null;
  const n = Number(raw);
  // 요청이 한 건도 없던 구간은 0/0 이 되어 NaN이 나오는데, 이건 "측정값 없음"으로 취급한다
  return Number.isFinite(n) ? n : null;
}

// 최근 1시간 기준 성공률/p95 지연을 계산한다. 면접용 참고 지표라 기간을 1시간으로 짧게 잡았다
// (Prometheus 보관 기간과 실제 운영 기간이 짧아서 30일 창을 쓰면 값이 의미 없어짐).
export function calcErrorBudget(successRatio: number, target = SLO_TARGET) {
  const allowed = 1 - target;
  const consumed = 1 - successRatio;
  const remainingRatio = Math.max(0, 1 - consumed / allowed);
  return { allowed, consumed, remainingPct: remainingRatio * 100 };
}

export async function getSlo() {
  return cached("slo", 15_000, async () => {
    const successRatio = await promInstant(
      'sum(rate(http_server_requests_seconds_count{job="payment-api",uri="/payments",status!~"5.."}[1h])) / sum(rate(http_server_requests_seconds_count{job="payment-api",uri="/payments"}[1h]))',
    );
    const p95Seconds = await promInstant(
      'histogram_quantile(0.95, sum(rate(http_server_requests_seconds_bucket{job="payment-api",uri="/payments"}[1h])) by (le))',
    );
    const budget = successRatio === null ? null : calcErrorBudget(successRatio);
    return {
      windowLabel: "최근 1시간",
      target: SLO_TARGET,
      successRatio,
      p95Ms: p95Seconds === null ? null : p95Seconds * 1000,
      errorBudgetRemainingPct: budget ? budget.remainingPct : null,
    };
  });
}

// ---------- CI 상태 (GitHub Actions) ----------
export interface CiRun {
  name: string;
  conclusion: string | null;
  status: string;
  title: string;
  sha: string;
  createdAt: string;
  url: string;
}

interface GithubRun {
  name?: string;
  display_title?: string;
  status: string;
  conclusion: string | null;
  head_sha: string;
  created_at: string;
  html_url: string;
}

export function parseGithubRuns(json: { workflow_runs?: GithubRun[] }): CiRun[] {
  return (json.workflow_runs ?? []).map((r) => ({
    name: r.name ?? "workflow",
    conclusion: r.conclusion,
    status: r.status,
    title: r.display_title ?? "",
    sha: r.head_sha.slice(0, 7),
    createdAt: r.created_at,
    url: r.html_url,
  }));
}

export async function getCiRuns(limit = 5): Promise<CiRun[]> {
  return cached(`ci:${limit}`, 5 * 60_000, async () => {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/actions/runs?per_page=${limit}`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "aiops-dashboard" },
    });
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    return parseGithubRuns((await res.json()) as { workflow_runs?: GithubRun[] });
  });
}

// ---------- 결제 trace (Tempo) ----------
export interface TraceSummary {
  traceId: string;
  rootName: string;
  durationMs: number;
  startedAt: number; // epoch ms
}

export interface TraceSpan {
  service: string;
  name: string;
  offsetMs: number; // trace 시작 기준 이 span이 시작된 시점
  durationMs: number;
}

export async function getRecentTraces(limit = 10): Promise<TraceSummary[]> {
  return cached(`traces:${limit}`, 15_000, async () => {
    const q = encodeURIComponent('{resource.service.name="payment-api"}');
    const res = await fetch(`${TEMPO_URL}/api/search?q=${q}&limit=${limit}`);
    if (!res.ok) throw new Error(`Tempo search ${res.status}`);
    const json = (await res.json()) as {
      traces?: { traceID: string; rootTraceName?: string; durationMs?: number; startTimeUnixNano?: string }[];
    };
    return (json.traces ?? []).map((t) => ({
      traceId: t.traceID,
      rootName: t.rootTraceName ?? "",
      durationMs: t.durationMs ?? 0,
      startedAt: Math.floor(Number(t.startTimeUnixNano ?? 0) / 1e6),
    }));
  });
}

// Tempo가 주는 OTLP JSON에서 span 목록을 뽑는다. 나노초 값은 Number로 바로 빼면 정밀도가 깨져서
// BigInt로 먼저 차이를 구한 뒤 ms로 바꾼다.
export function parseTrace(json: unknown): TraceSpan[] {
  const body = json as {
    batches?: OtlpBatch[];
    trace?: { resourceSpans?: OtlpBatch[] };
  };
  const batches = body.batches ?? body.trace?.resourceSpans ?? [];

  const flat: { service: string; name: string; start: bigint; end: bigint }[] = [];
  for (const batch of batches) {
    const service =
      batch.resource?.attributes?.find((a) => a.key === "service.name")?.value?.stringValue ?? "unknown";
    for (const scope of batch.scopeSpans ?? batch.instrumentationLibrarySpans ?? []) {
      for (const span of scope.spans ?? []) {
        flat.push({
          service,
          name: span.name,
          start: BigInt(span.startTimeUnixNano),
          end: BigInt(span.endTimeUnixNano),
        });
      }
    }
  }
  if (flat.length === 0) return [];

  const origin = flat.reduce((min, s) => (s.start < min ? s.start : min), flat[0].start);
  return flat
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
    .map((s) => ({
      service: s.service,
      name: s.name,
      offsetMs: Number(s.start - origin) / 1e6,
      durationMs: Number(s.end - s.start) / 1e6,
    }));
}

interface OtlpBatch {
  resource?: { attributes?: { key: string; value?: { stringValue?: string } }[] };
  scopeSpans?: OtlpScope[];
  instrumentationLibrarySpans?: OtlpScope[];
}
interface OtlpScope {
  spans?: { name: string; startTimeUnixNano: string; endTimeUnixNano: string }[];
}

export async function getTrace(traceId: string): Promise<TraceSpan[]> {
  // trace id는 16진수만 허용 - 그대로 URL에 넣으면 경로 조작이 될 수 있어서 먼저 걸러낸다
  if (!/^[0-9a-f]{16,32}$/i.test(traceId)) throw new Error("잘못된 trace id");
  return cached(`trace:${traceId}`, 60_000, async () => {
    const res = await fetch(`${TEMPO_URL}/api/traces/${traceId}`, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Tempo trace ${res.status}`);
    return parseTrace(await res.json());
  });
}
