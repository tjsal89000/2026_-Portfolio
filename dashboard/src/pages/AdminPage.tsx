import { useEffect, useState } from "react";
import { Alert, Box, Button, Chip, Grid, Paper, TextField, Toolbar, Typography } from "@mui/material";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import KpiCard from "../components/KpiCard";
import { API_ORIGIN } from "../apiOrigin";

interface Visit {
  at: string;
  ip: string;
  browser: string;
  view: string;
  visitor: string;
}

interface Summary {
  todayViews: number;
  todayVisitors: number;
  weekVisitors: number;
  topViews: { view: string; count: number }[];
  recent: Visit[];
}

// 관리자 토큰은 이 탭이 열려 있는 동안만 기억한다 (sessionStorage). 브라우저를 닫으면 다시 입력한다.
const TOKEN_KEY = "aiops-admin-token";

const VIEW_NAMES: Record<string, string> = {
  about: "소개",
  overview: "실시간 모니터링",
  ops: "운영 지표",
  stats: "통계",
  progress: "진행 상황",
  tests: "테스트 코드",
  infra: "인프라 현황",
  architecture: "인프라 구성도",
  troubleshooting: "트러블슈팅",
  admin: "관리자",
};

// 관리자 전용 화면. 메뉴에는 없고 주소(#admin)로만 열린다. 데이터는 토큰이 맞아야 보인다.
export default function AdminPage() {
  const [token, setToken] = useState(() => {
    try {
      return sessionStorage.getItem(TOKEN_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [input, setInput] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async (t: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_ORIGIN}/ws-server/ops/admin/visits`, { headers: { "x-admin-token": t } });
      const json = await res.json();
      if (res.status === 401) {
        setError("관리자 토큰이 맞지 않습니다");
        setSummary(null);
        return;
      }
      if (res.status === 404) {
        setError("관리자 기능이 설정되어 있지 않습니다");
        return;
      }
      if (json.error) {
        setError(json.error);
        return;
      }
      setSummary(json);
    } catch {
      setError("서버에 연결하지 못했습니다");
    } finally {
      setLoading(false);
    }
  };

  const submit = () => {
    try {
      sessionStorage.setItem(TOKEN_KEY, input);
    } catch {
      // 저장이 막혀 있어도 이번 화면에서는 동작한다
    }
    setToken(input);
    setInput("");
    load(input);
  };

  const logout = () => {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      // 무시
    }
    setToken("");
    setSummary(null);
    setError(null);
  };

  // 처음 열 때 저장된 토큰이 있으면 바로 불러온다
  useEffect(() => {
    if (token) load(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <Toolbar />
      <Box sx={{ p: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
          관리자
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          방문 기록을 확인하는 화면입니다. 방문자 기록에는 접속 IP가 포함되며, 30일이 지나면 자동으로 지워집니다.
        </Typography>

        {!token || error ? (
          <Paper variant="outlined" sx={{ p: 3, maxWidth: 480 }}>
            {error && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            <TextField
              fullWidth
              type="password"
              label="관리자 토큰"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && input) submit();
              }}
              autoComplete="off"
            />
            <Box sx={{ display: "flex", gap: 1, mt: 2, justifyContent: "flex-end" }}>
              {token && (
                <Button onClick={logout} color="inherit">
                  잠그기
                </Button>
              )}
              <Button variant="contained" onClick={submit} disabled={!input || loading}>
                확인
              </Button>
            </Box>
          </Paper>
        ) : (
          <>
            <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
              <Button size="small" onClick={() => load(token)} disabled={loading} sx={{ mr: 1 }}>
                새로고침
              </Button>
              <Button size="small" color="inherit" onClick={logout}>
                잠그기
              </Button>
            </Box>

            {summary && (
              <>
                <Grid container spacing={2} sx={{ mb: 3 }}>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <KpiCard label="오늘 방문자" value={String(summary.todayVisitors)} unit="명" accent="primary" description="오늘 서로 다른 브라우저가 방문한 수" />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <KpiCard label="오늘 메뉴 열람" value={String(summary.todayViews)} unit="회" accent="success" description="오늘 메뉴를 연 총 횟수" />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <KpiCard label="최근 7일 방문자" value={String(summary.weekVisitors)} unit="명" accent="warning" description="최근 7일 동안 서로 다른 브라우저 수" />
                  </Grid>
                </Grid>

                <Grid container spacing={2} sx={{ mb: 3 }}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Paper variant="outlined" sx={{ p: 2.5, height: "100%" }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        최근 7일 메뉴별 열람
                      </Typography>
                      <Box sx={{ height: 260, mt: 1 }}>
                        {summary.topViews.length === 0 ? (
                          <Typography variant="body2" color="text.secondary">아직 기록이 없습니다</Typography>
                        ) : (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={summary.topViews.map((v) => ({ name: VIEW_NAMES[v.view] ?? v.view, 열람: v.count }))}>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.2)" />
                              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                              <Tooltip />
                              <Bar dataKey="열람" fill="#1A73E8" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        )}
                      </Box>
                    </Paper>
                  </Grid>

                  <Grid size={{ xs: 12, md: 6 }}>
                    <Paper variant="outlined" sx={{ p: 2.5, height: "100%", maxHeight: 340, overflowY: "auto" }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                        최근 방문 (최대 50건)
                      </Typography>
                      {summary.recent.length === 0 && (
                        <Typography variant="body2" color="text.secondary">아직 기록이 없습니다</Typography>
                      )}
                      {summary.recent.map((v, i) => (
                        <Box key={`${v.at}-${i}`} sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.75, borderBottom: (t) => `1px solid ${t.palette.divider}` }}>
                          <Typography variant="caption" color="text.secondary" sx={{ width: 118, flexShrink: 0 }}>
                            {new Date(v.at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          </Typography>
                          <Chip size="small" variant="outlined" label={VIEW_NAMES[v.view] ?? v.view} />
                          <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
                            {v.browser}
                          </Typography>
                          <Typography variant="caption" sx={{ fontFamily: "monospace" }}>{v.ip}</Typography>
                        </Box>
                      ))}
                    </Paper>
                  </Grid>
                </Grid>
              </>
            )}
          </>
        )}
      </Box>
    </>
  );
}
