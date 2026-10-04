import { useEffect, useState } from "react";
import { Box, Chip, Grid, List, ListItem, ListItemButton, ListItemText, Paper, Toolbar, Typography } from "@mui/material";
import KpiCard from "../components/KpiCard";
import LoadTestPanel from "../components/LoadTestPanel";
import IncidentTimeline from "../components/IncidentTimeline";
import ChaosPanel from "../components/ChaosPanel";
import { API_ORIGIN } from "../apiOrigin";

interface Slo {
  windowLabel: string;
  target: number;
  successRatio: number | null;
  p95Ms: number | null;
  errorBudgetRemainingPct: number | null;
  error?: string;
}

interface CiRun {
  name: string;
  conclusion: string | null;
  status: string;
  title: string;
  sha: string;
  createdAt: string;
  url: string;
}

interface TraceSummary {
  traceId: string;
  rootName: string;
  durationMs: number;
  startedAt: number;
}

interface TraceSpan {
  service: string;
  name: string;
  offsetMs: number;
  durationMs: number;
}

const OPS_API = `${API_ORIGIN}/ws-server/ops`;

const CONCLUSION_LABEL: Record<string, string> = {
  success: "성공",
  failure: "실패",
  cancelled: "취소",
};
const CONCLUSION_COLOR: Record<string, "success" | "error" | "default"> = {
  success: "success",
  failure: "error",
};

// 한 페이지 안의 세 패널(SLO / CI / trace)은 서로 독립이라, 하나가 실패해도 나머지는 그대로 보여준다.
interface OpsPageProps {
  onChaosStarted?: () => void;
}

