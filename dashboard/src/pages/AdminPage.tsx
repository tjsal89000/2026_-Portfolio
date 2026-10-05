import { useEffect, useState } from "react";
import { Alert, Box, Button, Chip, Grid, Paper, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, TextField, Toolbar, Typography } from "@mui/material";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import KpiCard from "../components/KpiCard";
import { API_ORIGIN } from "../apiOrigin";

type Kind = "view" | "action" | "login_ok" | "login_fail";

interface AdminEvent {
  at: string;
  kind: Kind;
  detail: string;
  ip: string;
  location: string;
  userAgent: string;
  visitor: string;
}

interface Overview {
  kpis: { todayVisitors: number; todayViews: number; weekLoginFail: number; weekActions: number };
  countries: { label: string; count: number }[];
  events: AdminEvent[];
}

// 관리자 토큰은 이 탭이 열려 있는 동안만 기억한다 (sessionStorage). 맞은 토큰만 저장한다.
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
};

const KIND_LABEL: Record<Kind, string> = {
  view: "메뉴 열람",
  action: "행동",
  login_ok: "로그인 성공",
  login_fail: "로그인 실패",
};

const KIND_COLOR: Record<Kind, "default" | "warning" | "success" | "error"> = {
  view: "default",
  action: "warning",
  login_ok: "success",
  login_fail: "error",
};

const FILTERS: { key: "all" | Kind; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "view", label: "메뉴 열람" },
  { key: "action", label: "행동" },
  { key: "login_ok", label: "로그인 성공" },
  { key: "login_fail", label: "로그인 실패" },
];

function describeEvent(e: AdminEvent): string {
  return e.kind === "view" ? VIEW_NAMES[e.detail] ?? e.detail : e.detail;
}

// 관리자 전용 화면. 메뉴에서 열리지만 데이터는 토큰이 맞아야 보인다.
export default function AdminPage() {
  const [token, setToken] = useState(() => {
    try {
      return sessionStorage.getItem(TOKEN_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [input, setInput] = useState("");
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | Kind>("all");

  const load = async (t: string, isLogin = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_ORIGIN}/ws-server/ops/admin/visits`, {
        headers: { "x-admin-token": t, ...(isLogin ? { "x-admin-login": "1" } : {}) },
      });
      const json = await res.json();
      if (res.status === 404) {
        setError("관리자 기능이 설정되어 있지 않습니다");
        return;
      }
      if (!res.ok) {
        setError(json.error ?? "기록을 불러오지 못했습니다");
        if (res.status === 401) {
          try {
            sessionStorage.removeItem(TOKEN_KEY);
          } catch {
            // 무시
          }
          setToken("");
          setData(null);
        }
        return;
      }
      try {
        sessionStorage.setItem(TOKEN_KEY, t);
      } catch {
        // 저장이 막혀 있어도 이번 화면에서는 동작한다
      }
      setToken(t);
      setData(json);
    } catch {
      setError("서버에 연결하지 못했습니다");
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      // 무시
    }
    setToken("");
    setData(null);
    setError(null);
    setInput("");
  };

  // 처음 열 때 저장된 토큰이 있으면 바로 불러온다
  useEffect(() => {
    if (token) load(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data) {
    return (
      <>
        <Toolbar />
        <Box sx={{ p: 3 }}>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 3 }}>
            관리자
          </Typography>
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
                if (e.key === "Enter" && input && !loading) load(input, true);
              }}
              autoComplete="off"
            />
            <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}>
              <Button variant="contained" onClick={() => load(input, true)} disabled={!input || loading}>
                확인
              </Button>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
              틀린 토큰으로 여러 번 시도하면 해당 IP는 10분 동안 잠깁니다. 시도 내역은 IP와 함께 기록됩니다.
            </Typography>
          </Paper>
        </Box>
      </>
    );
  }

  const events = data.events.filter((e) => filter === "all" || e.kind === filter);

  return (
    <>
      <Toolbar />
      <Box sx={{ p: 3 }}>
        <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: 2, gap: 2, flexWrap: "wrap" }}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
              관리자
            </Typography>
            <Typography variant="body2" color="text.secondary">
              접속, 행동, 로그인 시도를 날짜와 IP 기반 위치와 함께 보여줍니다. 기록은 30일이 지나면 자동으로 지워집니다.
            </Typography>
          </Box>
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button size="small" onClick={() => load(token)} disabled={loading}>
              새로고침
            </Button>
            <Button size="small" color="inherit" onClick={logout}>
              잠그기
            </Button>
          </Box>
        </Box>

        {error && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <KpiCard label="오늘 방문자" value={String(data.kpis.todayVisitors)} unit="명" accent="primary" description="오늘 서로 다른 브라우저가 방문한 수" />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <KpiCard label="오늘 메뉴 열람" value={String(data.kpis.todayViews)} unit="회" accent="success" description="오늘 메뉴를 연 총 횟수" />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <KpiCard label="최근 7일 행동" value={String(data.kpis.weekActions)} unit="회" accent="primary" description="장애 주입과 리포트 생성 요청 수" />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <KpiCard label="최근 7일 로그인 실패" value={String(data.kpis.weekLoginFail)} unit="회" accent="warning" description="틀린 토큰과 잠금 중 시도 수" />
          </Grid>
        </Grid>

        <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            최근 7일 접속 국가
          </Typography>
          <Box sx={{ height: 220, mt: 1 }}>
            {data.countries.length === 0 ? (
              <Typography variant="body2" color="text.secondary">아직 기록이 없습니다</Typography>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.countries.map((c) => ({ name: c.label, 접속: c.count }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.2)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="접속" fill="#1A73E8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Box>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2.5 }}>
          <Tabs value={filter} onChange={(_, v) => setFilter(v)} variant="scrollable" sx={{ mb: 1 }}>
            {FILTERS.map((f) => (
              <Tab key={f.key} value={f.key} label={f.label} />
            ))}
          </Tabs>
          <TableContainer sx={{ maxHeight: 560 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>일시</TableCell>
                  <TableCell>구분</TableCell>
                  <TableCell>내용</TableCell>
                  <TableCell>위치</TableCell>
                  <TableCell>IP</TableCell>
                  <TableCell>브라우저</TableCell>
                  <TableCell>방문자</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {events.map((e, i) => (
                  <TableRow key={`${e.at}-${i}`} hover>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {new Date(e.at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </TableCell>
                    <TableCell>
                      <Chip size="small" variant="outlined" color={KIND_COLOR[e.kind]} label={KIND_LABEL[e.kind]} />
                    </TableCell>
                    <TableCell>{describeEvent(e)}</TableCell>
                    <TableCell>{e.location}</TableCell>
                    <TableCell sx={{ fontFamily: "monospace", whiteSpace: "nowrap" }}>{e.ip}</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{e.userAgent}</TableCell>
                    <TableCell sx={{ fontFamily: "monospace" }}>{e.visitor}</TableCell>
                  </TableRow>
                ))}
                {events.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <Typography variant="body2" color="text.secondary">아직 기록이 없습니다</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Box>
    </>
  );
}
