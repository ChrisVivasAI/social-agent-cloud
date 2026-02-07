FROM node:20-bookworm-slim

# Install Chrome dependencies for Remotion rendering
RUN apt-get update && apt-get install -y \
    libnss3 \
    libdbus-1-3 \
    libatk1.0-0 \
    libgbm-dev \
    libasound2 \
    libxrandr2 \
    libxkbcommon-dev \
    libxfixes3 \
    libxcomposite1 \
    libxdamage1 \
    libatk-bridge2.0-0 \
    libpango-1.0-0 \
    libcairo2 \
    libcups2 \
    fonts-noto-color-emoji \
    fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install

# Install Chrome for Remotion
RUN npx remotion browser ensure

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

EXPOSE 3010

CMD ["node", "dist/server.js"]
