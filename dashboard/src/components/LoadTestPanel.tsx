import { Box, Chip, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import { LOAD_TEST_RUNS, type LoadTestRun } from "../data/loadTest";

const P95_LIMIT_MS = 500;

function RunRow({ run }: { run: LoadTestRun }) {
  const completed = run.outcome === "completed";
  return (
    <Box sx={{ mb: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1, flexWrap: "wrap" }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {run.profile} 프로필 · {run.date}
        </Typography>
        <Chip
          size="small"
          variant="outlined"
          color={completed ? "success" : "error"}
          label={completed ? "끝까지 실행" : "중간 중단"}
        />
        {run.totalRequests !== null && (
          <Typography variant="caption" color="text.secondary">
            총 요청 {run.totalRequests.toLocaleString()}건
          </Typography>
        )}
      </Box>

      {run.stages.length > 0 && (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>TPS 구간</TableCell>
                <TableCell align="right">p95 (ms)</TableCell>
                <TableCell align="right">500ms 기준</TableCell>
                <TableCell align="right">실패율</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {run.stages.map((s) => {
                const pass = s.p95Ms < P95_LIMIT_MS;
                return (
                  <TableRow key={s.tps}>
                    <TableCell>{s.tps} TPS</TableCell>
                    <TableCell align="right">{s.p95Ms.toFixed(1)}</TableCell>
                    <TableCell align="right">
                      <Chip size="small" variant="outlined" color={pass ? "success" : "error"} label={pass ? "통과" : "초과"} />
                    </TableCell>
                    <TableCell align="right">{s.failRatePct === null ? "-" : `${s.failRatePct.toFixed(2)}%`}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        {run.note}
      </Typography>
    </Box>
  );
}

// 부하 테스트 결과 패널. 값은 loadTest.ts에 기록된 측정 결과를 그대로 보여준다.
export default function LoadTestPanel() {
  return (
    <Paper variant="outlined" sx={{ p: 3, mt: 3 }}>
      <Typography variant="h6">부하 테스트 결과</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
        결제 API에 TPS를 단계적으로 올려 보내고, 구간마다 응답 시간(p95)이 500ms를 넘는지 확인했다.
        p95가 500ms를 넘으면 그 지점에서 자동으로 멈추게 해서, 안정적으로 버티는 최대치를 찾는다.
      </Typography>
      {LOAD_TEST_RUNS.map((run) => (
        <RunRow key={`${run.profile}-${run.date}`} run={run} />
      ))}
    </Paper>
  );
}
