# syntax=docker/dockerfile:1.7
#
# InkForum çalışma imajı. Kaynak kod imaja girmez: önce sürüm paketi hazırlanır
#   INKFORUM_RELEASE=1 pnpm build && node scripts/release/build.mjs --no-archive
# ardından depo kökünden:
#   docker build -f docker/Dockerfile -t ghcr.io/vokartz/inkforum:dev .

# ---- Bağımlılıklar (platforma özel yerel bileşenler: argon2, sharp) ----
FROM node:24-alpine AS deps
WORKDIR /app
COPY release/inkforum/package.json ./
RUN npm install --omit=dev --no-audit --no-fund --loglevel=error && npm cache clean --force

# ---- Çalışma imajı ----
FROM node:24-alpine
ARG VERSION=dev
ARG BUILD=local
LABEL org.opencontainers.image.title="InkForum" \
      org.opencontainers.image.description="Modern, hafif ve tamamen yönetilebilir topluluk yazılımı" \
      org.opencontainers.image.source="https://github.com/vokartz/inkforum" \
      org.opencontainers.image.url="https://github.com/vokartz/inkforum" \
      org.opencontainers.image.vendor="InkForum" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${BUILD}" \
      org.opencontainers.image.licenses="AGPL-3.0-only"

# tini: sinyalleri doğru iletir; pg_dump: PostgreSQL yedekleri için
RUN apk add --no-cache tini postgresql17-client

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    APP_ROOT=/app \
    STORAGE_DIR=/app/storage \
    INKFORUM_DEPLOY=docker \
    INKFORUM_BUILD=${BUILD}

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node release/inkforum/ ./
RUN mkdir -p /app/storage && chown node:node /app/storage

USER node
VOLUME ["/app/storage"]
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.mjs"]
