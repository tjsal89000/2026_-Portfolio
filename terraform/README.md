# Terraform - EC2 + k3s 프로비저닝

`terraform apply` 한 번으로 EC2 인스턴스를 만들고, 그 안에서 Docker + k3s 설치 → GitHub에서
소스 클론 → 9개 컴포넌트 이미지 빌드 → `k8s/` 매니페스트 적용까지 `user_data.sh.tpl` 스크립트가
전부 자동으로 처리한다.

## 사전 준비

- AWS CLI 인증 완료 (`aws sts get-caller-identity`로 확인)
- Terraform >= 1.5

SSH 키페어는 Terraform이 직접 생성해서 `generated_key.pem`으로 저장하므로 미리 만들 필요 없음.

## 실행

```
cd terraform
terraform init
terraform apply
```

`dashboard_url`, `n8n_url`, `ssh_command`를 출력해준다. user_data 스크립트가 이미지 빌드까지
끝내는 데 몇 분 걸리므로, `dashboard_url`에 바로 접속했는데 안 뜨면 2~3분 후 다시 시도.

진행 상황은 SSH 접속 후 `sudo tail -f /var/log/cloud-init-output.log`로 실시간 확인 가능.

## 배포 후 할 일 (필수) - AI 리포트 에이전트 API 키 등록

`GOOGLE_API_KEY`는 보안상 Terraform 코드/state에 남기지 않도록 의도적으로 user_data에서 뺐다.
배포가 끝나면 SSH로 접속해서 직접 넣어야 한다:

```
ssh -i generated_key.pem ubuntu@<public_ip>
sudo kubectl create secret generic report-agent-secrets \
  --namespace aiops \
  --from-literal=GOOGLE_API_KEY=<발급받은_키>
sudo kubectl rollout restart deployment/report-agent -n aiops
```

## 정리

```
terraform destroy
```
