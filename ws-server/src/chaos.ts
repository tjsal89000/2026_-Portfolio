/**
 * 시연용 장애 주입 (트래픽 급증 / Kafka 소비 지연)
 *
 * 누구나 버튼을 누를 수 있다. 대신 서버가 강하게 제한한다.
 *  - CHAOS_ENABLED=true일 때만 동작한다 (끄는 스위치).
 *  - 한 번에 최대 100 TPS, 최대 60초로 잘라낸다. 끝나면 자동으로 멈춘다.
 *  - 주입이 끝난 뒤 1분 동안은 두 기능 모두 다시 실행할 수 없다(쿨다운). 연타해도 부하가 연속으로 쌓이지 않는다.
 */

const ENABLED = process.env.CHAOS_ENABLED === "true";
const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://gateway:8095/api/payments";
// 소비 지연은 db-writer-consumer의 내부 엔드포인트를 쓴다 (nginx에 노출하지 않음)
const CONSUMER_URL = process.env.CONSUMER_URL ?? "http://db-writer-consumer:8081";

export const MAX_TPS = 100;
export const MAX_SECONDS = 60;
export const COOLDOWN_MS = 60_000;

export function isChaosEnabled(): boolean {
  return ENABLED;
}

// 입력이 이상하거나 너무 크면 조용히 허용 범위 안으로 줄인다
export function clampBurst(tps: number, seconds: number): { tps: number; seconds: number } {
  const t = Number.isFinite(tps) ? Math.round(tps) : 30;
  const s = Number.isFinite(seconds) ? Math.round(seconds) : 30;
  return {
    tps: Math.min(MAX_TPS, Math.max(1, t)),
    seconds: Math.min(MAX_SECONDS, Math.max(1, s)),
  };
}

// 실행 종료 시각 + 쿨다운. 트래픽 급증과 소비 지연이 이 값을 공유한다.
let busyUntil = 0;

export function reserveChaos(seconds: number, now: number = Date.now()): { ok: true } | { ok: false; reason: string } {
  if (now < busyUntil) {
    const wait = Math.ceil((busyUntil - now) / 1000);
    return { ok: false, reason: `실행 중이거나 쿨다운 중입니다. ${wait}초 뒤에 다시 시도하세요` };
  }
  busyUntil = now + seconds * 1000 + COOLDOWN_MS;
  return { ok: true };
}

// 실행을 시작하지 못했을 때(연결 실패 등) 예약을 되돌린다
export function releaseChaos(): void {
  busyUntil = 0;
}

export async function pauseConsumer(secondsInput: number): Promise<{ started: boolean; seconds: number; reason?: string }> {
  const seconds = clampBurst(30, secondsInput).seconds;
  const reserved = reserveChaos(seconds);
  if (!reserved.ok) return { started: false, seconds, reason: reserved.reason };
  try {
    const res = await fetch(`${CONSUMER_URL}/internal/consumer/pause?seconds=${seconds}`, { method: "POST" });
    if (!res.ok) throw new Error(`consumer ${res.status}`);
    const json = (await res.json()) as { started: boolean; seconds: number; reason?: string };
    if (!json.started) releaseChaos(); // consumer가 이미 멈춰 있다고 거절한 경우 쿨다운을 걸지 않는다
    return json;
  } catch (err) {
    releaseChaos();
    throw err;
  }
}

function randomPayment() {
  const uuid = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
  return {
    idempotencyKey: uuid,
    merchantId: `merchant-${String(Math.floor(Math.random() * 20)).padStart(3, "0")}`,
    // 한 계좌에 몰리게 해서 "같은 계좌 반복 요청" 패턴도 같이 만든다
    accountId: "acct-00001",
    amount: 1000 + Math.floor(Math.random() * 499000),
    currency: "KRW",
    country: "KR",
    paymentMethod: "CARD",
  };
}

let current: { endsAt: number; timer: ReturnType<typeof setInterval>; stopTimer: ReturnType<typeof setTimeout> } | null = null;

export function chaosStatus() {
  const running = current !== null && current.endsAt > Date.now();
  const cooldownSeconds = Math.max(0, Math.ceil((busyUntil - Date.now()) / 1000));
  return {
    enabled: ENABLED,
    running,
    cooldownSeconds,
    remainingSeconds: running ? Math.ceil((current!.endsAt - Date.now()) / 1000) : 0,
    maxTps: MAX_TPS,
    maxSeconds: MAX_SECONDS,
  };
}

export function startBurst(tpsInput: number, secondsInput: number): { started: boolean; tps: number; seconds: number; reason?: string } {
  const { tps, seconds } = clampBurst(tpsInput, secondsInput);
  if (!ENABLED) return { started: false, tps, seconds, reason: "장애 주입이 꺼져 있습니다" };
  const reserved = reserveChaos(seconds);
  if (!reserved.ok) return { started: false, tps, seconds, reason: reserved.reason };

  // 100ms마다 TPS/10건씩 보낸다
  const perTick = Math.max(1, Math.round(tps / 10));
  const timer = setInterval(() => {
    for (let i = 0; i < perTick; i++) {
      fetch(GATEWAY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(randomPayment()),
      }).catch(() => {
        // 개별 실패로 멈추지 않는다 - 시연의 목적은 부하 자체
      });
    }
  }, 100);

  const stopTimer = setTimeout(() => {
    clearInterval(timer);
    current = null;
  }, seconds * 1000);

  current = { endsAt: Date.now() + seconds * 1000, timer, stopTimer };
  return { started: true, tps, seconds };
}
