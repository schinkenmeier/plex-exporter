FROM node:24-alpine

WORKDIR /app

COPY tools/tautulli-mock/server.cjs ./server.cjs

ENV PORT=8181
EXPOSE 8181

CMD ["node", "server.cjs"]
