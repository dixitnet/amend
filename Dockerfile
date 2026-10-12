# Stage 1 — build the client bundle (needs npm + the internet, so this
# stage is not run inside Claude's sandbox — only by you, on your machine).
# Node 22 : la même version majeure que le serveur de production
# (package.json, "engines"), sinon on teste et on déploie sur deux Node.
FROM node:22-alpine AS client-build
WORKDIR /app
# Le client importe `../../shared/` : il faut le copier à côté de client/.
COPY shared/ ./shared/
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Stage 2 — runtime. Le serveur a deux dépendances (yjs, y-protocols), et
# importe `shared/` : sans ce dossier, il ne démarre pas.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server/ ./server/
COPY shared/ ./shared/
COPY --from=client-build /app/client/dist ./client/dist

ENV PORT=8787
ENV DATA_DIR=/app/data
# Dans un conteneur, 127.0.0.1 est inaccessible depuis l'extérieur.
ENV HOST=0.0.0.0
# Pas en root (11/10/2026) : l'utilisateur `node` de l'image possède le volume.
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
VOLUME ["/app/data"]
EXPOSE 8787

# Limite connue : cette image n'embarque pas Typst. L'export PDF y répond 501
# (« Typst est introuvable ») ; la production tourne sous systemd, pas sous
# Docker (voir deploy/README.md), et cette image n'a pas été essayée depuis
# que le serveur importe `shared/`.

CMD ["node", "server/server.js"]
