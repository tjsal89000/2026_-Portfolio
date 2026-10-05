import { describe, expect, it, vi } from "vitest";

const ec2Send = vi.fn();
vi.mock("@aws-sdk/client-ec2", () => ({
  EC2Client: vi.fn().mockImplementation(function () {
    return { send: ec2Send };
  }),
  DescribeInstancesCommand: vi.fn(),
}));

const listNamespacedPod = vi.fn();
vi.mock("@kubernetes/client-node", () => ({
  KubeConfig: vi.fn().mockImplementation(function () {
    return {
      loadFromDefault: vi.fn(),
      makeApiClient: () => ({ listNamespacedPod }),
    };
  }),
  CoreV1Api: vi.fn(),
}));

describe("listEc2Instances", () => {
  it("terminated 인스턴스는 제외하고, Name 태그가 없으면 빈 문자열로 채운다", async () => {
    ec2Send.mockResolvedValue({
      Reservations: [
        {
          Instances: [
            {
              InstanceId: "i-1",
              InstanceType: "t3.large",
              State: { Name: "running" },
              Tags: [{ Key: "Name", Value: "aiops-platform" }],
              PublicIpAddress: "1.2.3.4",
              LaunchTime: new Date("2026-01-01T00:00:00.000Z"),
            },
            {
              InstanceId: "i-2",
              InstanceType: "t3.micro",
              State: { Name: "terminated" },
              Tags: [],
            },
            {
              InstanceId: "i-3",
              InstanceType: "t3.micro",
              State: { Name: "stopped" },
              // Tags/PublicIpAddress/LaunchTime 자체가 없는 경우 - AWS 응답에서 흔한 케이스
            },
          ],
        },
      ],
    });

    const { listEc2Instances } = await import("./infra.js");
    const result = await listEc2Instances();

    expect(result).toEqual([
      {
        instanceId: "i-1",
        name: "aiops-platform",
        instanceType: "t3.large",
        state: "running",
        publicIp: "1.2.3.4",
        launchTime: "2026-01-01T00:00:00.000Z",
      },
      {
        instanceId: "i-3",
        name: "",
        instanceType: "t3.micro",
        state: "stopped",
        publicIp: null,
        launchTime: null,
      },
    ]);
  });
});

describe("listPods", () => {
  it("컨테이너 상태를 ready 개수/재시작 합계로 집계한다", async () => {
    listNamespacedPod.mockResolvedValue({
      // v2 클라이언트는 응답을 body로 감싸지 않으므로 items를 바로 둔다
      items: [
          {
            metadata: { name: "payment-api-abc" },
            status: {
              phase: "Running",
              startTime: "2026-01-01T00:00:00.000Z",
              containerStatuses: [
                { ready: true, restartCount: 0 },
                { ready: false, restartCount: 3 },
              ],
            },
            spec: { nodeName: "node-1" },
          },
          {
            // status/spec 자체가 없는 경우(막 생성 직후 등) - 기본값으로 방어됐는지 확인
            metadata: { name: "pending-pod" },
          },
        ],
    });

    const { listPods } = await import("./infra.js");
    const result = await listPods();

    expect(result).toEqual([
      {
        name: "payment-api-abc",
        phase: "Running",
        ready: "1/2",
        restarts: 3,
        node: "node-1",
        startTime: "2026-01-01T00:00:00.000Z",
      },
      {
        name: "pending-pod",
        phase: "Unknown",
        ready: "0/0",
        restarts: 0,
        node: "",
        startTime: null,
      },
    ]);
  });
});
