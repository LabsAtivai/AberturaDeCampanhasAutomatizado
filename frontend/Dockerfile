# Etapa de build
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npm run build

# Etapa de produção
FROM node:20-alpine AS production
WORKDIR /app

COPY --from=build /app/dist ./dist
RUN npm install -g serve@14

USER node
EXPOSE 4173

CMD ["serve", "-s", "dist", "-l", "4173"]
