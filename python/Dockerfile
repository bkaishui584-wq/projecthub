FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV PORT=8787
EXPOSE 8787
RUN mkdir -p /app/data /app/logs
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-8787} --workers 1 --threads 8 --timeout 180 app:app"]
