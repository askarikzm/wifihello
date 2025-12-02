FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY tsconfig*.json nest-cli.json .eslintrc.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --legacy-peer-deps
COPY --from=base /app/dist ./dist
ENV NODE_ENV=production
EXPOSE 9000
CMD ["node", "dist/main.js"]
