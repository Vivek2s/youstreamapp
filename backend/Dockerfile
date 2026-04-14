# ---- Build Stage ----
FROM node:20-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.base.json nx.json ./
COPY apps/ apps/

RUN npx nx build api

# ---- Runtime Stage ----
FROM node:20-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist/ ./dist/

RUN mkdir -p /app/storage/uploads /app/storage/streams /app/storage/torrents

ENV NODE_ENV=production
ENV PORT=3000
ENV STORAGE_ROOT=/app/storage

EXPOSE 3000

CMD ["node", "dist/apps/api/main.js"]
