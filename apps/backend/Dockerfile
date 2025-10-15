# syntax=docker/dockerfile:1
FROM node:lts-bookworm

WORKDIR /app

# Install backend workspace dependencies first to leverage Docker layer caching
COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/
COPY packages/shared/package.json packages/shared/

RUN npm install --workspace @plex-exporter/backend

# Copy the remaining project files and build the production bundle
COPY . .

RUN npm run build --workspace @plex-exporter/backend

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "apps/backend/dist/server.js"]
