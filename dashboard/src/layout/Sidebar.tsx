import { useEffect, useState, type ReactElement } from "react";
import DashboardIcon from "@mui/icons-material/DashboardOutlined";
import TimelineIcon from "@mui/icons-material/TimelineOutlined";
import NotificationsIcon from "@mui/icons-material/NotificationsActiveOutlined";
import NotificationsOffIcon from "@mui/icons-material/NotificationsOffOutlined";
import SummarizeIcon from "@mui/icons-material/SummarizeOutlined";
import ChecklistIcon from "@mui/icons-material/ChecklistOutlined";
import DnsIcon from "@mui/icons-material/DnsOutlined";
import ScienceIcon from "@mui/icons-material/ScienceOutlined";
import SchemaIcon from "@mui/icons-material/SchemaOutlined";
import BuildIcon from "@mui/icons-material/BuildOutlined";
import InsightsIcon from "@mui/icons-material/InsightsOutlined";
import AccountTreeIcon from "@mui/icons-material/AccountTreeOutlined";
import QueryStatsIcon from "@mui/icons-material/QueryStatsOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNewOutlined";
import {
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  Divider,
  Box,
  Switch,
} from "@mui/material";
import { awsColors } from "../theme";
import type { ViewKey } from "../viewKey";
import { API_ORIGIN } from "../apiOrigin";

// 이상탐지 에이전트(Python)의 제어 서버를 nginx가 이 경로로 묶어준 것.
const ALERTS_API_BASE = `${API_ORIGIN}/alerts`;

const DRAWER_WIDTH = 240;

// 개요 화면 안의 세 패널(트래픽/알림/리포트)은 각자 별도 페이지가 아니라 한 화면 안의
// 섹션이라, 이 셋을 눌러도 전부 "개요"로 이동한다 - react-router 없이 App.tsx가 들고 있는
// view 상태 하나로 전환하는 가벼운 방식 (화면이 지금보다 훨씬 늘어나면 그때 라우터를 붙인다).
const NAV_ITEMS: { label: string; icon: ReactElement; view: ViewKey }[] = [
  { label: "개요", icon: <DashboardIcon />, view: "overview" },
  { label: "실시간 트래픽", icon: <TimelineIcon />, view: "overview" },
  { label: "이상탐지 알림", icon: <NotificationsIcon />, view: "overview" },
  { label: "AI 리포트", icon: <SummarizeIcon />, view: "overview" },
  { label: "진행 상황", icon: <ChecklistIcon />, view: "progress" },
  { label: "테스트 코드", icon: <ScienceIcon />, view: "tests" },
  { label: "인프라 현황", icon: <DnsIcon />, view: "infra" },
  { label: "인프라 구성도", icon: <SchemaIcon />, view: "architecture" },
  { label: "트러블슈팅", icon: <BuildIcon />, view: "troubleshooting" },
];

// 이 대시보드 안의 화면이 아니라, nginx가 같은 origin 아래로 묶어준 별개의 도구(운영
// 대시보드/워크플로우/메트릭)로 나가는 링크. 그래서 새 탭으로 열리게 함.
//
// 이전엔 "http://localhost"를 하드코딩했는데, 로컬에서는 문제없이 동작하다 EC2에 배포하니
// 브라우저가 그 주소 그대로(자기 자신의 localhost) 요청을 보내버려서 깨졌다 - API_ORIGIN이
// 항상 "지금 이 페이지를 연 주소"를 반영하므로 이걸 기준으로 링크를 만든다.
const EXTERNAL_TOOLS = [
  // /grafana/만 열면 우리 대시보드가 아니라 Grafana 기본 홈 화면이 뜨므로, 대시보드 UID까지 직접 지정
  { label: "Grafana", icon: <InsightsIcon />, href: `${API_ORIGIN}/grafana/d/payment-aiops-platform/payment-aiops-platform` },
  // n8n은 서브패스(reverse proxy) 배포 자체가 n8n 공식 이슈로 깨지는 경우가 많아
  // (github.com/n8n-io/n8n issues #18596, #19635) nginx가 직접 프록시하지 않고 자기 포트로
  // 302 리다이렉트만 해준다(observability/nginx.conf, k8s/nginx.yaml의 /n8n/ 위치 참고) -
  // 그래서 여기서도 n8n의 실제 포트를 몰라도 되고, 그냥 같은 origin의 /n8n/으로 보내면 된다.
  { label: "n8n 워크플로우", icon: <AccountTreeIcon />, href: `${API_ORIGIN}/n8n/` },
  { label: "Prometheus", icon: <QueryStatsIcon />, href: `${API_ORIGIN}/prometheus/` },
];

