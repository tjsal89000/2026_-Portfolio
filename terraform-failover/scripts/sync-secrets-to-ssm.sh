#!/bin/bash
# 공개 서버(k3s)의 비밀값을 SSM Parameter Store(암호화)로 복사한다.
# 교체용 Spot 인스턴스가 부팅할 때 여기서 읽어 복원한다 (spot_bootstrap.sh 참고).
#
# 실행 위치: 공개 서버 (sudo 권한과 kubectl이 있는 곳). 인증서 갱신 후에도 다시 실행해야 한다.
# 저장된 값은 SecureString이라 AWS 콘솔/CLI에서도 복호화해야만 보인다.
set -euo pipefail

REGION="${REGION:-ap-northeast-2}"
TMP=$(mktemp -d)
chmod 700 "$TMP"
trap 'rm -rf "$TMP"' EXIT

put() {  # put <parameter-name> <value-file>
  # 표준 등급은 값이 4096자까지다. 인증서 체인은 이보다 길 수 있어서, 크면 고급 등급(8KB, 파라미터당 월 약 0.05달러)으로 저장한다
  tier="Standard"
  if [ "$(wc -c < "$2")" -gt 4000 ]; then tier="Advanced"; fi
  aws ssm put-parameter --region "$REGION" --name "$1" --type SecureString --overwrite \
    --tier "$tier" --value "file://$2" >/dev/null
  echo "SYNCED $1 ($tier)"
}

# TLS 인증서: 값을 base64 그대로 저장하고, 복원할 때 디코딩한다
for name in aiops-tls n8n-tls; do
  for field in tls.crt tls.key; do
    sudo kubectl get secret "$name" -n aiops -o jsonpath="{.data.${field//./\\.}}" > "$TMP/value"
    put "/aiops/k8s/$name/$field" "$TMP/value"
  done
done

# 웹훅 비밀 헤더
sudo kubectl get secret alert-webhook-secret -n aiops -o jsonpath='{.data.ALERT_WEBHOOK_SECRET}' | base64 -d > "$TMP/value"
put "/aiops/k8s/alert-webhook-secret/ALERT_WEBHOOK_SECRET" "$TMP/value"

# 리포트 에이전트 키
sudo kubectl get secret report-agent-secrets -n aiops -o jsonpath='{.data.GOOGLE_API_KEY}' | base64 -d > "$TMP/value"
put "/aiops/k8s/report-agent-secrets/GOOGLE_API_KEY" "$TMP/value"

echo "완료: 비밀값은 SSM Parameter Store(SecureString)에만 저장됨"
