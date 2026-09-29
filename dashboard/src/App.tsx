import { useState } from "react";
import { Box } from "@mui/material";
import Sidebar, { DRAWER_WIDTH } from "./layout/Sidebar";
import TopBar from "./layout/TopBar";
import OverviewPage from "./pages/OverviewPage";
import ProgressPage from "./pages/ProgressPage";
import InfraPage from "./pages/InfraPage";
import type { ViewKey } from "./viewKey";

export default function App() {
  const [view, setView] = useState<ViewKey>("overview");

  return (
    <Box sx={{ display: "flex" }}>
      <Sidebar view={view} onNavigate={setView} />
      <TopBar />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          ml: `${DRAWER_WIDTH}px`,
          bgcolor: "background.default",
          minHeight: "100vh",
        }}
      >
        {view === "overview" && <OverviewPage />}
        {view === "progress" && <ProgressPage />}
        {view === "infra" && <InfraPage />}
      </Box>
    </Box>
  );
}
