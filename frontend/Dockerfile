# Etapa 1: Build do app
FROM node:20-alpine AS builder

WORKDIR /app

# Copia apenas os arquivos de dependências primeiro (aproveita cache)
COPY frontend/package*.json ./
RUN npm ci --omit=dev

# Copia o resto do código
COPY frontend/ .

# Roda o build de produção
RUN npm run build

# Etapa 2: Imagem final leve para servir
FROM nginx:alpine

# Copia os arquivos compilados para o nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# (Opcional) Se quiser trocar a porta ou config do nginx
# COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
