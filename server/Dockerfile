FROM node:16-alpine

RUN apk add --update --no-cache make vim git curl gpg unzip gcc g++ python3
RUN ln -sf python3 /usr/bin/python
ADD . /app/
WORKDIR /app
RUN npm i

CMD ["npm", "run", "start:prod"]
