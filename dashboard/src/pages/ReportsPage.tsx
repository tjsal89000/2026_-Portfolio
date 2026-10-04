import { useEffect, useState } from "react";
import { Box, Paper, Toolbar, Typography } from "@mui/material";
import { API_ORIGIN } from "../apiOrigin";

interface ReportRow {
  id: number;
  summary: string;
  generated_at: string;
}

export default function ReportsPage() {
  const [reports, setReports] = useState<ReportRow[]>([]);

  // 리포트는 주기적으로만 새로 생기므로 30초마다 최근 목록을 다시 받아온다
  useEffect(() => {
    const fetchReports = async () => {
      try {
        const res = await fetch(`${API_ORIGIN}/ws-server/reports/latest?limit=10`);
        const json = await res.json();
        setReports(Array.isArray(json) ? json : []);
      } catch {
        // ws-server가 잠깐 안 떠 있어도 화면은 그대로 보여야 하므로 조용히 무시
      }
    };
    fetchReports();
    const id = setInterval(fetchReports, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <Toolbar />
      <Box sx={{ p: 3 }}>
        <Typography variant="h6">AI 분석 리포트</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          LLM(Gemini)이 MCP 도구로 Kafka·Redis·Postgres 데이터를 직접 조회해서 작성한 운영 리포트. 최근 10건을 보여준다.
        </Typography>

        {reports.length === 0 && (
          <Paper variant="outlined" sx={{ p: 3 }}>
            <Typography variant="body2" color="text.secondary">
              아직 생성된 리포트가 없습니다. 리포트 에이전트가 호출되면 여기에 표시됩니다.
            </Typography>
          </Paper>
        )}

        {reports.map((r) => (
          <Paper key={r.id} variant="outlined" sx={{ p: 3, mb: 2 }}>
            <Typography variant="caption" color="text.secondary">
              {new Date(r.generated_at).toLocaleString()} 생성 · #{r.id}
            </Typography>
            <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mt: 1 }}>
              {r.summary}
            </Typography>
          </Paper>
        ))}
      </Box>
    </>
  );
}
