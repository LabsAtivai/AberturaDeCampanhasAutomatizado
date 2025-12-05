# Etapa de build
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps
RUN npm install -g @vue/cli

COPY . .
RUN npm run build

# Etapa de produção
FROM node:20-alpine AS production
WORKDIR /app

COPY --from=build /app/dist ./dist
RUN npm install -g serve

EXPOSE 4173

CMD ["serve", "-s", "dist", "-l", "4173"]
