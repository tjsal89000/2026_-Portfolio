// docs/문제해결_로그.md 전문을 번들에 박지 않고, "테스트 코드" 메뉴와 같은 방식으로
// GitHub raw content를 그때그때 불러온다 - 로그에 새 사례를 추가해도 대시보드 재배포 없이
// 항상 최신 커밋 기준으로 보여주기 위함. 여기 목록은 아코디언 제목/태그용 가벼운 메타데이터만
// 사람이 갱신 (testSuites.ts/phases.ts와 같은 철학).
export interface TroubleshootingCase {
  number: number;
  title: string;
  tags: string[];
}

// 새 항목을 로그에 추가할 때마다 여기도 같이 갱신 - 최신순(번호 큰 순)으로 정렬해서 둠.
export const PROJECT_CASES: TroubleshootingCase[] = [
  { number: 11, title: "ws-server가 Postgres 장애 때 조용히 전체 다운됨", tags: ["Node.js", "unhandled rejection", "Express"] },
  { number: 10, title: "Secret을 지워도 실행 중인 Pod는 멀쩡히 돈다", tags: ["Kubernetes", "Secret", "Pod 생명주기"] },
  { number: 9, title: "Postgres 비밀번호를 Secret으로 옮기다가 발견한 진짜 데이터 손상", tags: ["PostgreSQL", "WAL", "PVC", "장애 복구"] },
  { number: 8, title: "opossum 서킷브레이커의 fallback이 \"서킷 open일 때만\"이 아니었음", tags: ["opossum", "서킷브레이커", "vitest"] },
  { number: 7, title: "\"인프라 현황\" 페이지를 만들었더니 진짜 장애를 잡아낸 사례", tags: ["Kubernetes", "livenessProbe", "startupProbe"] },
  { number: 6, title: "Terraform으로 EC2에 k3s 자동 배포 - 순서 버그와 리소스 교착", tags: ["Terraform", "k3s", "스케줄링"] },
  { number: 5, title: "로컬 Vite dev 서버는 안 잡던 타입 에러가 Docker 빌드에서만 터짐", tags: ["Vite", "TypeScript", "Docker"] },
  { number: 4, title: "AI 리포트 에이전트 - 모델명/SDK/과부하 3중 문제", tags: ["Gemini API", "MCP", "google-genai"] },
  { number: 3, title: "MCP 서버가 두 번째 클라이언트부터 \"Already connected\"로 죽음", tags: ["MCP SDK", "Streamable HTTP"] },
  { number: 2, title: "분산 트레이싱(OTel+Tempo) 구축 - 3중으로 겹친 문제", tags: ["OpenTelemetry", "Tempo", "Spring Boot"] },
  { number: 1, title: "Spring Kafka JsonSerializer가 기본 설정으로는 못 쓰는 상태였음", tags: ["Spring Kafka", "Jackson"] },
];

export interface PreviousCompanyCase {
  title: string;
  company?: string;
  markdown: string;
}

// 이전 회사 경험은 내가 알 수 없는 내용이라 비워둠 - 알려주는 대로 여기 채워 넣는다.
export const PREVIOUS_COMPANY_CASES: PreviousCompanyCase[] = [];
