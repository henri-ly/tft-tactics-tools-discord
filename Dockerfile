# Tag must match the installed `playwright` package version: the image ships the matching
# Chromium, its system libraries and an emoji font.
FROM mcr.microsoft.com/playwright:v1.49.0-noble
WORKDIR /app
RUN npm install -g pnpm@9.15.5
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build && mkdir -p screens logs && chown -R 1000:1000 /app
# uid 1000 = the server's `ubuntu` user, so the mounted ids.json and logs/ stay writable
USER 1000:1000
CMD ["node", "dist/bot.js"]
