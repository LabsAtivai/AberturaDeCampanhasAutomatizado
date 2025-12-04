FROM node:20-alpine

WORKDIR /usr/src/app

# Copia package e lock e instala deps
COPY package*.json ./
RUN npm ci

# Copia o resto do código (inclui src, nest-cli.json, credentials.json, etc.)
COPY . .

# Build do NestJS
RUN npm run build

ENV NODE_ENV=production

EXPOSE 3000

CMD ["npm", "run", "start:prod"]
