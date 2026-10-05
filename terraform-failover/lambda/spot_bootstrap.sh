#!/bin/bash
# 교체용 Spot 인스턴스의 부팅 스크립트 (Lambda failover.py가 user_data로 넣는다).
# 앞의 __XXX__ 값은 Lambda가 실행 시점에 채운다. 비밀값은 여기에 없고 SSM Parameter Store에서 읽는다.
#
# 순서: 기본 설치 -> 소스/이미지 -> 비밀값 복원 -> 매니페스트 적용 -> 전체 준비 확인 -> 공인 IP 인계 -> 대기 인스턴스 종료
# 준비 확인에 실패하면 공인 IP를 옮기지 않는다. 그러면 대기 인스턴스가 계속 서비스한다.
set -euxo pipefail

REGION="__REGION__"
REPO_URL="__GITHUB_REPO_URL__"
EIP_ALLOCATION_ID="__EIP_ALLOCATION_ID__"
STANDBY_INSTANCE_ID="__STANDBY_INSTANCE_ID__"

# --- 자기 자신의 인스턴스 ID ---
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 600")
SELF_ID=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/instance-id)

# --- 기본 설치 (Docker, awscli, git) ---
apt-get update -y
apt-get install -y awscli git
curl -fsSL https://get.docker.com | sh
usermod -aG docker ubuntu || true

# --- k3s: Docker 런타임, Traefik 비활성화 (공개 서버와 같은 설정. 기본 Traefik이 80/443을 먼저 잡는 문제를 막는다) ---
mkdir -p /etc/rancher/k3s
printf 'disable: [traefik]\n' > /etc/rancher/k3s/config.yaml
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--docker" sh -
mkdir -p /root/.kube
cp /etc/rancher/k3s/k3s.yaml /root/.kube/config
export KUBECONFIG=/root/.kube/config
until kubectl get nodes >/dev/null 2>&1; do sleep 5; done

# --- 소스와 이미지 ---
git clone "$REPO_URL" /opt/app
cd /opt/app
for pair in "payment-api:payment-api" "db-writer-consumer:db-writer-consumer" "gateway:gateway" "ws-server:ws-server" "mcp-server:mcp-server" "dashboard:dashboard" "agents/traffic-generator:traffic-generator" "agents/anomaly-detector:anomaly-detector" "agents/report-agent:report-agent"; do
  dir="${pair%%:*}"; name="${pair##*:}"
  docker build -q -t "aiops/$name:local" "/opt/app/$dir" >/dev/null
done

kubectl apply -f /opt/app/k8s/namespace.yaml

# --- 비밀값 복원: SSM에서 읽어 임시 폴더(권한 600)에만 쓰고, 끝나면 지운다 ---
SECRET_DIR=$(mktemp -d)
chmod 700 "$SECRET_DIR"
trap 'rm -rf "$SECRET_DIR"' EXIT

ssm_get() {
  aws ssm get-parameter --region "$REGION" --name "$1" --with-decryption --query Parameter.Value --output text
}

# TLS 인증서 두 개 (값은 base64로 저장되어 있다)
for name in aiops-tls n8n-tls; do
  ssm_get "/aiops/k8s/$name/tls.crt" | base64 -d > "$SECRET_DIR/$name.crt"
  ssm_get "/aiops/k8s/$name/tls.key" | base64 -d > "$SECRET_DIR/$name.key"
  chmod 600 "$SECRET_DIR/$name.key"
  kubectl create secret tls "$name" -n aiops --cert="$SECRET_DIR/$name.crt" --key="$SECRET_DIR/$name.key" \
    --dry-run=client -o yaml | kubectl apply -f -
done

# 웹훅 비밀 헤더, 리포트 에이전트 키
ALERT_SECRET=$(ssm_get "/aiops/k8s/alert-webhook-secret/ALERT_WEBHOOK_SECRET")
kubectl create secret generic alert-webhook-secret -n aiops --from-literal=ALERT_WEBHOOK_SECRET="$ALERT_SECRET" \
  --dry-run=client -o yaml | kubectl apply -f -

GOOGLE_KEY=$(ssm_get "/aiops/k8s/report-agent-secrets/GOOGLE_API_KEY")
kubectl create secret generic report-agent-secrets -n aiops --from-literal=GOOGLE_API_KEY="$GOOGLE_KEY" \
  --dry-run=client -o yaml | kubectl apply -f -

# DB 비밀번호는 새로 만든다 (DB는 이 인스턴스에서 새로 초기화된다. 데이터는 이전 인스턴스에서 이어지지 않는다)
POSTGRES_PASSWORD=$(openssl rand -base64 24)
kubectl create secret generic postgres-secrets --namespace aiops \
  --from-literal=POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  --from-literal=REPORT_DB_DSN="dbname=aiops_db user=aiops password=$POSTGRES_PASSWORD host=postgres port=5432" \
  --dry-run=client -o yaml | kubectl apply -f -

# --- 매니페스트 적용 ---
kubectl apply -f /opt/app/k8s/

# --- 준비 확인: 모든 Deployment가 Available이 될 때까지 기다린다 ---
if ! kubectl wait --for=condition=available deployment --all -n aiops --timeout=45m; then
  echo "준비 확인 실패: 공인 IP를 옮기지 않는다 (대기 인스턴스가 계속 서비스한다)"
  exit 1
fi

# --- 인계: 공인 IP를 나에게 옮기고, 대기 인스턴스를 끈다 ---
aws ec2 associate-address --region "$REGION" --allocation-id "$EIP_ALLOCATION_ID" --instance-id "$SELF_ID" --allow-reassociation
aws ec2 stop-instances --region "$REGION" --instance-ids "$STANDBY_INSTANCE_ID"
echo "인계 완료: $SELF_ID 가 공인 IP를 가졌고, 대기 인스턴스 $STANDBY_INSTANCE_ID 는 종료 요청됨"
