# Etapa de build
FROM node:20-alpine AS build
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY tsconfig*.json nest-cli.json ./
COPY src ./src
# Falha do build interrompe a imagem (antes era mascarada com "|| echo").
RUN npm run build

# Etapa de produção
FROM node:20-alpine AS production
WORKDIR /usr/src/app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /usr/src/app/dist ./dist

USER node
EXPOSE 3000
CMD ["node", "dist/main"]
