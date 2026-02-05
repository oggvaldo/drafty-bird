FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV WEB_DIST_DIR=/app/public
ENV SCORE_DB_PATH=/data/db.sqlite

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist/server ./dist/server
COPY --from=build /app/apps/web/dist ./public
COPY package.json ./

RUN mkdir -p /data && chown -R node:node /app /data
USER node

EXPOSE 8080
CMD ["node", "dist/server/index.js"]
