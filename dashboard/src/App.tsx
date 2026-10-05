import { lazy, Suspense, useState } from "react";
import { Box, CircularProgress } from "@mui/material";
import Sidebar, { DRAWER_WIDTH } from "./layout/Sidebar";
import TopBar from "./layout/TopBar";
import OverviewPage from "./pages/OverviewPage";
import AboutPage from "./pages/AboutPage";
import type { ViewKey } from "./viewKey";

// 기본 화면(실시간 모니터링)만 바로 불러오고, 나머지 메뉴는 누를 때 따로 받는다.
// 이전에는 모든 화면과 차트 라이브러리가 한 파일(620kB)로 묶여서 첫 화면이 무겁게 떴다.
const OpsPage = lazy(() => import("./pages/OpsPage"));
const ProgressPage = lazy(() => import("./pages/ProgressPage"));
const InfraPage = lazy(() => import("./pages/InfraPage"));
const TestsPage = lazy(() => import("./pages/TestsPage"));
const ArchitecturePage = lazy(() => import("./pages/ArchitecturePage"));
const TroubleshootingPage = lazy(() => import("./pages/TroubleshootingPage"));

export default function App() {
  // 방문하면 소개 화면부터 보여준다 (실시간 모니터링은 메뉴에서 선택)
  const [view, setView] = useState<ViewKey>("about");
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <Box sx={{ display: "flex" }}>
      <Sidebar
        view={view}
        onNavigate={setView}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <TopBar onMenuClick={() => setMobileOpen(true)} />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          ml: { xs: 0, sm: `${DRAWER_WIDTH}px` },
          bgcolor: "background.default",
          minHeight: "100vh",
        }}
      >
        <Suspense
          fallback={
            <Box sx={{ display: "flex", justifyContent: "center", mt: 12 }}>
              <CircularProgress />
            </Box>
          }
        >
          {view === "about" && <AboutPage />}
          {view === "overview" && <OverviewPage />}
          {view === "ops" && <OpsPage />}
          {view === "progress" && <ProgressPage />}
          {view === "tests" && <TestsPage />}
          {view === "infra" && <InfraPage />}
          {view === "architecture" && <ArchitecturePage />}
          {view === "troubleshooting" && <TroubleshootingPage />}
        </Suspense>
      </Box>
    </Box>
  );
}
