FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
COPY package-lock.json ./
COPY scripts/ ./scripts/
COPY public/ ./public/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# Runtime : Caddy (serveur statique, pas de proxy — le reverse proxy public
# est géré par Caddy sur le host). nginx est abandonné.
FROM caddy:2-alpine

COPY --from=build /app/dist /srv/web
COPY Caddyfile /etc/caddy/Caddyfile

EXPOSE 80
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile"]