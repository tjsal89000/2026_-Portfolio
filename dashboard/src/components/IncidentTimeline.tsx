import { useEffect, useState } from "react";
import { Box, Chip, Paper, Typography } from "@mui/material";
import { API_ORIGIN } from "../apiOrigin";

interface TimelineEvent {
  kind: "alert" | "report";
  title: string;
  detail: string;
  at: string;
}

const KIND_LABEL: Record<TimelineEvent["kind"], string> = {
  alert: "알림",
  report: "리포트",
};
const KIND_COLOR: Record<TimelineEvent["kind"], "warning" | "primary"> = {
  alert: "warning",
  report: "primary",
};

// 이상탐지 알림과 AI 리포트를 시간순으로 한 줄에 모아 보여준다.
// 알림은 저장이 시작된 뒤부터 쌓이므로, 처음에는 리포트만 보일 수 있다.
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
        이상탐지 알림과 AI 리포트를 발생 순서대로 모았다. 문제가 생긴 시점과 그때 시스템이 남긴 기록을 한눈에 본다.
      </Typography>

      {events.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          아직 기록된 이벤트가 없습니다.
        </Typography>
      )}

      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        {events.map((e, i) => (
          <Box key={`${e.at}-${i}`} sx={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
            <Typography variant="caption" color="text.secondary" sx={{ width: 150, flexShrink: 0, pt: 0.5 }}>
              {new Date(e.at).toLocaleString()}
            </Typography>
            <Chip size="small" variant="outlined" color={KIND_COLOR[e.kind]} label={KIND_LABEL[e.kind]} />
            <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 0 }} noWrap title={e.title}>
              {e.title}
            </Typography>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}
