FROM node:20-alpine AS runner

WORKDIR /app

# Salin package metadata dan pasang dependensi produksi
COPY package*.json ./
RUN npm ci --omit=dev

# Salin seluruh kode aplikasi dan artefak kompilasi sirkuit
COPY client/ ./client/
COPY circuits/build/ ./circuits/build/
COPY server/ ./server/
COPY contracts/ ./contracts/

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

USER node

CMD ["node", "server/src/app.js"]
