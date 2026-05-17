FROM node:18-alpine AS builder
WORKDIR /app

# Install dependencies for frontend
COPY frontend/package*.json ./frontend/
RUN apk add --no-cache python3 make g++ || true
RUN cd frontend && npm ci --silent

# Copy frontend source and build
COPY frontend ./frontend
WORKDIR /app/frontend
RUN npm run build --silent

FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy built frontend and node_modules
COPY --from=builder /app/frontend/.next ./frontend/.next
COPY --from=builder /app/frontend/node_modules ./frontend/node_modules
COPY --from=builder /app/frontend/package.json ./frontend/package.json

EXPOSE 3000

CMD ["sh","-lc","cd frontend && npm run start -- -p ${PORT:-3000}"]
