FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY server.ts ./
COPY TERMS.md PRIVACY.md ./
COPY src/lib ./src/lib
COPY src/types ./src/types
COPY src/config ./src/config
COPY public ./public

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Use local tsx binary directly instead of npx to avoid network lookup at container start
CMD ["node_modules/.bin/tsx", "server.ts"]
