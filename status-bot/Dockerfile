FROM node:20-slim

ENV NODE_ENV=production

WORKDIR /app/status-bot

COPY status-bot/package*.json ./
RUN npm ci --omit=dev

COPY status-bot/index.js status-bot/pride-overlay.js status-bot/pride-target.js status-bot/status.html ./
COPY ["status-bot/pride flag.webp", "/app/status-bot/pride flag.webp"]
COPY IMG_2094.JPG /app/IMG_2094.JPG

EXPOSE 3000

CMD ["node", "--max-old-space-size=320", "index.js"]
