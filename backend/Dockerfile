FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci          # instala também devDependencies

COPY . .

RUN npm run build   # agora o "nest" existe

ENV NODE_ENV=production

EXPOSE 3000

CMD ["npm", "run", "start:prod"]