export default function OpsPage({ onChaosStarted }: OpsPageProps) {
  const [slo, setSlo] = useState<Slo | null>(null);
  const [ci, setCi] = useState<{ runs: CiRun[]; error?: string } | null>(null);
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [spans, setSpans] = useState<TraceSpan[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        setSlo(await (await fetch(`${OPS_API}/slo`)).json());
      } catch {
        // ws-server가 떠있지 않을 때도 페이지 자체는 보여야 하므로 조용히 넘어간다
      }
      try {
        setCi(await (await fetch(`${OPS_API}/ci`)).json());
      } catch {
        // 위와 같은 이유로 무시
      }
      try {
        const json = await (await fetch(`${OPS_API}/traces`)).json();
        setTraces(json.traces ?? []);
      } catch {
        // 위와 같은 이유로 무시
      }
    };
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  // 목록에서 trace를 고르면 그 trace의 span 목록을 가져와 폭포(waterfall) 그래프로 그린다
  useEffect(() => {
    if (!selectedId) return;
    fetch(`${OPS_API}/traces/${selectedId}`)
      .then((res) => res.json())
      .then((json) => setSpans(json.spans ?? []))
      .catch(() => setSpans([]));
  }, [selectedId]);

  const selectedTrace = traces.find((t) => t.traceId === selectedId);
  const totalMs = spans.reduce((max, s) => Math.max(max, s.offsetMs + s.durationMs), 0);

  const sloKpis = [
    {
      label: "성공률 (최근 1시간)",
      value: slo?.successRatio == null ? "-" : (slo.successRatio * 100).toFixed(2),
      unit: "%",
      accent: slo?.successRatio != null && slo.successRatio < slo.target ? ("error" as const) : ("success" as const),
      description: `결제 API(/payments) 요청 중 5xx가 아닌 비율. 목표는 ${(slo?.target ?? 0.999) * 100}%`,
    },
    {
      label: "p95 응답 시간 (최근 1시간)",
      value: slo?.p95Ms == null ? "-" : slo.p95Ms.toFixed(0),
      unit: "ms",
      accent: "primary" as const,
      description: "요청 100건 중 95건이 이 시간 안에 끝났다는 뜻. 평균보다 느린 꼬리 지연을 보기 위해 p95를 쓴다",
    },
    {
      label: "남은 에러 예산",
      value: slo?.errorBudgetRemainingPct == null ? "-" : slo.errorBudgetRemainingPct.toFixed(1),
      unit: "%",
      accent:
        slo?.errorBudgetRemainingPct != null && slo.errorBudgetRemainingPct < 50
          ? ("warning" as const)
          : ("success" as const),
      description:
        "목표(99.9%)에서 허용된 실패 몫 중 아직 안 쓴 비율. 0%면 목표를 넘겨 실패를 다 써버린 상태라 배포를 멈추고 안정화해야 한다는 신호",
    },
  ];

  return (
    <>
      <Toolbar />
      <Box sx={{ p: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
          운영 지표
        </Typography>
        <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
            화면 설명
          </Typography>
          <Typography variant="body2" color="text.secondary" component="div">
            서비스가 "돌아간다"에서 끝나지 않고, 목표를 지키고 있는지·배포가 안전한지·문제가 생기면 어디서 느려지는지를
            숫자로 답할 수 있어야 운영 가능한 서비스라고 본다. 그래서 세 가지를 한 화면에 모았다.
            <Box component="ul" sx={{ pl: 2.5, mt: 1, mb: 0 }}>
              <li>
                <b>SLO / 에러 예산</b>: 결제 API 가용성 목표(99.9%)를 정하고, 그 안에서 실패를 얼마나 썼는지 확인한다.
                목표를 넘기면 새 기능보다 안정화를 우선한다는 기준이 된다.
              </li>
              <li>
                <b>CI 빌드 목록</b>: 코드가 push될 때마다 테스트와 빌드가 통과했는지 기록으로 남긴다.
                배포 전에 품질을 확인하는 장치가 실제로 돌고 있다는 증거다.
              </li>
              <li>
                <b>결제 요청 추적</b>: 요청 하나가 API → Kafka → DB를 지나는 구간별 시간을 본다.
                느려졌을 때 "어느 단계가 원인인지"를 평균이 아니라 개별 요청 단위로 찾기 위해 있다.
              </li>
            </Box>
          </Typography>
        </Paper>

        {/* SLO / 에러 예산 */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {sloKpis.map((kpi) => (
            <Grid key={kpi.label} size={{ xs: 12, sm: 6, md: 4 }}>
              <KpiCard {...kpi} />
            </Grid>
          ))}
        </Grid>

        <Grid container spacing={2}>
          {/* CI 상태 */}
          <Grid size={{ xs: 12, md: 5 }}>
            <Paper variant="outlined" sx={{ p: 3, height: 420, overflow: "auto" }}>
              <Typography variant="h6">최근 CI 빌드</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                GitHub Actions에서 push/PR마다 돌아간 테스트·빌드 결과 (5분마다 갱신)
              </Typography>
              {ci?.error && (
                <Typography variant="body2" color="error">
                  CI 상태를 가져오지 못했습니다: {ci.error}
                </Typography>
              )}
              <List dense>
                {ci?.runs.map((run) => (
                  <ListItem key={run.url} disableGutters divider>
                    <ListItemButton component="a" href={run.url} target="_blank" rel="noopener noreferrer" sx={{ px: 0 }}>
                      <ListItemText
                        primary={`${run.title || run.name} · ${run.sha}`}
                        secondary={new Date(run.createdAt).toLocaleString()}
                      />
                      <Chip
                        size="small"
                        variant="outlined"
                        label={run.conclusion ? (CONCLUSION_LABEL[run.conclusion] ?? run.conclusion) : "진행 중"}
                        color={run.conclusion ? (CONCLUSION_COLOR[run.conclusion] ?? "default") : "default"}
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            </Paper>
          </Grid>

          {/* 결제 trace 목록 + 폭포 그래프 */}
          <Grid size={{ xs: 12, md: 7 }}>
            <Paper variant="outlined" sx={{ p: 3, height: 420, display: "flex", flexDirection: "column" }}>
              <Typography variant="h6">결제 요청 추적</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                요청 하나가 API → Kafka → DB 저장까지 지나간 구간을 막대 길이로 보여준다. 목록에서 골라 보세요.
              </Typography>

              {traces.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", mt: 4 }}>
                  아직 수집된 trace가 없습니다.
                </Typography>
              )}

              {selectedId && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {selectedTrace?.rootName || selectedId} · 전체 {totalMs.toFixed(1)} ms
                  </Typography>
                  {spans.map((s, i) => (
                    <Box key={`${s.service}-${s.name}-${i}`} sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
                      <Typography variant="caption" sx={{ width: 150, flexShrink: 0 }} noWrap title={`${s.service} · ${s.name}`}>
                        {s.service} · {s.name}
                      </Typography>
                      <Box sx={{ position: "relative", flexGrow: 1, height: 10, bgcolor: "action.hover", borderRadius: 1 }}>
                        <Box
                          sx={{
                            position: "absolute",
                            left: `${totalMs ? (s.offsetMs / totalMs) * 100 : 0}%`,
                            width: `${Math.max(totalMs ? (s.durationMs / totalMs) * 100 : 0, 0.5)}%`,
                            height: "100%",
                            bgcolor: "primary.main",
                            borderRadius: 1,
                          }}
                        />
                      </Box>
                      <Typography variant="caption" sx={{ width: 64, textAlign: "right" }}>
                        {s.durationMs.toFixed(1)} ms
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}

              <List dense sx={{ overflow: "auto", flexGrow: 1 }}>
                {traces.map((t) => (
                  <ListItem key={t.traceId} disableGutters divider>
                    <ListItemButton selected={t.traceId === selectedId} onClick={() => setSelectedId(t.traceId)} sx={{ px: 1 }}>
                      <ListItemText
                        primary={`${t.rootName || "요청"} · ${t.durationMs} ms`}
                        secondary={t.startedAt ? new Date(t.startedAt).toLocaleTimeString() : ""}
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            </Paper>
          </Grid>
        </Grid>

        <ChaosPanel onStarted={onChaosStarted} />

        <IncidentTimeline />

        <LoadTestPanel />
      </Box>
    </>
  );
}
