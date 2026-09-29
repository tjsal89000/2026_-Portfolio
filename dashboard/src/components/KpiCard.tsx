import { Box, Card, CardContent, Typography, useTheme } from "@mui/material";

interface KpiCardProps {
  label: string;
  value: string;
  unit?: string;
  // 색상 hex를 직접 넘기지 않고 팔레트의 의미(semantic) 키로 받음
  // -> 라이트/다크 모드가 바뀌어도 이 컴포넌트가 항상 theme에 맞는 색을 골라 씀
  accent?: "primary" | "success" | "error" | "warning";
}

// 반복되는 지표 카드는 "같은 틀에 값만 다르게" 찍어내는 방식으로 만든다.
// (여러 개 나열될 예정이라 여백/폰트 크기를 여기서 한 번만 정하면 전체가 통일됨)
export default function KpiCard({ label, value, unit, accent = "primary" }: KpiCardProps) {
  const theme = useTheme();
  const accentColor = theme.palette[accent].main;

  return (
    <Card
      variant="outlined"
      sx={{
        borderLeft: `4px solid ${accentColor}`,
        height: "100%",
      }}
    >
      <CardContent>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {label}
        </Typography>
        <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.5 }}>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            {value}
          </Typography>
          {unit && (
            <Typography variant="body2" color="text.secondary">
              {unit}
            </Typography>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
