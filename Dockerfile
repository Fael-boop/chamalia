# Builds the bot (apps/server) and the panel (apps/panel) into one image.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/panel/package.json apps/panel/
RUN npm ci
COPY tsconfig.base.json ./
COPY apps apps
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production TZ=America/Sao_Paulo
RUN apk add --no-cache tzdata
WORKDIR /app
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/server/package.json apps/server/
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/panel/dist apps/panel/dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/server/dist/index.js"]
