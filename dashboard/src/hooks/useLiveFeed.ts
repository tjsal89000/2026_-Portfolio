import { useEffect, useRef, useState } from "react";
import { API_ORIGIN, WS_ORIGIN } from "../apiOrigin";

export interface PaymentEvent {
  idempotencyKey: string;
  accountId: string;
  amount: number;
  country: string;
  paymentMethod: string;
  status: "APPROVED" | "DUPLICATE" | "FAILED";
}

export interface AlertEvent {
  type: string;
  detail: Record<string, unknown>;
  detectedAt: number;
  // n8n 중계 워크플로우가 붙이는 표시. 이 값이 있으면 이상탐지 알림이 n8n을 거쳐 온 것이다
  via?: string;
  relayedAt?: string;
}

interface FeedPaymentItem extends PaymentEvent {
  receivedAt: number;
}
interface FeedAlertItem extends AlertEvent {
  receivedAt: number;
}

// nginx가 "/ws-server/" 프리픽스를 벗겨서 ws-server 자신의 "/ws" 경로로 그대로 전달한다
// (관측성 스택 전체와 같은 "하나의 주소로 묶기" 원칙). 주소 자체는 apiOrigin.ts 참고.
const WS_URL = `${WS_ORIGIN}/ws-server/ws`;
const MAX_FEED_ITEMS = 20;
const SPARKLINE_WINDOW_SECONDS = 60;
const RECENT_WINDOW_MS = 60_000;

export function useLiveFeed() {
  const [payments, setPayments] = useState<FeedPaymentItem[]>([]);
  const [alerts, setAlerts] = useState<FeedAlertItem[]>([]);
  const [connected, setConnected] = useState(false);
  // 초당 버킷은 ref로 들고 있다가(리렌더를 안 일으킴) 별도 1초 타이머로만 리렌더를 트리거한다 -
  // 결제 이벤트가 초당 여러 건 들어올 때마다 스파크라인을 매번 다시 그리지 않기 위함.
  const bucketsRef = useRef<Map<number, number>>(new Map());
  const [, setTick] = useState(0);

  // 새로고침해도 "실시간 트래픽 플로우"가 텅 비어 보이지 않도록, 마운트 시 DB(payments
  // 테이블)에서 최근 내역을 가져와 초기값으로 채운다. 그 사이 WebSocket으로 이미 들어온
  // 항목이 있으면(둘 다 마운트 시 동시에 시작되는 별개의 effect라 순서를 보장 못 함)
  // idempotencyKey로 중복만 걸러내고 실시간 쪽을 우선한다.
  //
  // 리스트에 보여줄 개수(MAX_FEED_ITEMS=20)만큼만 가져오면 스파크라인의 60초 창을 채우기엔
  // 턱없이 부족하다(TPS 5 기준 20건은 4초 분량) - 그래프용으로는 훨씬 넉넉히 가져와서
  // 초당 버킷(bucketsRef)을 직접 채우고, 리스트 표시는 그중 최근 것만 자른다.
  const SPARKLINE_HYDRATE_LIMIT = 500;
  useEffect(() => {
    fetch(`${API_ORIGIN}/ws-server/payments/recent?limit=${SPARKLINE_HYDRATE_LIMIT}`)
      .then((res) => res.json())
      .then((json) => {
        const rows: (PaymentEvent & { processedAt: string })[] = json.payments ?? [];
        if (rows.length === 0) return;

        const nowSecAtLoad = Math.floor(Date.now() / 1000);
        const buckets = bucketsRef.current;
        for (const row of rows) {
          const second = Math.floor(new Date(row.processedAt).getTime() / 1000);
          if (second < nowSecAtLoad - SPARKLINE_WINDOW_SECONDS) continue; // 그래프 창 밖이면 스킵
          buckets.set(second, (buckets.get(second) ?? 0) + 1);
        }

        const seeded: FeedPaymentItem[] = rows
          .slice(0, MAX_FEED_ITEMS)
          .map((p) => ({ ...p, receivedAt: new Date(p.processedAt).getTime() }));
        setPayments((prev) => {
          const existingKeys = new Set(prev.map((p) => p.idempotencyKey));
          return [...prev, ...seeded.filter((p) => !existingKeys.has(p.idempotencyKey))].slice(
            0,
            MAX_FEED_ITEMS
          );
        });
      })
      .catch(() => {
        // ws-server가 아직 안 떠있어도 대시보드 자체는 그대로 보여야 함
      });
  }, []);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data) as { type: string; data: unknown };
      const now = Date.now();
      if (msg.type === "payment") {
        setPayments((prev) => [{ ...(msg.data as PaymentEvent), receivedAt: now }, ...prev].slice(0, MAX_FEED_ITEMS));
        const second = Math.floor(now / 1000);
        const buckets = bucketsRef.current;
        buckets.set(second, (buckets.get(second) ?? 0) + 1);
        for (const key of buckets.keys()) {
          if (key < second - SPARKLINE_WINDOW_SECONDS) buckets.delete(key);
        }
      } else if (msg.type === "alert") {
        setAlerts((prev) => [{ ...(msg.data as AlertEvent), receivedAt: now }, ...prev].slice(0, MAX_FEED_ITEMS));
      }
    };
    return () => ws.close();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const nowSec = Math.floor(Date.now() / 1000);
  // 그래프에 X축(시각) 라벨/툴팁을 정확히 그리려면 값뿐 아니라 "몇 초 시점인지"가 같이
  // 필요해서, 단순 숫자 배열이 아니라 {second, count} 쌍으로 내려준다.
  const tpsHistory: { second: number; count: number }[] = [];
  for (let i = SPARKLINE_WINDOW_SECONDS - 1; i >= 0; i--) {
    const second = nowSec - i;
    tpsHistory.push({ second, count: bucketsRef.current.get(second) ?? 0 });
  }

  let recentCount = 0;
  for (let i = 0; i < 10; i++) {
    recentCount += bucketsRef.current.get(nowSec - i) ?? 0;
  }
  const currentTps = recentCount / 10;

  const recentPayments = payments.filter((p) => Date.now() - p.receivedAt < RECENT_WINDOW_MS);
  const recentErrors = recentPayments.filter((p) => p.status === "FAILED");
  const errorRate = recentPayments.length > 0 ? (recentErrors.length / recentPayments.length) * 100 : 0;
  const activeAlerts = alerts.filter((a) => Date.now() - a.receivedAt < 5 * 60_000).length;

  return { payments, alerts, connected, tpsHistory, currentTps, errorRate, activeAlerts };
}
