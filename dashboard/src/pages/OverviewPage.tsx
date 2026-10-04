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

  // 각 단계의 상태는 화면에 실제로 들어오는 데이터로만 판단한다 - 확인할 수 없는 단계는 "확인 중"으로 둔다
  const pipeline: { label: string; status: string; color: "success" | "warning" | "error" | "default" }[] = [
    {
      label: "결제 수신",
      status: currentTps > 0 ? `수신 중 · ${currentTps.toFixed(1)} TPS` : "대기 중",
      color: currentTps > 0 ? "success" : "default",
    },
    {
      label: "Kafka → DB 저장",
      status:
        kafkaLag === null
          ? "확인 중"
          : kafkaLag <= 100
            ? `정상 · Lag ${kafkaLag}`
            : `밀림 · Lag ${kafkaLag}`,
      color: kafkaLag === null ? "default" : kafkaLag <= 100 ? "success" : "warning",
    },
    {
      label: "이상탐지",
      status: activeAlerts > 0 ? `최근 5분 알림 ${activeAlerts}건` : "감시 중",
      color: activeAlerts > 0 ? "warning" : "success",
    },
    {
      label: "AI 리포트",
      status: latestReport ? `생성됨 · ${new Date(latestReport.generated_at).toLocaleTimeString()}` : "대기 중",
      color: latestReport ? "success" : "default",
    },
    {
      label: "실시간 연결",
      status: connected ? "연결됨" : "끊김",
      color: connected ? "success" : "error",
    },
  ];

  return (
    <>
      <Toolbar />
      <Box sx={{ p: 3 }}>
        <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            결제 플랫폼의 실시간 운영 현황
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            가상의 결제 트래픽을 생성해 Kafka → Postgres/Redis → 이상탐지 → 알림 → AI 리포트까지 이어지는 흐름을
            실제로 돌리고, 그 결과를 여기서 보여준다. 아래 점검 바에서 각 단계가 지금 동작하는지 바로 확인할 수 있다.
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            {pipeline.map((step) => (
              <Chip
                key={step.label}
                size="small"
                color={step.color}
                variant="outlined"
                label={`${step.label}: ${step.status}`}
              />
            ))}
          </Box>
        </Paper>

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
                <Box>
                  <Typography variant="h6">실시간 트래픽 플로우</Typography>
                  <Typography variant="caption" color="text.secondary">
                    결제 요청이 들어오는 속도(TPS)와 최근 결제 내역
                  </Typography>
                </Box>
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
              <Typography variant="h6">이상탐지 알림</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                고액 결제·같은 계좌 반복 요청·특정 국가/결제수단 쏠림 패턴을 감지하면 여기 쌓인다
              </Typography>
              <List dense>
                {alerts.length === 0 && (
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", mt: 4 }}>
                    감시 중 · 이상 패턴이 감지되면 여기에 표시됩니다
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
              <Typography variant="h6">AI 분석 리포트</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                LLM(Gemini)이 MCP 도구로 Kafka·Redis·Postgres 데이터를 직접 조회해서 작성한 운영 리포트
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
