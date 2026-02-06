FROM oven/bun:alpine AS builder
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:alpine
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY src ./src
COPY package.json ./

# Create a data directory for persistence and set permissions
RUN mkdir -p /app/data && chown -R bun:bun /app/data

EXPOSE 3000

USER bun
CMD ["bun", "run", "src/server.ts"]
