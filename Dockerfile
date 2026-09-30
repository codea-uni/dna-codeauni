# Build: Node 24 + pnpm (versión fijada en packageManager)
FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
# Vacío = la web funciona sin servidor (sin login, solo autoguardado local). Con servidor: /api
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm build
RUN pnpm --filter @cronos/server build

# Servidor (perfil `server` de docker-compose): un bundle de Node sin node_modules
FROM node:24-alpine AS server
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/server/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "--enable-source-maps", "dist/main.js"]

# Servir los estáticos con nginx (etapa por defecto)
FROM nginx:1.29-alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
