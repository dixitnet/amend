# Stage 1 — build the client bundle (needs npm + the internet, so this
# stage is not run inside Claude's sandbox — only by you, on your machine).
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# Stage 2 — runtime. The server has zero npm dependencies, so this image
# only needs a bare Node runtime.
FROM node:20-alpine
WORKDIR /app
COPY server/ ./server/
COPY package.json ./
COPY --from=client-build /app/client/dist ./client/dist

ENV PORT=8787
ENV DATA_DIR=/app/data
VOLUME ["/app/data"]
EXPOSE 8787

CMD ["node", "server/server.js"]
