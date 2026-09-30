import { useEffect, useState } from "react";
import { Box, Grid, Paper, Toolbar, Typography, List, ListItem, ListItemText, Chip } from "@mui/material";
import KpiCard from "../components/KpiCard";
import TrafficSparkline from "../components/TrafficSparkline";
import { useLiveFeed } from "../hooks/useLiveFeed";
import { API_ORIGIN } from "../apiOrigin";

interface ReportRow {
  id: number;
  summary: string;
  generated_at: string;
}

const STATUS_LABEL: Record<string, string> = {
  APPROVED: "승인",
  DUPLICATE: "중복",
  FAILED: "실패",
};
const STATUS_COLOR: Record<string, "success" | "warning" | "error"> = {
  APPROVED: "success",
  DUPLICATE: "warning",
  FAILED: "error",
};

export default function OverviewPage() {
  const { payments, alerts, connected, tpsHistory, currentTps, errorRate, activeAlerts } = useLiveFeed();
  const [kafkaLag, setKafkaLag] = useState<number | null>(null);
  const [reports, setReports] = useState<ReportRow[]>([]);

  // Kafka Consumer Lag은 WebSocket 스트림에 없는 값이라(Prometheus가 스크랩하는 인프라 지표),
  // 이미 nginx로 노출해둔 Prometheus HTTP API를 그대로 재사용해 주기적으로 가져온다.
  useEffect(() => {
    const fetchLag = async () => {
      try {
        const query = encodeURIComponent('sum(kafka_consumergroup_lag{consumergroup="db-writer-consumer-group"})');
        const res = await fetch(`${API_ORIGIN}/prometheus/api/v1/query?query=${query}`);
        const json = await res.json();
        const value = json?.data?.result?.[0]?.value?.[1];
        if (value !== undefined) setKafkaLag(Number(value));
      } catch {
        // Prometheus가 아직 안 떠있어도 대시보드 자체는 계속 보여야 하므로 조용히 무시
      }
    };
    fetchLag();
    const id = setInterval(fetchLag, 10_000);
    return () => clearInterval(id);
  }, []);

  // AI 리포트(Phase 8)는 10분마다 한 번씩만 새로 생기므로, 실시간 WebSocket이 아니라
  // 가벼운 주기적 폴링으로 충분하다.
  useEffect(() => {
    const fetchReports = async () => {
      try {
        const res = await fetch(`${API_ORIGIN}/ws-server/reports/latest?limit=1`);
        const json = await res.json();
        setReports(json);
      } catch {
        // ws-server가 아직 안 떠있어도 대시보드 자체는 계속 보여야 하므로 조용히 무시
      }
    };
    fetchReports();
    const id = setInterval(fetchReports, 30_000);
    return () => clearInterval(id);
  }, []);

  const kpis = [
    {
      label: "실시간 TPS",
      value: currentTps.toFixed(1),
      unit: "req/s",
      accent: "primary" as const,
      description: "최근 10초간 처리된 결제 건수를 초당 평균으로 환산한 값 (Transactions Per Second)",
    },
    {
      label: "최근 1분 에러율",
      value: errorRate.toFixed(1),
      unit: "%",
      accent: errorRate > 5 ? ("error" as const) : ("success" as const),
      description: "최근 1분간 들어온 결제 이벤트 중 실패(FAILED) 상태 비율",
    },
    {
      label: "Kafka Consumer Lag",
      value: kafkaLag === null ? "-" : String(kafkaLag),
      unit: "건",
      accent: "success" as const,
      description:
        "Kafka에 쌓인 결제 이벤트 중 db-writer-consumer가 아직 처리하지 못하고 밀려있는 건수. " +
        "0이면 들어오는 만큼 바로 처리 중이라는 뜻이고, 계속 커지면 consumer가 느려졌거나 멈췄다는 신호",
    },
    {
      label: "활성 알림",
      value: String(activeAlerts),
      unit: "건",
      accent: activeAlerts > 0 ? ("error" as const) : ("success" as const),
      description: "최근 5분 이내에 이상탐지 에이전트가 발생시킨 알림(고액이상치/반복요청/쏠림/TPS급증 등) 건수",
    },
  ];

  const latestReport = reports[0];

  return (
    <>
      <Toolbar />
      <Box sx={{ p: 3 }}>
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {kpis.map((kpi) => (
            <Grid key={kpi.label} size={{ xs: 12, sm: 6, md: 3 }}>
              <KpiCard {...kpi} />
            </Grid>
          ))}
        </Grid>

        <Grid container spacing={2}>
          {/* 실시간 트래픽 플로우: 최근 60초 TPS 스파크라인 + 최근 결제 피드 */}
          <Grid size={{ xs: 12, md: 8 }}>
            <Paper variant="outlined" sx={{ p: 3, height: 480, display: "flex", flexDirection: "column" }}>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
                <Typography variant="h6">실시간 트래픽 플로우</Typography>
                <Chip
                  size="small"
                  label={connected ? "연결됨" : "연결 안 됨"}
                  color={connected ? "success" : "default"}
                  variant="outlined"
                />
              </Box>
              <TrafficSparkline points={tpsHistory} height={180} />
              <List dense sx={{ flexGrow: 1, overflow: "auto", mt: 1 }}>
                {payments.length === 0 && (
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", mt: 4 }}>
                    결제 이벤트 대기 중...
                  </Typography>
                )}
                {payments.map((p) => (
                  <ListItem key={`${p.idempotencyKey}-${p.receivedAt}`} disableGutters divider>
                    <ListItemText
                      primary={`${p.accountId} · ${p.amount.toLocaleString()}원 · ${p.country}/${p.paymentMethod}`}
                      secondary={new Date(p.receivedAt).toLocaleTimeString()}
                    />
                    <Chip
                      size="small"
                      label={STATUS_LABEL[p.status] ?? p.status}
                      color={STATUS_COLOR[p.status] ?? "default"}
                      variant="outlined"
                    />
                  </ListItem>
                ))}
              </List>
            </Paper>
          </Grid>

          {/* 이상탐지 알림 타임라인 */}
          <Grid size={{ xs: 12, md: 4 }}>
            <Paper variant="outlined" sx={{ p: 3, height: 480, overflow: "auto" }}>
              <Typography variant="h6" gutterBottom>
                이상탐지 알림
              </Typography>
              <List dense>
                {alerts.length === 0 && (
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", mt: 4 }}>
                    최근 알림 없음
                  </Typography>
                )}
                {alerts.map((a) => (
                  <ListItem key={a.receivedAt} disableGutters divider>
                    <ListItemText
                      primary={a.type}
                      secondary={
                        Object.entries(a.detail ?? {})
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(", ") + ` · ${new Date(a.receivedAt).toLocaleTimeString()}`
                      }
                    />
                    <Chip size="small" label="경고" color="warning" variant="outlined" />
                  </ListItem>
                ))}
              </List>
            </Paper>
          </Grid>

          {/* AI 분석 리포트 */}
          <Grid size={{ xs: 12 }}>
            <Paper variant="outlined" sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                AI 분석 리포트
              </Typography>
              {latestReport ? (
                <>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(latestReport.generated_at).toLocaleString()} 생성
                  </Typography>
                  <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mt: 1 }}>
                    {latestReport.summary}
                  </Typography>
                </>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  아직 생성된 리포트가 없습니다. n8n Schedule Trigger가 주기적으로 리포트 에이전트를
                  호출하면 여기에 표시됩니다.
                </Typography>
              )}
            </Paper>
          </Grid>
        </Grid>
      </Box>
    </>
  );
}
