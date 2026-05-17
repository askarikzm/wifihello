FROM node:18-bullseye-slim AS builder
WORKDIR /app

# Install dependencies for frontend
COPY frontend/package*.json ./frontend/
RUN apt-get update && apt-get install -y python3 build-essential && rm -rf /var/lib/apt/lists/*
RUN cd frontend && npm ci --silent

# Copy frontend source and build
COPY frontend ./frontend
WORKDIR /app/frontend
RUN npm run build --silent

FROM node:18-bullseye-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy built frontend and node_modules
COPY --from=builder /app/frontend/.next ./frontend/.next
COPY --from=builder /app/frontend/node_modules ./frontend/node_modules
COPY --from=builder /app/frontend/package.json ./frontend/package.json

EXPOSE 3000

CMD ["sh","-lc","cd frontend && npm run start -- -p ${PORT:-3000}"]
