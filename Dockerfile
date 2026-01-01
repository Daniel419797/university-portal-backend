# Builder stage
FROM node:20-alpine AS build
WORKDIR /app

# Install deps for build (no lockfile in context)
COPY package.json ./
RUN npm install

# Build source
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

# Install only production deps
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

# Copy built assets from builder
COPY --from=build /app/dist ./dist

# Ensure writable logs directory for non-root user
RUN mkdir -p /app/logs && chown node:node /app/logs

USER node
EXPOSE 5000
CMD ["node", "dist/server.js"]
