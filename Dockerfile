FROM node:20-bookworm-slim

# Chromium من النظام + git (لتثبيت whatsapp-web.js من GitHub) + خطوط تدعم العربية في ملفات PDF
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium git ca-certificates fonts-liberation fonts-noto-core \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

CMD ["node", "index.js"]
