# Playwright inclus : l’API HTTP Vinted n’est pas officielle et échoue souvent sans navigateur.
FROM mcr.microsoft.com/playwright:v1.49.1-noble
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY shared ./shared
COPY src ./src
ENV PORT=8787
ENV DATA_DIR=/app/data
EXPOSE 8787
CMD ["node", "src/server.mjs"]
