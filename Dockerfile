# Builder stage
FROM node:20-alpine AS build
WORKDIR /app

# Install deps for build (works with or without lockfile)
COPY package.json ./
COPY package-lock.json ./
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
COPY package-lock.json ./
RUN npm install --omit=dev && npm cache clean --force

# Copy built assets from builder
COPY --from=build /app/dist ./dist

USER node
EXPOSE 5000
CMD ["node", "dist/server.js"]
