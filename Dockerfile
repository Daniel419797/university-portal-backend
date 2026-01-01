# Builder stage
FROM node:20-alpine AS build
WORKDIR /app

# Install deps for build (no lockfile in context)
COPY package.json ./
RUN npm install

# Build source
COPY . .
RUN npm run build
RUN npm run swagger:generate

# Production stage
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

# Install only production deps
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

# Copy built assets from builder
COPY --from=build /app/dist ./dist
COPY --from=build /app/swagger.generated.json ./swagger.generated.json

# Ensure writable directories for non-root user
RUN mkdir -p /app/logs /app/uploads && chown -R node:node /app/logs /app/uploads

USER node
EXPOSE 5000
CMD ["node", "dist/server.js"]
