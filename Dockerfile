# Builder stage
FROM node:20-alpine AS build
WORKDIR /app

# Install all deps for build (needs lockfile)
COPY package.json package-lock.json ./
RUN npm ci

# Build source
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

# Install only production deps using lockfile
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built assets from builder
COPY --from=build /app/dist ./dist

USER node
EXPOSE 5000
CMD ["node", "dist/server.js"]
