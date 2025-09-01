FROM oven/bun:latest AS base
WORKDIR /app

COPY . .
RUN bun install --frozen-lockfile --production

ENV NODE_ENV=production
USER bun
EXPOSE 3000/tcp
ENTRYPOINT [ "bun", "run", "index.ts" ]
