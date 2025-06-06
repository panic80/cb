# Deployment Scripts

This directory contains scripts for automating deployment, health checks, and rollbacks for the CF Travel Bot application.

## Scripts Overview

### 1. `deploy.sh` - Deployment Script
Handles full deployment to staging or production environments.

```bash
# Usage
./scripts/deploy.sh [staging|production] [server_user] [server_host]

# Examples
./scripts/deploy.sh staging ubuntu staging.32cbgg8.com
./scripts/deploy.sh production ubuntu 32cbgg8.com

# Via npm scripts
npm run deploy:staging:script
npm run deploy:production:script
```

**Features:**
- Automated testing before deployment
- Environment-specific builds
- Atomic deployments with symlinks
- Automatic rollback on health check failure
- Release cleanup (keeps last 3-5 releases)

### 2. `health-check.sh` - Health Monitoring
Comprehensive health check with detailed reporting.

```bash
# Usage
./scripts/health-check.sh [url] [timeout] [max_attempts]

# Examples
./scripts/health-check.sh                                      # Local default
./scripts/health-check.sh http://staging.32cbgg8.com/health   # Staging
./scripts/health-check.sh http://32cbgg8.com/health 60 5      # Production with custom settings

# Via npm scripts
npm run health-check:local
npm run health-check:staging
npm run health-check:production
```

**Features:**
- HTTP endpoint validation
- JSON response parsing
- System resource monitoring
- Detailed health check reporting
- Configurable timeouts and retries

### 3. `rollback.sh` - Emergency Rollback
Quick rollback to previous releases.

```bash
# Usage
./scripts/rollback.sh [staging|production] [server_user] [server_host] [release_number]

# Examples
./scripts/rollback.sh production ubuntu 32cbgg8.com     # Rollback to previous release
./scripts/rollback.sh staging ubuntu staging.example.com 2  # Rollback 2 releases

# Via npm scripts
npm run rollback:staging:script
npm run rollback:production:script
```

**Features:**
- Safe rollback with backup creation
- Release validation
- Automatic health checks after rollback
- PM2 service restart
- Detailed rollback reporting

## Environment Setup

### Required Environment Variables

For production deployments, ensure these variables are set:
- `SSH_PRIVATE_KEY` - Path to SSH private key
- Server access via SSH key authentication

### Server Directory Structure

The scripts expect this directory structure on the target server:

```
/home/[user]/apps/
├── cf-travel-bot/                    # Production
│   ├── current/                      # Symlink to latest release
│   ├── releases/                     # Version history
│   │   ├── 20241205120000/
│   │   ├── 20241205120001/
│   │   └── 20241205120002/
│   ├── backup/                       # Rollback backups
│   └── shared/                       # Persistent files
│       ├── .env.production
│       └── logs/
└── cf-travel-bot-staging/            # Staging
    ├── current/
    ├── releases/
    ├── backup/
    └── shared/
        ├── .env.staging
        └── logs/
```

### PM2 Configuration

Ensure your `ecosystem.config.cjs` includes:

```javascript
module.exports = {
  apps: [
    {
      name: 'cf-travel-bot-prod',
      script: './server/main.js',
      cwd: '/home/user/apps/cf-travel-bot/current',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    },
    {
      name: 'cf-travel-bot-staging',
      script: './server/main.js',
      cwd: '/home/user/apps/cf-travel-bot-staging/current',
      env: {
        NODE_ENV: 'staging',
        PORT: 3001
      }
    }
  ]
}
```

## CI/CD Integration

These scripts are designed to work with GitHub Actions. See `.github/workflows/deploy.yml` for automated deployment pipeline.

### Required GitHub Secrets

- `SSH_PRIVATE_KEY` - SSH private key for server access
- `SERVER_USER` - SSH username
- `SERVER_HOST` - Server hostname
- `STAGING_URL` - Staging server URL
- `PRODUCTION_URL` - Production server URL

## Troubleshooting

### Common Issues

1. **Permission Denied**
   ```bash
   chmod +x scripts/*.sh
   ```

2. **SSH Connection Failed**
   - Verify SSH key is properly configured
   - Check server firewall settings
   - Ensure user has proper permissions

3. **Health Check Failed**
   - Check application logs: `pm2 logs [app_name]`
   - Verify environment variables are set
   - Test health endpoint manually: `curl http://server/health`

4. **Rollback Issues**
   - Check if previous releases exist
   - Verify symlink permissions
   - Check PM2 status: `pm2 status`

### Debug Mode

Run scripts with debug output:
```bash
bash -x ./scripts/deploy.sh staging ubuntu server.com
```

### Manual Recovery

If automated rollback fails:
```bash
# Connect to server
ssh user@server

# Check current releases
ls -la /home/user/apps/cf-travel-bot/releases/

# Manual rollback
cd /home/user/apps/cf-travel-bot
rm current
ln -s releases/[previous-release] current
pm2 reload cf-travel-bot-prod
```

## Security Considerations

- Scripts validate input parameters
- SSH connections use key-based authentication
- Environment files are never included in deployment packages
- Backup creation before each deployment
- Automatic rollback on failure

## Monitoring

Scripts provide detailed logging and status reporting. Monitor deployments through:
- GitHub Actions workflow logs
- Server application logs (`pm2 logs`)
- Health check endpoints
- PM2 monitoring (`pm2 monit`)
SCRIPTS_README_EOF < /dev/null