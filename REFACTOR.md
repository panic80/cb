# Refactoring Plan for Hostinger VPS Deployment

## Current Architecture Analysis

### Current Server Architecture
The application uses a **dual-server architecture**:

1. **Main Server** (`server/main.js` - Port 3000):
   - Serves static build files from `dist/`
   - Serves separate landing page from `public_html/`
   - Routes React app under `/chatbot` path
   - Implements proxy to Proxy Server for API calls
   - Has fallback mechanism for direct API calls if proxy is down
   - Handles logging and basic routing

2. **Proxy Server** (`server/proxy.js` - Port 3001):
   - Handles all external API calls (Google Gemini API, Canada.ca)
   - Implements sophisticated caching with TTL (1 hour)
   - Rate limiting (60 requests/minute per client)
   - Processes HTML content from Canada.ca using Cheerio
   - Provides health check endpoint
   - Handles API key validation and security

### Issues and Complexities

1. **API Key Management**: No clear mechanism for secure key rotation
2. **Dual Server Complexity**: Two separate Node.js servers add operational complexity
3. **Caching Strategy**: In-memory cache lost on restart, no distributed caching
4. **Path Routing**: React app under `/chatbot` complicates client-side routing
5. **Deployment Configuration**: Hard-coded values, Git repo URL needs updating
6. **Development vs Production**: Different proxy configurations need better organization

## Refactoring Plan

### 1. Consolidate to Single Server Architecture
- **Merge proxy.js into main.js** as middleware/routes
- Benefits:
  - Single process to manage (simpler PM2 config)
  - Single port configuration
  - Unified logging and error handling
  - Easier Docker containerization

### 2. Implement Dev/Prod Environment Strategy

#### Environment Configuration Files
```
.env.development     # Local development settings
.env.production      # Production settings (Hostinger VPS)
.env.staging         # Staging environment (optional)
.env.example         # Template with all variables (no secrets)
```

#### Environment Variables Structure
```env
# Application Settings
NODE_ENV=development
APP_NAME=cf-travel-bot
APP_VERSION=1.0.0

# Server Configuration
PORT=3000
API_BASE_URL=http://localhost:3000/api

# Frontend URLs (Vite)
VITE_API_BASE_URL=http://localhost:3000/api
VITE_APP_URL=http://localhost:5173

# API Keys (Never commit real values)
VITE_GEMINI_API_KEY=your-api-key-here
GEMINI_API_KEY=your-api-key-here

# Feature Flags
ENABLE_LOGGING=true
ENABLE_CACHE=true
ENABLE_RATE_LIMIT=true

# Cache Configuration
CACHE_TTL=3600000
REDIS_URL=redis://localhost:6379

# Rate Limiting
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=60

# Logging
LOG_LEVEL=debug
LOG_DIR=./logs

# External Services
CANADA_CA_URL=https://www.canada.ca/...
```

#### Development Environment (.env.development)
```env
NODE_ENV=development
PORT=3000
VITE_API_BASE_URL=http://localhost:3000/api
VITE_APP_URL=http://localhost:5173
LOG_LEVEL=debug
ENABLE_CACHE=false
ENABLE_RATE_LIMIT=false
LOG_DIR=./logs/dev
```

#### Production Environment (.env.production)
```env
NODE_ENV=production
PORT=3000
VITE_API_BASE_URL=https://32cbgg8.com/api
VITE_APP_URL=https://32cbgg8.com
LOG_LEVEL=warn
ENABLE_CACHE=true
ENABLE_RATE_LIMIT=true
CACHE_TTL=3600000
LOG_DIR=/var/log/cf-travel-bot
REDIS_URL=redis://localhost:6379
```

#### Environment Management
- Use `dotenv` for local development
- Use PM2 environment variables for production
- Validate required environment variables on startup
- Provide sensible defaults where appropriate

### 3. Simplify Path Routing
- Serve React app from root `/` instead of `/chatbot`
- Move landing page to `/landing` or integrate into React app
- Benefits:
  - Simpler client-side routing
  - No path conflicts
  - Better SEO
  - Consistent user experience

