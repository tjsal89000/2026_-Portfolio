import { createTheme, type PaletteMode } from "@mui/material/styles";

// AWS 콘솔의 색감(진한 남색 "Squid Ink" + 오렌지 포인트)을 라이트/다크 공통으로 가져다 쓰는 팔레트.
// 사이드바는 원래 다크 네이비라서 라이트/다크 모드 둘 다 같은 색을 쓰고,
// 상단바/본문/카드처럼 "배경이 뒤집혀야 하는 영역"만 mode에 따라 달라진다.
export const awsColors = {
  squidInk: "#232F3E", // 사이드바 배경 (라이트/다크 공통)
  squidInkDark: "#16191F",
  orange: "#FF9900", // 포인트 컬러 (라이트/다크 공통)
  lightBg: "#F2F3F3",
  border: "#E9EBED",
  darkBg: "#0F1416", // 다크 모드 콘텐츠 배경
  darkPaper: "#161E2D", // 다크 모드 카드/패널 배경
  darkBorder: "#2A3441",
};

// mode(light/dark)를 받아서 테마를 만들어주는 함수로 바꿈 - 토글 시 이 함수를 다시 호출해서
// createTheme을 새로 만들면, MUI 컴포넌트들이 palette.mode를 보고 자동으로 색을 재조정해줌.
export function createAppTheme(mode: PaletteMode) {
  const isDark = mode === "dark";

  return createTheme({
    palette: {
      mode,
      primary: {
        main: awsColors.orange,
        contrastText: "#16191F",
      },
      secondary: {
        main: awsColors.squidInk,
      },
      background: {
        default: isDark ? awsColors.darkBg : awsColors.lightBg,
        paper: isDark ? awsColors.darkPaper : "#FFFFFF",
      },
      divider: isDark ? awsColors.darkBorder : awsColors.border,
      success: { main: isDark ? "#4ADE80" : "#1D8102" },
      error: { main: isDark ? "#F87171" : "#D13212" },
      warning: { main: awsColors.orange },
      // text 키 자체를 라이트 모드에선 아예 안 넣음 (undefined를 넣으면
      // MUI가 기본 text 팔레트를 덮어써버려서 CssBaseline이 theme.palette.text.primary를
      // 못 읽고 죽는 버그가 있었음 - 키를 생략해야 MUI 기본값이 그대로 살아남음)
      ...(isDark && { text: { primary: "#E9EBED", secondary: "#9BA7B4" } }),
    },
    typography: {
      fontFamily: [
        "Amazon Ember",
        "-apple-system",
        "Roboto",
        "Segoe UI",
        "sans-serif",
      ].join(","),
      h6: { fontWeight: 700 },
    },
    shape: {
      borderRadius: 8,
    },
  });
}
