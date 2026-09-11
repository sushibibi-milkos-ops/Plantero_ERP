# Plantero ERP — tek imaj, iki servis (web + worker). Railway/Render/Fly ve `docker run` ile kullanılır.
# Web:    bash scripts/deploy/start-web.sh    (şema push → boşsa seed → next start)
# Worker: bash scripts/deploy/start-worker.sh (BullMQ işçileri)
FROM node:22-bookworm-slim

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    NEXT_TELEMETRY_DISABLED=1 \
    CI=1

RUN apt-get update && apt-get install -y --no-install-recommends bash ca-certificates curl \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g pnpm@10.33.0

WORKDIR /app

# 1) Bağımlılık deposu (yalnızca lockfile değişince yeniden iner)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN pnpm fetch

# 2) PDF üretimi için Chromium (playwright-core aynı sürümü kullanır)
RUN npx --yes playwright@1.56.1 install --with-deps chromium

# 3) Kaynak + kurulum + üretim derlemesi
COPY . .
RUN pnpm install --frozen-lockfile --offline
RUN pnpm --filter @plantero/web build

ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["bash", "scripts/deploy/start-web.sh"]
