FROM node:20-alpine

WORKDIR /usr/src/app

# Copia somente os arquivos que garantem instalação de packages primeiro (cache otimizado)
COPY package*.json ./
RUN npm ci --omit=dev

# Copia o restante do projeto
COPY . .

# Compila o NestJS
RUN npm run build

ENV NODE_ENV=production

EXPOSE 3000

CMD ["npm", "run", "start:prod"]
