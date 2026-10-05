/**
 * 장애 주입 (트래픽 급증 시연)
 *
 * 목적: "트래픽이 급증하면 이상탐지가 잡고, 알림과 리포트가 남는다"를 면접 중에 실제로 보여준다.
 *
 * 안전장치
 *  - CHAOS_ENABLED=true일 때만 동작한다. 기본값은 꺼짐이고, 꺼져 있으면 버튼 자체가 대시보드에 나오지 않는다.
 *  - 한 번에 최대 100 TPS, 최대 60초로 잘라낸다. 끝나면 자동으로 멈춘다.
 *  - 동시에 하나만 실행된다.
 * 켜는 방법: k8s/ws-server.yaml의 CHAOS_ENABLED를 "true"로 바꾸고 apply. 면접이 끝나면 다시 "false".
 */

import { createHash, timingSafeEqual } from "node:crypto";

const ENABLED = process.env.CHAOS_ENABLED === "true";
// 비밀번호는 코드에 두지 않는다. k8s Secret(chaos-secrets)에서 환경변수로만 받는다.
const PASSWORD = process.env.CHAOS_PASSWORD ?? "";
const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://gateway:8095/api/payments";

export const MAX_TPS = 100;
export const MAX_SECONDS = 60;

// 무작위 대입을 막기 위해, 10분 안에 틀린 입력이 5번 쌓이면 그 기간 동안 맞는 비밀번호도 거부한다.
const LOCK_WINDOW_MS = 10 * 60_000;
const MAX_FAILURES = 5;
let failureTimes: number[] = [];

export type PasswordCheck = "ok" | "wrong" | "locked" | "disabled";

// 입력과 비밀번호를 SHA-256 해시로 바꿔서 비교한다. 해시 길이가 같아서 timingSafeEqual을 쓸 수 있고,
// 어느 글자에서 틀렸는지 응답 시간으로 새는 것을 막는다.
// requireEnabled=false면 CHAOS_ENABLED와 무관하게 비밀번호만 본다 (리포트 생성 보호처럼 장애 주입과 별개로 쓰는 경우)
export function checkPassword(input: unknown, requireEnabled = true): PasswordCheck {
  if ((requireEnabled && !ENABLED) || PASSWORD === "") return "disabled";

  const now = Date.now();
  failureTimes = failureTimes.filter((t) => now - t < LOCK_WINDOW_MS);
  if (failureTimes.length >= MAX_FAILURES) return "locked";

  const given = createHash("sha256").update(String(input ?? "")).digest();
  const expected = createHash("sha256").update(PASSWORD).digest();
  if (timingSafeEqual(given, expected)) return "ok";

  failureTimes.push(now);
  return "wrong";
}

// 입력이 이상하거나 너무 크면 조용히 허용 범위 안으로 줄인다 (에러로 멈추지 않고 실제로 걸리는 값을 알려준다)
export function clampBurst(tps: number, seconds: number): { tps: number; seconds: number } {
  const t = Number.isFinite(tps) ? Math.round(tps) : 30;
  const s = Number.isFinite(seconds) ? Math.round(seconds) : 30;
  return {
    tps: Math.min(MAX_TPS, Math.max(1, t)),
    seconds: Math.min(MAX_SECONDS, Math.max(1, s)),
  };
}

// 시연용 소비 지연: db-writer-consumer를 지정한 시간만큼 멈춘다. 같은 비밀번호 검사를 통과한 요청에서만 호출된다.
const CONSUMER_URL = process.env.CONSUMER_URL ?? "http://db-writer-consumer:8081";

export async function pauseConsumer(secondsInput: number): Promise<{ started: boolean; seconds: number; reason?: string }> {
  const seconds = clampBurst(30, secondsInput).seconds;
  const res = await fetch(`${CONSUMER_URL}/internal/consumer/pause?seconds=${seconds}`, { method: "POST" });
  if (!res.ok) throw new Error(`consumer ${res.status}`);
  return (await res.json()) as { started: boolean; seconds: number; reason?: string };
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
  return {
    // 비밀번호까지 설정돼 있어야 실제로 실행 가능하다. 화면에는 "비밀번호 필요" 여부만 알려준다.
    enabled: ENABLED && PASSWORD !== "",
    requiresPassword: true,
    running,
    remainingSeconds: running ? Math.ceil((current!.endsAt - Date.now()) / 1000) : 0,
    maxTps: MAX_TPS,
    maxSeconds: MAX_SECONDS,
  };
}

export function startBurst(tpsInput: number, secondsInput: number): { started: boolean; tps: number; seconds: number; reason?: string } {
  const { tps, seconds } = clampBurst(tpsInput, secondsInput);
  if (!ENABLED) return { started: false, tps, seconds, reason: "장애 주입이 꺼져 있습니다" };
  if (current && current.endsAt > Date.now()) return { started: false, tps, seconds, reason: "이미 실행 중입니다" };

  // 100ms마다 TPS/10건씩 보낸다 (초당 TPS건을 10번으로 나눠 흩뿌림)
  const perTick = Math.max(1, Math.round(tps / 10));
  const timer = setInterval(() => {
    for (let i = 0; i < perTick; i++) {
      fetch(GATEWAY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(randomPayment()),
      }).catch(() => {
        // 실패한 요청은 세지 않는다 - 시연의 목적은 부하 자체라서 개별 실패로 멈추지 않는다
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
