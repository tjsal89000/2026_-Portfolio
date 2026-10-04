import { useEffect, useState } from "react";
import { Alert, Box, Grid, Paper, Typography } from "@mui/material";
import KpiCard from "./KpiCard";
import { API_ORIGIN } from "../apiOrigin";

interface DailyCost {
  date: string;
  amount: number; // USD
  krw: number;
}

interface CostData {
  currency: string;
  monthToDate: number;
  monthToDateKrw: number;
  krwRate: number;
  rateSource: string;
  days: DailyCost[];
  fetchedAt: string;
  error?: string;
}

const krwFormat = (n: number) => `₩${Math.round(n).toLocaleString()}`;

// 비용은 자주 바뀌지 않으므로 5분마다만 다시 받는다 (서버도 1시간 캐시)
export default function CostPanel() {
  const [data, setData] = useState<CostData | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setData(await (await fetch(`${API_ORIGIN}/ws-server/ops/cost`)).json());
      } catch {
        setData(null);
      }
    };
    load();
    const id = setInterval(load, 5 * 60_000);
    return () => clearInterval(id);
  }, []);

  const maxKrw = Math.max(...(data?.days.map((d) => d.krw) ?? [0]), 1);
  const last = data?.days[data.days.length - 1];

  return (
    <Paper variant="outlined" sx={{ p: 3, mt: 3 }}>
      <Typography variant="h6">AWS 비용</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
        Cost Explorer의 실제 청구 금액을 원화로 환산해 보여준다. 하루 정도 늦게 집계되며, 조회 비용을 줄이려고 1시간마다 갱신한다.
      </Typography>

      {data?.error && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          비용을 아직 가져오지 못했습니다: {data.error}
        </Alert>
      )}

      {data && !data.error && (
        <>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <KpiCard
                label="이번 달 누적 (원)"
                value={krwFormat(data.monthToDateKrw)}
                accent="primary"
                description={`이번 달 1일부터 집계된 AWS 비용. 약 $${data.monthToDate.toFixed(2)}를 환율 ${data.krwRate.toFixed(0)}원/$로 환산 (환율 출처: ${data.rateSource})`}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <KpiCard
                label="최근 집계일 비용 (원)"
                value={last ? krwFormat(last.krw) : "-"}
                accent="success"
                description={last ? `${last.date} 하루 비용 (집계 기준), 약 $${last.amount.toFixed(3)}` : "집계된 날짜가 없습니다"}
              />
            </Grid>
          </Grid>

          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            최근 14일 일별 비용 (원)
          </Typography>
          <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1, height: 140 }}>
            {data.days.map((d) => (
              <Box
                key={d.date}
                title={`${d.date}: ${krwFormat(d.krw)} (약 $${d.amount.toFixed(3)})`}
                sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}
              >
                <Box
                  sx={{
                    width: "100%",
                    height: `${Math.max((d.krw / maxKrw) * 100, 2)}%`,
                    bgcolor: "primary.main",
                    borderRadius: "3px 3px 0 0",
                    opacity: 0.85,
                  }}
                />
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, mt: 0.5 }}>
                  {d.date.slice(5)}
                </Typography>
              </Box>
            ))}
          </Box>
        </>
      )}
    </Paper>
  );
}
