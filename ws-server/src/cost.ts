/**
 * AWS 비용 조회 (Cost Explorer)
 *
 * 인스턴스는 failover 역할(ce:GetCostAndUsage, 조회 전용)을 통해 자격증명을 자동으로 받는다.
 * Cost Explorer는 조회 1회당 약 $0.01이 과금되므로, 결과를 1시간 동안 캐시해서 새로고침이 많아도 호출은 시간당 한 번만 나가게 한다.
 * 데이터는 보통 하루 정도 늦게 집계된다.
 */

import { CostExplorerClient, GetCostAndUsageCommand, type ResultByTime } from "@aws-sdk/client-cost-explorer";

// Cost Explorer API는 us-east-1 엔드포인트로만 호출한다 (리전과 무관한 전역 서비스)
const client = new CostExplorerClient({ region: "us-east-1" });

const CACHE_MS = 60 * 60_000;
let cache: { at: number; value: CostSummary } | null = null;

export interface DailyCost {
  date: string; // YYYY-MM-DD
  amount: number;
}

export interface CostSummary {
  currency: string;
  monthToDate: number;
  days: DailyCost[];
  fetchedAt: string;
}

function toDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseDailyCosts(results: ResultByTime[] | undefined): DailyCost[] {
  return (results ?? []).map((r) => ({
    date: r.TimePeriod?.Start ?? "",
    amount: Number(r.Total?.UnblendedCost?.Amount ?? 0),
  }));
}

export function parseMonthTotal(results: ResultByTime[] | undefined): number {
  return Number(results?.[0]?.Total?.UnblendedCost?.Amount ?? 0);
}

export async function getCostSummary(now: Date = new Date()): Promise<CostSummary> {
  if (cache && now.getTime() - cache.at < CACHE_MS) return cache.value;

  // End는 미포함이라 내일 날짜를 넣어야 오늘 비용까지 들어간다
  const end = toDay(new Date(now.getTime() + 86_400_000));
  const start14 = toDay(new Date(now.getTime() - 13 * 86_400_000));
  const monthStart = `${toDay(now).slice(0, 8)}01`;

  const [daily, monthly] = await Promise.all([
    client.send(
      new GetCostAndUsageCommand({
        TimePeriod: { Start: start14, End: end },
        Granularity: "DAILY",
        Metrics: ["UnblendedCost"],
      }),
    ),
    client.send(
      new GetCostAndUsageCommand({
        TimePeriod: { Start: monthStart, End: end },
        Granularity: "MONTHLY",
        Metrics: ["UnblendedCost"],
      }),
    ),
  ]);

  const value: CostSummary = {
    currency: daily.ResultsByTime?.[0]?.Total?.UnblendedCost?.Unit ?? "USD",
    monthToDate: parseMonthTotal(monthly.ResultsByTime),
    days: parseDailyCosts(daily.ResultsByTime),
    fetchedAt: new Date(now).toISOString(),
  };
  cache = { at: now.getTime(), value };
  return value;
}
