/**
 * 인프라 현황 조회 - "지금 돌아가는 컨테이너/EC2"를 대시보드에 보여주기 위한 부분.
 *
 * 둘 다 정적 키를 코드/설정에 넣지 않고, 각 환경이 이미 제공하는 신원증명을 그대로 쓴다:
 * - EC2: AWS SDK의 기본 자격증명 체인이 EC2 인스턴스 프로파일(IAM Role)을 자동으로 찾아 쓴다.
 *   로컬에서 띄우면 `aws configure`로 이미 설정된 자격증명을 그대로 재사용한다.
 * - k8s Pod: @kubernetes/client-node의 loadFromDefault()가 클러스터 안에서 실행 중이면
 *   Pod에 자동 마운트되는 ServiceAccount 토큰을 쓰고, 로컬이면 ~/.kube/config를 쓴다.
 * 둘 다 이 서비스가 실제로 배포된 환경이 아니면(로컬 개발 등) 조용히 빈 배열/에러를 반환하고,
 * 그 경우 사용 쪽(index.ts)에서 그대로 흘려보내 대시보드가 "정보 없음" 정도로만 보여주게 한다.
 */

import { EC2Client, DescribeInstancesCommand } from "@aws-sdk/client-ec2";
import { CoreV1Api, KubeConfig } from "@kubernetes/client-node";

export interface Ec2InstanceInfo {
  instanceId: string;
  name: string;
  instanceType: string;
  state: string;
  publicIp: string | null;
  launchTime: string | null;
}

export async function listEc2Instances(): Promise<Ec2InstanceInfo[]> {
  const client = new EC2Client({ region: process.env.AWS_REGION ?? "ap-northeast-2" });
  const result = await client.send(new DescribeInstancesCommand({}));

  const instances: Ec2InstanceInfo[] = [];
  for (const reservation of result.Reservations ?? []) {
    for (const instance of reservation.Instances ?? []) {
      if (instance.State?.Name === "terminated") continue;
      const nameTag = instance.Tags?.find((t) => t.Key === "Name")?.Value ?? "";
      instances.push({
        instanceId: instance.InstanceId ?? "",
        name: nameTag,
        instanceType: instance.InstanceType ?? "",
        state: instance.State?.Name ?? "unknown",
        publicIp: instance.PublicIpAddress ?? null,
        launchTime: instance.LaunchTime ? instance.LaunchTime.toISOString() : null,
      });
    }
  }
  return instances;
}

export interface PodInfo {
  name: string;
  phase: string;
  ready: string;
  restarts: number;
  node: string;
  startTime: string | null;
}

export async function listPods(namespace = "aiops"): Promise<PodInfo[]> {
  const kc = new KubeConfig();
  kc.loadFromDefault();
  const api = kc.makeApiClient(CoreV1Api);

  const { body } = await api.listNamespacedPod(namespace);
  return body.items.map((pod) => {
    const statuses = pod.status?.containerStatuses ?? [];
    const readyCount = statuses.filter((c) => c.ready).length;
    const restarts = statuses.reduce((sum, c) => sum + c.restartCount, 0);
    return {
      name: pod.metadata?.name ?? "",
      phase: pod.status?.phase ?? "Unknown",
      ready: `${readyCount}/${statuses.length}`,
      restarts,
      node: pod.spec?.nodeName ?? "",
      startTime: pod.status?.startTime ? new Date(pod.status.startTime).toISOString() : null,
    };
  });
}
