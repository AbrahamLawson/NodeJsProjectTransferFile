FROM node:18

WORKDIR /usr/src/app

COPY backend/package*.json ./

RUN npm install

COPY backend/ ./

RUN mkdir -p data

RUN chmod -R 777 data

EXPOSE 3000

CMD ["npm", "start"]