### 4. Implement Proper Caching
- Add Redis support for distributed caching
- Fallback to in-memory cache if Redis unavailable
- Cache layers:
  - API responses (1 hour TTL)
  - Processed HTML content
  - Static assets
  - Session data

### 5. CI/CD Pipeline Structure

```yaml
# .github/workflows/deploy.yml
name: Deploy to Hostinger VPS
on:
  push:
    branches: [main, production]

jobs:
  deploy:
    steps:
      - Checkout code
      - Install dependencies
      - Run tests
      - Build application
      - Deploy via SSH
      - Run health checks
      - Rollback on failure
```

### 6. Deployment Structure

```
/home/user/app/
├── current/          # Symlink to latest release
├── releases/         # Versioned deployments
│   ├── 20240605-123456/
│   ├── 20240605-123457/
│   └── 20240605-123458/
├── shared/           # Persistent files
│   ├── .env
│   ├── logs/
│   └── uploads/
└── scripts/          # Deployment scripts
    ├── deploy.sh
    ├── rollback.sh
    └── health-check.sh
```

### 7. PM2 Ecosystem Simplification

```javascript
// ecosystem.config.cjs
module.exports = {
  apps: [{
    name: 'cf-travel-bot',
    script: './server/main.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './shared/logs/err.log',
    out_file: './shared/logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    max_memory_restart: '1G',
    autorestart: true,
    watch: false
  }]
}
```

### 8. Docker Support (Optional)

```dockerfile
# Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["node", "server/main.js"]
```

### 9. Health Monitoring

- Unified health endpoint: `/health`
- Checks:
  - Application status
  - Database connectivity (if applicable)
  - External API availability
  - Cache status
  - Memory usage
- Response format:
  ```json
  {
    "status": "healthy",
    "timestamp": "2024-06-05T12:00:00Z",
    "checks": {
      "app": "ok",
      "gemini_api": "ok",
      "cache": "ok",
      "memory": "ok"
    }
  }
  ```

### 10. Security Improvements

- Helmet.js for security headers
- CORS configuration with whitelist
- API key rotation strategy
- Rate limiting at application level
- Request validation and sanitization
- Secure session management

## Benefits of This Refactoring

1. **Simpler Operations**: One server, one process, one configuration
2. **Easier CI/CD**: Standard Node.js deployment pattern
3. **Better Performance**: Unified caching, optimized routing
4. **Improved Security**: Centralized security configuration
5. **Scalability**: Ready for horizontal scaling with Redis
6. **Maintainability**: Cleaner codebase, less duplication
7. **Cost Efficiency**: Lower resource usage, easier monitoring

## Implementation Phases

### Phase 1: Server Consolidation (Week 1)
- Merge proxy functionality into main server
- Refactor middleware structure
- Update tests

### Phase 2: Environment & Routing (Week 1-2)
- Implement proper environment configuration
- Simplify path routing
- Update client-side routing

### Phase 3: CI/CD Pipeline (Week 2)
- Set up GitHub Actions
- Create deployment scripts
- Implement rollback mechanism

### Phase 4: Caching Improvements (Week 3)
- Add Redis support
- Implement cache layers
- Performance testing

### Phase 5: Docker & Monitoring (Week 3-4)
- Create Docker configuration
- Set up health monitoring
- Implement logging aggregation

## Migration Strategy

1. **Prepare new server structure locally**
2. **Test thoroughly in staging environment**
3. **Deploy during low-traffic period**
4. **Run parallel for validation**
5. **Switch traffic gradually**
6. **Monitor and rollback if needed**

## Success Metrics

- Deployment time: < 5 minutes
- Server restart time: < 30 seconds
- Memory usage: < 500MB per instance
- Response time: < 200ms (p95)
- Uptime: > 99.9%
- Zero-downtime deployments

## Dev/Prod Workflow

### Development Workflow

