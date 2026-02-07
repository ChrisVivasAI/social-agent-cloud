FROM node:20-slim

# Install ffmpeg for video editing
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./

# Install dependencies
RUN yarn install --frozen-lockfile --network-timeout 600000

# Copy source and skills
COPY tsconfig.json ./
COPY src/ ./src/
COPY skills/ ./skills/

# Build TypeScript
RUN yarn build

EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3002/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/index.js"]