interface SidebarProps {
  view: ViewKey;
  onNavigate: (view: ViewKey) => void;
  // 모바일 폭에서는 항상 떠있는 permanent Drawer 대신, 평소엔 숨어있다가 TopBar의 햄버거
  // 버튼으로 열고 닫는 temporary Drawer로 바뀐다 (MUI 공식 "반응형 Drawer" 패턴).
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export default function Sidebar({ view, onNavigate, mobileOpen, onMobileClose }: SidebarProps) {
  const [alertsEnabled, setAlertsEnabled] = useState(true);

  useEffect(() => {
    fetch(`${ALERTS_API_BASE}/status`)
      .then((res) => res.json())
      .then((data) => setAlertsEnabled(data.enabled))
      .catch(() => {
        // 이상탐지 에이전트가 아직 안 떠있어도 대시보드 자체는 그대로 보여야 함
      });
  }, []);

  const handleToggle = async (checked: boolean) => {
    setAlertsEnabled(checked); // 낙관적 업데이트
    try {
      await fetch(`${ALERTS_API_BASE}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: checked }),
      });
    } catch {
      setAlertsEnabled(!checked); // 요청 실패 시 원래 상태로 되돌림
    }
  };

  // 모바일에서는 메뉴 하나 고르면 Drawer가 화면 전체를 덮고 있던 상태이니 자동으로 닫아준다 -
  // 데스크탑(permanent)에서는 onMobileClose가 애초에 아무 의미 없어서 호출해도 무해함.
  const handleNavigate = (v: ViewKey) => {
    onNavigate(v);
    onMobileClose();
  };

  const drawerContent = (
    <>
      <Toolbar>
        <Typography variant="subtitle1" noWrap sx={{ fontWeight: 700 }}>
          AIOps 결제 플랫폼
        </Typography>
      </Toolbar>
      <List sx={{ px: 1 }}>
        {NAV_ITEMS.map((item) => (
          <ListItemButton
            key={item.label}
            selected={item.view === view}
            onClick={() => handleNavigate(item.view)}
            sx={{
              borderRadius: 1,
              mb: 0.5,
              color: "#D5DBDB",
              "&.Mui-selected": {
                backgroundColor: "rgba(255, 153, 0, 0.16)",
                color: "#FFFFFF",
                borderLeft: "3px solid #FF9900",
              },
              "&:hover": { backgroundColor: "rgba(255,255,255,0.08)" },
            }}
          >
            <ListItemIcon sx={{ color: "inherit", minWidth: 36 }}>
              {item.icon}
            </ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        ))}
      </List>

      <Divider sx={{ borderColor: "rgba(255,255,255,0.12)", mx: 2, my: 1 }} />
      <Typography
        variant="caption"
        sx={{ px: 3, py: 0.5, color: "#8B98A5", letterSpacing: ".05em" }}
      >
        운영 도구
      </Typography>
      <List sx={{ px: 1 }}>
        {EXTERNAL_TOOLS.map((item) => (
          <ListItemButton
            key={item.label}
            component="a"
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              borderRadius: 1,
              mb: 0.5,
              color: "#D5DBDB",
              "&:hover": { backgroundColor: "rgba(255,255,255,0.08)" },
            }}
          >
            <ListItemIcon sx={{ color: "inherit", minWidth: 36 }}>
              {item.icon}
            </ListItemIcon>
            <ListItemText primary={item.label} />
            <OpenInNewIcon sx={{ fontSize: 16, color: "#8B98A5" }} />
          </ListItemButton>
        ))}
      </List>

      <Divider sx={{ borderColor: "rgba(255,255,255,0.12)", mx: 2, my: 1 }} />
      <Typography
        variant="caption"
        sx={{ px: 3, py: 0.5, color: "#8B98A5", letterSpacing: ".05em" }}
      >
        알림 설정
      </Typography>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 0.5,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "#D5DBDB" }}>
          {alertsEnabled ? (
            <NotificationsIcon sx={{ fontSize: 18 }} />
          ) : (
            <NotificationsOffIcon sx={{ fontSize: 18, color: "#8B98A5" }} />
          )}
          <Typography variant="body2">Slack 알림</Typography>
        </Box>
        <Switch
          size="small"
          checked={alertsEnabled}
          onChange={(e) => handleToggle(e.target.checked)}
        />
      </Box>
    </>
  );

  const paperSx = {
    width: DRAWER_WIDTH,
    boxSizing: "border-box" as const,
    backgroundColor: awsColors.squidInk,
    color: "#FFFFFF",
  };

  return (
    <Box component="nav" sx={{ width: { sm: DRAWER_WIDTH }, flexShrink: { sm: 0 } }}>
      {/* 모바일: 평소엔 안 보이고 TopBar 햄버거로 열고 닫는 오버레이 Drawer */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onMobileClose}
        ModalProps={{ keepMounted: true }} // 다시 열 때 매번 새로 마운트하지 않아서 더 빠름
        sx={{
          display: { xs: "block", sm: "none" },
          [`& .MuiDrawer-paper`]: paperSx,
        }}
      >
        {drawerContent}
      </Drawer>

      {/* 데스크탑: 항상 떠있는 고정 Drawer */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: "none", sm: "block" },
          [`& .MuiDrawer-paper`]: paperSx,
        }}
        open
      >
        {drawerContent}
      </Drawer>
    </Box>
  );
}

export { DRAWER_WIDTH };
