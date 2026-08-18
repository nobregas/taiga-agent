FROM node:22-bookworm-slim AS build
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY backend/package.json backend/package-lock.json ./
RUN npm ci

COPY backend/tsconfig.json ./
COPY backend/src ./src
COPY backend/prompts ./prompts
RUN npm run build \
  && mkdir -p dist/db/migrations \
  && cp src/db/migrations/*.sql dist/db/migrations/ \
  && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prompts ./prompts

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV TAIGA_AGENT_DATA_DIR=/data

EXPOSE 3000
VOLUME ["/data"]

CMD ["node", "dist/index.js"]
