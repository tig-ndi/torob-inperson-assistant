FROM node:24-bookworm-slim AS web
WORKDIR /build
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci
COPY apps/web/ ./
RUN npm run build

FROM python:3.14-slim-bookworm
WORKDIR /app
COPY requirements.txt requirements.lock.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY apps/ ./apps/
COPY tools/ ./tools/
COPY --from=web /build/dist ./apps/web/dist
RUN useradd --uid 10001 --create-home torob && mkdir -p /data && chown torob:torob /data
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000 \
    TOROB_DATABASE=/data/catalogue.sqlite3 \
    TOROB_USAGE_DATABASE=/data/agent-usage.sqlite3
USER torob
EXPOSE 8000
CMD ["python", "-m", "tools.serve"]
