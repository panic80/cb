# Docker Deployment Guide

This guide covers containerized deployment of the CF Travel Bot application using Docker and Docker Compose.

## Overview

The application provides multiple Docker configurations:

- **Production**: Multi-stage build with Redis, Nginx, and security optimizations
- **Development**: Hot-reload enabled environment for local development
- **Staging**: Production-like environment for testing

## Quick Start

### Development Environment

```bash
# Start development environment with hot reload
docker-compose -f docker-compose.dev.yml up --build

# Access the application
# Frontend: http://localhost:5173
# Backend: http://localhost:3000
# Redis: localhost:6379
```

### Production Environment

```bash
# Create production environment file
cp .env.example .env.production
# Edit .env.production with your production values

# Start production environment
docker-compose up --build -d

# Access the application
# Application: http://localhost:3000
# With Nginx: http://localhost:80
```

### Production with Nginx

```bash
# Start production with Nginx reverse proxy
docker-compose --profile production up --build -d

# Access the application
# HTTP: http://localhost:80
# HTTPS: http://localhost:443 (if SSL configured)
```

## Configuration Files

### Docker Compose Files

- `docker-compose.yml` - Production configuration
- `docker-compose.dev.yml` - Development configuration

### Dockerfiles

- `Dockerfile` - Multi-stage production build
- `Dockerfile.dev` - Development with hot reload

### Supporting Files

- `.dockerignore` - Optimize build context
- `nginx.conf` - Nginx reverse proxy configuration

## Environment Variables

### Required Variables

```env
# Application
NODE_ENV=production
PORT=3000
GEMINI_API_KEY=your-api-key

# Cache
REDIS_URL=redis://redis:6379
ENABLE_CACHE=true
CACHE_TTL=3600000

# Features
ENABLE_RATE_LIMIT=true
ENABLE_LOGGING=true
LOG_LEVEL=info
```

### Development Override

```env
NODE_ENV=development
ENABLE_CACHE=false
ENABLE_RATE_LIMIT=false
LOG_LEVEL=debug
```

## Services

### Application Service

- **Image**: Custom build from Dockerfile
- **Port**: 3000
- **Health Check**: `/health` endpoint
- **Volumes**: Logs persistence
- **Security**: Non-root user, minimal attack surface

### Redis Service

- **Image**: redis:7-alpine
- **Port**: 6379
- **Persistence**: Volume-mounted data
- **Memory Limit**: 256MB with LRU eviction
- **Health Check**: Redis PING command

### Nginx Service (Optional)

- **Image**: nginx:alpine
- **Ports**: 80 (HTTP), 443 (HTTPS)
- **Features**: Reverse proxy, SSL termination, rate limiting
- **Configuration**: Custom nginx.conf

## Volumes

### Production Volumes

```yaml
volumes:
  redis_data:        # Redis persistence
  app_logs:          # Application logs
  nginx_logs:        # Nginx logs
```

### Development Volumes

```yaml
volumes:
  redis_dev_data:    # Redis development data
  dev_logs:          # Development logs
  ./:/app:           # Hot reload source mapping
```

## Networks

All services communicate through isolated Docker networks:

- `app-network` (Production)
- `dev-network` (Development)

## Build Process

### Multi-Stage Production Build

1. **Builder Stage**: Install dependencies, build application
2. **Production Stage**: Copy built assets, install production dependencies only
3. **Security**: Non-root user, minimal image size
4. **Health Check**: Built-in health monitoring

### Development Build

1. **Single Stage**: Install all dependencies including dev tools
2. **Hot Reload**: Source code volume mounting
3. **Debug Support**: Development tools and debugging capabilities

## Health Monitoring

### Application Health Check

```javascript
// Built-in health check
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD node -e "/* health check script */"
```

### Service Dependencies

```yaml
# Ensure Redis is healthy before starting app
depends_on:
  redis:
    condition: service_healthy
```

### External Monitoring

```bash
# Check service status
docker-compose ps

# View health status
docker-compose logs app

# Monitor resources
docker stats
```

## Security Features

### Application Security

- Non-root user execution
- Minimal base image (Alpine Linux)
- No unnecessary packages
- Environment variable validation

### Network Security

- Isolated Docker networks
- No direct external Redis access
- Nginx reverse proxy with rate limiting

### SSL/TLS (Production)

```nginx
# Enable HTTPS in nginx.conf
ssl_certificate /etc/nginx/ssl/cert.pem;
ssl_certificate_key /etc/nginx/ssl/key.pem;
ssl_protocols TLSv1.2 TLSv1.3;
```

## Performance Optimization

### Image Optimization

