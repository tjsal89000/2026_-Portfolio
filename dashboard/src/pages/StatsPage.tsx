import { useEffect, useState } from "react";
import { Alert, Box, Grid, Paper, Toolbar, Typography } from "@mui/material";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import KpiCard from "../components/KpiCard";
import { API_ORIGIN } from "../apiOrigin";

interface Share {
  label: string;
  count: number;
  percent: number;
}

interface DayPoint {
  date: string;
  count: number;
  amount: number;
}

interface StatsData {
  windowDays: number;
  totalPayments: number;
  totalAmount: number;
  totalAlerts: number;
  countries: Share[];
  paymentMethods: Share[];
  alertTypes: Share[];
  daily: DayPoint[];
  error?: string;
}

// 차트 색은 테마 팔레트 대신 고정 목록을 쓴다 (항목 수가 적고, 같은 항목은 같은 색으로 보이게)
const PALETTE = ["#FF9900", "#1A73E8", "#34A853", "#EA4335", "#9C27B0", "#00ACC1", "#F4B400", "#8D6E63"];

const won = (n: number) => `₩${Math.round(n).toLocaleString("ko-KR")}`;

function ChartCard({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5, height: "100%" }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
        {desc}
      </Typography>
      <Box sx={{ height: 260 }}>{children}</Box>
    </Paper>
  );
}

function Empty() {
  return (
    <Box sx={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Typography variant="body2" color="text.secondary">
        아직 데이터가 없습니다
      </Typography>
    </Box>
  );
}

export default function StatsPage() {
  const [data, setData] = useState<StatsData | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setData(await (await fetch(`${API_ORIGIN}/ws-server/ops/stats`)).json());
      } catch {
        setData(null);
      }
    };
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  const pieData = (shares: Share[]) => shares.map((s) => ({ name: s.label, value: s.count, percent: s.percent }));

  return (
    <>
      <Toolbar />
      <Box sx={{ p: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
          통계
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          결제가 어떤 국가와 결제수단에서 들어오는지, 하루 단위로 얼마나 쌓이는지, 이상탐지가 어떤 유형을 얼마나 잡았는지를 한눈에 본다.
          모든 값은 저장된 합성 결제와 알림에서 집계하며, 1분마다 갱신된다.
        </Typography>

        {data?.error && <Alert severity="warning" sx={{ mb: 2 }}>{data.error}</Alert>}

        {data && !data.error && (
          <>
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid size={{ xs: 12, sm: 4 }}>
                <KpiCard label="누적 결제 건수" value={data.totalPayments.toLocaleString("ko-KR")} unit="건" accent="primary" description="지금까지 DB에 저장된 결제 건수" />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <KpiCard label="누적 결제 금액" value={won(data.totalAmount)} accent="success" description="저장된 결제 금액의 합계" />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <KpiCard label="누적 이상탐지 알림" value={data.totalAlerts.toLocaleString("ko-KR")} unit="건" accent="error" description="지금까지 기록된 이상탐지 알림 건수" />
              </Grid>
            </Grid>

            <Grid container spacing={2} sx={{ mb: 2 }}>
              <Grid size={{ xs: 12, md: 6 }}>
                <ChartCard title="국가별 결제 비중" desc="어느 국가에서 결제가 가장 많이 들어오는지 (원형)">
                  {data.countries.length === 0 ? (
                    <Empty />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData(data.countries)} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
                          {data.countries.map((_, i) => (
                            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v, _n, p) => [`${v}건 (${p.payload.percent}%)`, p.payload.name]} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <ChartCard title="결제수단 비중" desc="카드, 간편결제, 계좌이체 중 어떤 수단이 많이 쓰이는지 (도넛)">
                  {data.paymentMethods.length === 0 ? (
                    <Empty />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData(data.paymentMethods)} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={2}>
                          {data.paymentMethods.map((_, i) => (
                            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v, _n, p) => [`${v}건 (${p.payload.percent}%)`, p.payload.name]} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>
              </Grid>
            </Grid>

            <Grid container spacing={2} sx={{ mb: 2 }}>
              <Grid size={{ xs: 12, md: 6 }}>
                <ChartCard title="이상탐지 유형별 건수" desc="고액이상치, 반복요청, 쏠림, TPS 급증, 에러율 상승 중 무엇이 자주 잡혔는지 (막대)">
                  {data.alertTypes.length === 0 ? (
                    <Empty />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.alertTypes.map((a) => ({ name: a.label, 건수: a.count }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.2)" />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Bar dataKey="건수" fill="#FF9900" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <ChartCard title={`최근 ${data.windowDays}일 결제 건수`} desc="하루 단위로 쌓인 결제 건수 (영역)">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.daily.map((d) => ({ date: d.date.slice(5), 건수: d.count }))}>
                      <defs>
                        <linearGradient id="countFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#1A73E8" stopOpacity={0.5} />
                          <stop offset="100%" stopColor="#1A73E8" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.2)" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Area type="monotone" dataKey="건수" stroke="#1A73E8" fill="url(#countFill)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartCard>
              </Grid>
            </Grid>

            <Grid container spacing={2}>
              <Grid size={{ xs: 12 }}>
                <ChartCard title={`최근 ${data.windowDays}일 결제 금액`} desc="하루 단위로 쌓인 결제 금액 (원)">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.daily.map((d) => ({ date: d.date.slice(5), 금액: d.amount }))}>
                      <defs>
                        <linearGradient id="amountFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#34A853" stopOpacity={0.5} />
                          <stop offset="100%" stopColor="#34A853" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.2)" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${Math.round(v / 10000)}만`} />
                      <Tooltip formatter={(v) => won(Number(v))} />
                      <Area type="monotone" dataKey="금액" stroke="#34A853" fill="url(#amountFill)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartCard>
              </Grid>
            </Grid>
          </>
        )}
      </Box>
    </>
  );
}
