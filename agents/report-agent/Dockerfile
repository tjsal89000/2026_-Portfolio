FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8092
# --once가 아니라 기본 실행(상시 트리거 서버)으로 띄운다 - n8n Schedule Trigger가 POST /generate로 호출
CMD ["python", "-u", "main.py"]
