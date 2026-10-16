FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY server/package.json ./server/
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY server/package.json ./server/
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server

USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 http://localhost:8080/health || exit 1

CMD ["node", "server/server.ts"]