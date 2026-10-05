/**
 * 인시던트 타임라인
 *
 * 이상탐지 알림은 Redis Pub/Sub으로만 흘러가서 저장되지 않았다. 그래서 타임라인을 만들려면
 * 알림을 받는 시점에 DB에 남겨야 한다. 저장 지점을 ws-server로 잡은 이유: 이미 Redis 구독자이면서
 * Postgres 접근도 하고 있어서, 이상탐지 에이전트나 게이트웨이를 고치지 않아도 된다.
 * AI 리포트는 원래 reports 테이블에 쌓이므로 알림과 같은 시간축에 합쳐서 보여준다.
 *
 * 각 알림에는 "무슨 일인지(원인), 어떤 값이 근거인지, 무엇을 확인할지(조치)"를 붙인다.
 * 임계값은 agents/anomaly-detector의 탐지 규칙과 같은 숫자를 쓴다. 규칙이 바뀌면 여기도 같이 고친다.
 */

import pg from "pg";

const pool = new pg.Pool({
  host: process.env.POSTGRES_HOST ?? "localhost",
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  user: process.env.POSTGRES_USER ?? "aiops",
  password: process.env.POSTGRES_PASSWORD, // 기본값 없음: k8s Secret이나 로컬 환경변수에서만 받는다
  database: process.env.POSTGRES_DB ?? "aiops_db",
});

export async function ensureAlertTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS alert_log (
      id          BIGSERIAL PRIMARY KEY,
      alert_type  TEXT NOT NULL,
      payload     JSONB NOT NULL,
      received_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

export async function saveAlert(payload: unknown): Promise<void> {
  const body = (payload ?? {}) as { type?: unknown };
  const alertType = typeof body.type === "string" ? body.type : "알림";
  await pool.query("INSERT INTO alert_log (alert_type, payload) VALUES ($1, $2)", [
    alertType,
    JSON.stringify(payload ?? {}),
  ]);
}

export interface AlertExplanation {
  cause: string; // 무슨 일이 있었는지 (한 문장)
  evidence: string[]; // 판단 근거가 된 값들
  action: string; // 무엇을 확인할지
}

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;

// 이상 유형별 설명. 기준값은 탐지 코드와 같다 (고액 500만원, 반복 10초 5회, 쏠림 20건 중 50%, TPS 3배, 에러율 5%)
export function describeAlert(type: string, detail: Record<string, unknown>): AlertExplanation {
  const d = detail ?? {};
  switch (type) {
    case "고액이상치": {
      const amount = Number(d.amount ?? 0);
      return {
        cause: `단일 결제 금액 ${won(amount)}이 기준 500만원을 넘었습니다`,
        evidence: [`계좌 ${d.accountId ?? "-"}`, `국가 ${d.country ?? "-"}`],
        action: "해당 계좌의 이 결제 승인과 한도 설정을 확인하고, 같은 계좌의 다음 결제도 함께 본다",
      };
    }
    case "반복요청": {
      const count = Number(d["최근10초_요청수"] ?? 0);
      return {
        cause: `같은 계좌에서 10초 안에 ${count}건의 요청이 들어왔습니다 (기준 5건)`,
        evidence: [`계좌 ${d.accountId ?? "-"}`],
        action: "클라이언트의 재시도 간격과 멱등성 키 생성을 확인하고, 계좌별 요청 제한을 검토한다",
      };
    }
    case "쏠림": {
      const ratio = String(d["최근20건_비중"] ?? "-");
      return {
        cause: `최근 20건 중 ${d.값 ?? "-"}(${d.구분 ?? "-"})이 ${ratio}을 차지했습니다 (기준 50%)`,
        evidence: [`구분 ${d.구분 ?? "-"}`, `값 ${d.값 ?? "-"}`, `비중 ${ratio}`],
        action: "해당 국가나 결제수단의 승인 성공률과 지연을 확인하고, 이벤트성 유입인지 공격인지 구분한다",
      };
    }
    case "TPS_급증": {
      return {
        cause: "최근 10초 처리량이 평소(60초 평균)의 3배 이상으로 늘었습니다",
        evidence: [`현재 ${d.현재TPS ?? "-"} TPS`, `평소 ${d.평소TPS ?? "-"} TPS`],
        action: "실제 유입인지 시연 주입인지 확인하고, API와 Kafka의 처리 지연을 본다",
      };
    }
    case "에러율_상승": {
      return {
        cause: `최근 10초 에러율이 ${d["최근10초_에러율(%)"] ?? "-"}%로 기준 5%를 넘었습니다`,
        evidence: [`처리 ${d.처리건수 ?? "-"}건`, `에러 ${d.에러건수 ?? "-"}건`],
        action: "에러가 나는 단계(API, Kafka, DB)를 Tempo trace와 로그에서 확인한다",
      };
    }
    default:
      return {
        cause: "정의되지 않은 이상 유형입니다",
        evidence: [],
        action: "원본 알림 내용을 확인한다",
      };
  }
}

export interface TimelineEvent {
  kind: "alert" | "report";
  title: string;
  at: string; // ISO 시각
  cause: string;
  evidence: string[];
  action: string;
  viaN8n: boolean; // n8n 중계를 거쳐 들어왔는지
  summary?: string; // 리포트 본문 (리포트만)
}

interface TimelineRow {
  kind: "alert" | "report";
  title: string;
  detail: string | null;
  at: Date;
}

// DB 행을 화면 모양으로 바꾼다. 알림 본문(JSON 문자열)을 풀어서 원인과 근거를 붙인다.
export function mapTimelineRow(row: TimelineRow): TimelineEvent {
  const at = new Date(row.at).toISOString();

  if (row.kind === "report") {
    const summary = row.detail ?? "";
    return {
      kind: "report",
      // 리포트 첫 줄은 마크다운 제목(## ...)이라 기호를 떼고 글자만 쓴다
      title: row.title.replace(/^#+\s*/, ""),
      at,
      cause: "AI가 결제 지표와 로그를 종합해 작성한 운영 리포트입니다",
      evidence: [],
      action: "요약의 이상 징후 항목을 실시간 모니터링 화면과 대조해 본다",
      viaN8n: false,
      summary,
    };
  }

  let payload: { type?: string; detail?: Record<string, unknown>; via?: string } = {};
  try {
    payload = JSON.parse(row.detail ?? "{}");
  } catch {
    payload = {};
  }
  const type = payload.type ?? row.title;
  const explanation = describeAlert(type, payload.detail ?? {});
  return {
    kind: "alert",
    title: type,
    at,
    ...explanation,
    viaN8n: payload.via === "n8n",
  };
}

export async function getTimeline(limit = 30): Promise<TimelineEvent[]> {
  // 두 테이블의 시각 타입이 다를 수 있어서 둘 다 timestamptz로 맞춘 뒤 합친다
  const result = await pool.query<TimelineRow>(
    `SELECT * FROM (
       SELECT 'alert'::text AS kind,
              alert_type AS title,
              payload::text AS detail,
              received_at::timestamptz AS at
         FROM alert_log
       UNION ALL
       SELECT 'report'::text AS kind,
              COALESCE(NULLIF(split_part(summary, E'\\n', 1), ''), 'AI 리포트') AS title,
              summary AS detail,
              generated_at::timestamptz AS at
         FROM reports
     ) t
     ORDER BY at DESC
     LIMIT $1`,
    [limit],
  );
  return result.rows.map(mapTimelineRow);
}
