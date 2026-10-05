import { useEffect, useState } from "react";
import { Box, Chip, Paper, Typography } from "@mui/material";
import { API_ORIGIN } from "../apiOrigin";

interface TimelineEvent {
  kind: "alert" | "report";
  title: string;
  at: string;
  cause: string;
  evidence: string[];
  action: string;
  viaN8n: boolean;
  summary?: string;
}

// 알림은 빨강/주황 계열, 리포트는 파랑 계열로 구분한다
const KIND_LABEL: Record<TimelineEvent["kind"], string> = {
  alert: "이상탐지",
  report: "AI 리포트",
};
const KIND_COLOR: Record<TimelineEvent["kind"], "warning" | "primary"> = {
  alert: "warning",
  report: "primary",
};

// 이벤트가 많아도 패널 높이는 고정하고, 목록만 스크롤한다
export default function IncidentTimeline() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const json = await (await fetch(`${API_ORIGIN}/ws-server/ops/timeline`)).json();
        setEvents(json.events ?? []);
      } catch {
        // ws-server가 잠깐 안 떠있어도 화면은 유지
      }
    };
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <Paper variant="outlined" sx={{ p: 3, mt: 3 }}>
      <Typography variant="h6">인시던트 타임라인</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
        이상탐지 알림과 AI 리포트를 발생 순서대로 모았다. 각 항목에 무슨 일이 있었는지, 어떤 값이 근거인지, 무엇을 확인할지를 함께 적었다.
      </Typography>

      {events.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          아직 기록된 이벤트가 없습니다.
        </Typography>
      )}

      <Box sx={{ maxHeight: 420, overflowY: "auto", pr: 1 }}>
        {events.map((e, i) => (
          <Box
            key={`${e.at}-${i}`}
            sx={{
              display: "flex",
              gap: 2,
              py: 1.5,
              borderBottom: (t) => `1px solid ${t.palette.divider}`,
              "&:last-child": { borderBottom: "none" },
            }}
          >
            <Typography variant="caption" color="text.secondary" sx={{ width: 110, flexShrink: 0, pt: 0.25 }}>
              {new Date(e.at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </Typography>

            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 0.5 }}>
                <Chip size="small" variant="outlined" color={KIND_COLOR[e.kind]} label={KIND_LABEL[e.kind]} />
                {e.viaN8n && <Chip size="small" variant="outlined" color="primary" label="n8n 경유" />}
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {e.title}
                </Typography>
              </Box>

              <Typography variant="body2" sx={{ mb: 0.5 }}>
                <b>원인</b> · {e.cause}
              </Typography>

              {e.evidence.length > 0 && (
                <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mb: 0.5 }}>
                  {e.evidence.map((ev) => (
                    <Chip key={ev} size="small" label={ev} sx={{ height: 20, fontSize: 11 }} />
                  ))}
                </Box>
              )}

              <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                <b>확인</b> · {e.action}
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}
