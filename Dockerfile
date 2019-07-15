FROM node:10.15-alpine

RUN addgroup -S app \
	&& adduser -S -G app app \
	&& mkdir /app \
	&& chown app:app /app

WORKDIR /app
ENV NODE_ENV production

COPY --chown=root:root package.json /app
COPY --chown=root:root package-lock.json /app
RUN npm install --production

USER app

COPY --chown=root:root lib /app/lib
COPY --chown=root:root nsq-prometheus-exporter.js /app/nsq-prometheus-exporter.js

EXPOSE 3000

CMD [ "/usr/local/bin/node", "--max-old-space-size=64", "/app/nsq-prometheus-exporter.js" ]
