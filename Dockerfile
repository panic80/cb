# Multi-stage build for CF Travel Bot
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S app -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder --chown=app:nodejs /app/dist ./dist
COPY --from=builder --chown=app:nodejs /app/server ./server
COPY --from=builder --chown=app:nodejs /app/public_html ./public_html

# Create logs directory
RUN mkdir -p /app/logs && chown app:nodejs /app/logs

# Copy environment example file
COPY --chown=app:nodejs .env.example ./

# Switch to non-root user
USER app

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "
    const http = require('http');
    const options = {
      host: 'localhost',
      port: 3000,
      path: '/health',
      timeout: 2000
    };
    const req = http.request(options, (res) => {
      if (res.statusCode === 200) {
        process.exit(0);
      } else {
        process.exit(1);
      }
    });
    req.on('error', () => process.exit(1));
    req.on('timeout', () => process.exit(1));
    req.end();
  "

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Start application using dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server/main.js"]
DOCKERFILE_EOF < /dev/null