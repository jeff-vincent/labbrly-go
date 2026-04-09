# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Serve stage
FROM nginx:alpine
# Nginx config will serve the site under /docs with SPA fallback
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Copy build output into a docs/ subfolder so /docs/index.html exists on disk
COPY --from=builder /app/build /usr/share/nginx/html/docs
EXPOSE 80