1. **Local Development**
   ```bash
   # Clone repository
   git clone <repo-url>
   cd cf-travel-bot
   
   # Setup environment
   cp .env.example .env.development
   # Edit .env.development with your local settings
   
   # Install dependencies
   npm install
   
   # Start development servers
   npm run dev
   ```

2. **Feature Development**
   ```bash
   # Create feature branch
   git checkout -b feature/your-feature
   
   # Make changes and test locally
   npm run test
   npm run lint
   
   # Commit changes
   git add .
   git commit -m "feat: your feature description"
   git push origin feature/your-feature
   ```

3. **Testing in Development**
   - Unit tests: `npm run test`
   - Integration tests: `npm run test:integration`
   - E2E tests: `npm run test:e2e`
   - Local build test: `npm run build && npm run preview`

### Staging/Production Deployment

1. **Automated Deployment Pipeline**
   ```yaml
   # .github/workflows/deploy.yml
   name: Deploy Pipeline
   
   on:
     push:
       branches: [develop]  # Auto-deploy to staging
     pull_request:
       branches: [main]     # Deploy to production on merge
   
   jobs:
     test:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v3
         - uses: actions/setup-node@v3
         - run: npm ci
         - run: npm test
         - run: npm run build
   
     deploy-staging:
       if: github.ref == 'refs/heads/develop'
       needs: test
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v3
         - name: Deploy to Staging
           run: |
             npm run deploy:staging
   
     deploy-production:
       if: github.ref == 'refs/heads/main'
       needs: test
       runs-on: ubuntu-latest
       environment: production
       steps:
         - uses: actions/checkout@v3
         - name: Deploy to Production
           run: |
             npm run deploy:production
   ```

2. **Manual Deployment Commands**
   ```bash
   # Deploy to staging
   npm run deploy:staging
   
   # Deploy to production (requires approval)
   npm run deploy:production
   ```

3. **Deployment Scripts**
   ```json
   // package.json
   {
     "scripts": {
       "build:dev": "vite build --mode development",
       "build:staging": "vite build --mode staging",
       "build:prod": "vite build --mode production",
       "deploy:staging": "npm run build:staging && pm2 deploy staging",
       "deploy:production": "npm run build:prod && pm2 deploy production",
       "rollback:staging": "pm2 deploy staging revert 1",
       "rollback:production": "pm2 deploy production revert 1"
     }
   }
   ```

### Environment Promotion Flow

```
Local Dev → Feature Branch → Dev Branch → Staging → Production
   ↓             ↓              ↓            ↓          ↓
.env.dev    Pull Request    Auto-deploy  Manual     Manual
                               to staging  approval   deploy
```

### Branch Strategy

