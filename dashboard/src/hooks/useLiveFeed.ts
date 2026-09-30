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
  useEffect(() => {
    fetch(`${API_ORIGIN}/ws-server/payments/recent?limit=${MAX_FEED_ITEMS}`)
      .then((res) => res.json())
      .then((json) => {
        const seeded: FeedPaymentItem[] = (json.payments ?? []).map(
          (p: PaymentEvent & { processedAt: string }) => ({
            ...p,
            receivedAt: new Date(p.processedAt).getTime(),
          })
        );
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
  const tpsHistory: number[] = [];
  for (let i = SPARKLINE_WINDOW_SECONDS - 1; i >= 0; i--) {
    tpsHistory.push(bucketsRef.current.get(nowSec - i) ?? 0);
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
