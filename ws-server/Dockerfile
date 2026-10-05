FROM node:22-slim AS build
WORKDIR /build
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Node 22 이상: 최신 undici(Kubernetes 클라이언트 2.x 의존)와 AWS SDK가 Node 20에서 동작하지 않는다
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --from=build /build/dist ./dist
EXPOSE 8096
CMD ["node", "dist/index.js"]