1. **main** - Production-ready code
2. **develop** - Integration branch for staging
3. **feature/*** - Feature branches
4. **hotfix/*** - Emergency fixes

### Deployment Checklist

#### Before Staging Deployment
- [ ] All tests passing
- [ ] Code reviewed and approved
- [ ] Environment variables updated
- [ ] Database migrations ready
- [ ] Documentation updated

#### Before Production Deployment
- [ ] Staging testing completed
- [ ] Performance benchmarks met
- [ ] Security scan passed
- [ ] Rollback plan documented
- [ ] Stakeholder approval received

### Rollback Strategy

1. **Automatic Rollback** (on deployment failure)
   ```bash
   # In deployment script
   if ! npm run health-check; then
     pm2 deploy production revert 1
     exit 1
   fi
   ```

2. **Manual Rollback**
   ```bash
   # Rollback to previous version
   pm2 deploy production revert 1
   
   # Or rollback to specific version
   pm2 deploy production ref v1.2.3
   ```

### Monitoring & Alerts

1. **Health Checks**
   - Automated health checks after deployment
   - Continuous monitoring in production
   - Alert on failures

2. **Performance Monitoring**
   - Response time tracking
   - Error rate monitoring
   - Resource usage alerts

3. **Log Aggregation**
   - Centralized logging for all environments
   - Separate log streams for dev/staging/prod
   - Real-time error tracking

## Hostinger VPS Specific Configuration

### Server Setup

1. **Directory Structure**
   ```bash
   /home/your-user/
   ├── apps/
   │   ├── cf-travel-bot/          # Production
   │   │   ├── current/            # Symlink to latest release
   │   │   ├── releases/           # Version history
   │   │   └── shared/             # Persistent data
   │   └── cf-travel-bot-staging/  # Staging
   │       ├── current/
   │       ├── releases/
   │       └── shared/
   └── scripts/
       ├── deploy.sh
       └── backup.sh
   ```

2. **Nginx Configuration**
   ```nginx
   # /etc/nginx/sites-available/cf-travel-bot
   
   # Staging server
   server {
       listen 80;
       server_name staging.32cbgg8.com;
       
       location / {
           proxy_pass http://localhost:3001;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   
   # Production server
   server {
       listen 80;
       server_name 32cbgg8.com www.32cbgg8.com;
       
       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

3. **PM2 Configuration for Hostinger**
   ```javascript
   // ecosystem.config.cjs
   module.exports = {
     apps: [
       {
         name: 'cf-travel-bot-prod',
         script: './server/main.js',
         cwd: '/home/your-user/apps/cf-travel-bot/current',
         instances: 2,
         exec_mode: 'cluster',
         env: {
           NODE_ENV: 'production',
           PORT: 3000
         }
       },
       {
         name: 'cf-travel-bot-staging',
         script: './server/main.js',
         cwd: '/home/your-user/apps/cf-travel-bot-staging/current',
         instances: 1,
         exec_mode: 'fork',
         env: {
           NODE_ENV: 'staging',
           PORT: 3001
         }
       }
     ]
   }
   ```

4. **Deployment Script**
   ```bash
   #!/bin/bash
   # deploy.sh
   
   ENVIRONMENT=$1
   APP_NAME="cf-travel-bot"
   
   if [ "$ENVIRONMENT" == "production" ]; then
       APP_DIR="/home/your-user/apps/$APP_NAME"
       PM2_APP="cf-travel-bot-prod"
   elif [ "$ENVIRONMENT" == "staging" ]; then
       APP_DIR="/home/your-user/apps/$APP_NAME-staging"
       PM2_APP="cf-travel-bot-staging"
   else
       echo "Usage: ./deploy.sh [production|staging]"
       exit 1
   fi
   
   # Create new release directory
   RELEASE_DIR="$APP_DIR/releases/$(date +%Y%m%d%H%M%S)"
   mkdir -p $RELEASE_DIR
   
   # Copy application files
   rsync -av --exclude node_modules --exclude .env* --exclude logs ./ $RELEASE_DIR/
   
   # Install dependencies
   cd $RELEASE_DIR
   npm ci --production
   
   # Copy environment file
   cp $APP_DIR/shared/.env.$ENVIRONMENT $RELEASE_DIR/.env
   
   # Build frontend
   npm run build:$ENVIRONMENT
   
   # Update symlink
   rm -f $APP_DIR/current
   ln -s $RELEASE_DIR $APP_DIR/current
   
   # Reload PM2
   pm2 reload $PM2_APP
   
   # Health check
   sleep 5
   curl -f http://localhost:$PORT/health || exit 1
   
   echo "Deployment complete!"
   ```

### Hostinger-Specific Considerations

1. **Resource Limits**
   - Monitor memory usage (VPS limits)
   - Configure PM2 max_memory_restart
   - Use cluster mode for production

2. **Security**
   - Configure firewall (ufw)
   - Use fail2ban for SSH protection
   - Regular security updates

3. **Backup Strategy**
   - Daily database backups
   - Weekly full application backups
   - Store backups off-site

4. **SSL Configuration**
   - Use Let's Encrypt for SSL
   - Auto-renewal via certbot
   - Force HTTPS redirect

## Next Steps

1. Review and approve this plan
2. Set up environment configuration files
3. Configure CI/CD pipeline
4. Set up staging environment on Hostinger
5. Begin Phase 1 implementation (server consolidation)
6. Create deployment scripts
7. Establish monitoring baseline