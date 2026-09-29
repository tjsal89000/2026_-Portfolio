FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# -u: stdout을 버퍼링 없이 바로 흘려보냄 (컨테이너 로그로 즉시 확인 가능해야 하므로 필수 -
# 이걸 안 붙이면 파이프/백그라운드 실행 시 출력이 안 보였던 문제를 이 프로젝트에서 이미 겪었음)
ENTRYPOINT ["python", "-u", "main.py"]