- Multi-stage builds reduce image size
- .dockerignore excludes unnecessary files
- Alpine Linux base images
- Layer caching optimization

### Runtime Optimization

- Redis caching with memory limits
- Nginx gzip compression
- Connection keep-alive
- Proper resource limits

### Resource Limits

```yaml
# Add to docker-compose.yml
deploy:
  resources:
    limits:
      memory: 512M
      cpus: '0.5'
    reservations:
      memory: 256M
      cpus: '0.25'
```

## Scaling and Orchestration

### Horizontal Scaling

```bash
# Scale application instances
docker-compose up --scale app=3 -d

# Load balance with Nginx upstream
upstream app_servers {
    server app_1:3000;
    server app_2:3000;
    server app_3:3000;
}
```

### Kubernetes Deployment

```yaml
# Example Kubernetes deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cf-travel-bot
spec:
  replicas: 3
  selector:
    matchLabels:
      app: cf-travel-bot
  template:
    spec:
      containers:
      - name: app
        image: cf-travel-bot:latest
        ports:
        - containerPort: 3000
```

## Backup and Recovery

### Data Backup

```bash
# Backup Redis data
docker run --rm -v cf-travel-bot_redis_data:/data \
  -v $(pwd):/backup alpine \
  tar czf /backup/redis-backup.tar.gz -C /data .

# Backup application logs
docker run --rm -v cf-travel-bot_app_logs:/logs \
  -v $(pwd):/backup alpine \
  tar czf /backup/logs-backup.tar.gz -C /logs .
```

### Data Recovery

```bash
# Restore Redis data
docker run --rm -v cf-travel-bot_redis_data:/data \
  -v $(pwd):/backup alpine \
  tar xzf /backup/redis-backup.tar.gz -C /data
```

## Monitoring and Logging

### Log Management

```bash
# View application logs
docker-compose logs -f app

# View all service logs
docker-compose logs -f

# Log rotation (add to docker-compose.yml)
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

### Metrics Collection

```yaml
# Add Prometheus monitoring
prometheus:
  image: prom/prometheus
  ports:
    - "9090:9090"
  volumes:
    - ./prometheus.yml:/etc/prometheus/prometheus.yml

grafana:
  image: grafana/grafana
  ports:
    - "3001:3000"
  environment:
    - GF_SECURITY_ADMIN_PASSWORD=admin
```

## Troubleshooting

### Common Issues

**Port Conflicts**
```bash
# Check port usage
netstat -tulpn | grep :3000

# Use different ports
docker-compose -f docker-compose.yml up -p 3001:3000
```

**Permission Issues**
```bash
# Fix volume permissions
sudo chown -R 1001:1001 ./logs
```

**Build Failures**
```bash
# Clean build cache
docker system prune -a

# Force rebuild
docker-compose build --no-cache
```

### Debug Mode

```bash
# Run with debug output
DEBUG=* docker-compose up

# Execute commands in running container
docker-compose exec app sh

# Check container health
docker inspect --format='{{.State.Health.Status}}' container_name
```

### Performance Debugging

```bash
# Monitor resource usage
docker stats

# Check application metrics
curl http://localhost:3000/health

# Redis monitoring
docker-compose exec redis redis-cli monitor
```

## Deployment Strategies

### Blue-Green Deployment

```bash
# Deploy new version
docker-compose -f docker-compose.blue.yml up -d

# Test new version
curl http://localhost:3001/health

# Switch traffic
# Update load balancer configuration

# Remove old version
docker-compose -f docker-compose.green.yml down
```

### Rolling Updates

```bash
# Update with zero downtime
docker-compose up --scale app=2 -d
docker-compose stop app_1
docker-compose rm app_1
docker-compose up --scale app=3 -d
```

## Best Practices

1. **Security**: Always use non-root users, scan images for vulnerabilities
2. **Resources**: Set appropriate memory and CPU limits
3. **Secrets**: Use Docker secrets or external secret management
4. **Logging**: Implement structured logging and log rotation
5. **Monitoring**: Set up health checks and metrics collection
6. **Backup**: Regular data backups and tested recovery procedures
7. **Updates**: Keep base images and dependencies updated
8. **Testing**: Test Docker builds in CI/CD pipelines

## Production Checklist

- [ ] Environment variables configured
- [ ] SSL certificates installed
- [ ] Nginx configuration reviewed
- [ ] Resource limits set
- [ ] Health checks configured
- [ ] Logging configured
- [ ] Backup strategy implemented
- [ ] Monitoring setup
- [ ] Security scan completed
- [ ] Load testing performed
DOCKER_DOCS_EOF < /dev/null