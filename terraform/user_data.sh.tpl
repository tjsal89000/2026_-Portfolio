#!/bin/bash
# EC2 최초 부팅 시 1회 실행됨. 로그는 /var/log/cloud-init-output.log에서 확인 가능.
set -euxo pipefail

# --- Docker 설치 ---
curl -fsSL https://get.docker.com | sh
usermod -aG docker ubuntu

# --- k3s 설치 (Docker를 컨테이너 런타임으로 사용) ---
# k3s 기본값은 자체 내장 containerd를 쓰는데, 그러면 `docker build`로 만든 이미지를
# k3s가 쓰려면 `docker save` -> `k3s ctr images import`로 한 단계 더 거쳐야 한다.
# --docker 플래그로 k3s가 호스트의 Docker 데몬을 그대로 쓰게 하면 이 변환 단계가 아예 필요 없다 -
# 포트폴리오 단일 노드 규모에서 굳이 이 복잡도를 감당할 이유가 없어서 단순한 쪽을 택함.
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--docker" sh -

mkdir -p /root/.kube
cp /etc/rancher/k3s/k3s.yaml /root/.kube/config
export KUBECONFIG=/root/.kube/config
echo 'export KUBECONFIG=/etc/rancher/k3s/k3s.yaml' >> /home/ubuntu/.bashrc

until kubectl get nodes >/dev/null 2>&1; do sleep 5; done

# --- git 설치 + 소스 클론 ---
apt-get update -y
apt-get install -y git
git clone ${github_repo_url} /opt/app
cd /opt/app

# --- 9개 컴포넌트 이미지 빌드 (Phase 11에서 로컬 검증한 것과 동일한 Dockerfile들) ---
declare -A IMAGES=(
  ["payment-api"]="payment-api"
  ["db-writer-consumer"]="db-writer-consumer"
  ["gateway"]="gateway"
  ["ws-server"]="ws-server"
  ["mcp-server"]="mcp-server"
  ["dashboard"]="dashboard"
  ["agents/traffic-generator"]="traffic-generator"
  ["agents/anomaly-detector"]="anomaly-detector"
  ["agents/report-agent"]="report-agent"
)
for dir in "$${!IMAGES[@]}"; do
  name="$${IMAGES[$dir]}"
  docker build -t "aiops/$name:local" "/opt/app/$dir"
done

# --- k8s 매니페스트 적용 ---
# namespace.yaml을 먼저 적용해야 한다 - `kubectl apply -f <디렉터리>`는 파일을 알파벳 순으로
# 적용하는데, "n8n.yaml"처럼 "namespace.yaml"보다 알파벳상 앞서는 파일들이 namespace가 아직
# 없는 상태에서 먼저 적용되면 "namespaces aiops not found"로 실패한다 (실제로 겪은 문제).
kubectl apply -f /opt/app/k8s/namespace.yaml

# Postgres 비밀번호는 GOOGLE_API_KEY와 달리 외부에서 발급받는 값이 아니라 컨테이너끼리만
# 쓰는 내부 값이라, SSH 접속 없이 프로비저닝 시점에 매 인스턴스마다 무작위로 생성해서
# Secret으로 바로 넣는다 (SSH 키페어를 Terraform이 직접 생성하는 것과 같은 논리 - main.tf의
# tls_private_key 참고). Postgres가 이 값으로 최초 초기화되므로, 아래에서 k8s/를 적용하기
# 전에 Secret이 먼저 있어야 한다.
POSTGRES_PASSWORD=$(openssl rand -base64 24)
kubectl create secret generic postgres-secrets \
  --namespace aiops \
  --from-literal=POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  --from-literal=REPORT_DB_DSN="dbname=aiops_db user=aiops password=$POSTGRES_PASSWORD host=postgres port=5432" \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl apply -f /opt/app/k8s/

# report-agent는 GOOGLE_API_KEY Secret이 아직 없어서 이 시점엔 CrashLoop 상태로 대기한다 -
# SSH 접속 후 안내(README 참고)대로 Secret을 만들고 재시작하면 정상화된다. Secret 값을 여기
# user_data에 넣지 않는 이유: user_data는 EC2 메타데이터/Terraform state에 그대로 남기 때문에,
# API 키 같은 비밀값은 Terraform 바깥에서(SSH 접속 후 직접) 넣는 쪽이 더 안전하다.

echo "provisioning complete" > /opt/app/.provisioned
