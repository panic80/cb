# CF Travel Bot Deployment Checklist for 32cbgg8.com

This checklist will guide you through deploying the Canadian Forces Travel Instructions Chatbot on your Hostinger VPS (46.202.177.230).

## Pre-Deployment

- [ ] SSH access to VPS confirmed: `ssh root@46.202.177.230`
- [ ] Domain configured: 32cbgg8.com points to 46.202.177.230
- [ ] API keys ready:
  - [ ] OpenAI API key
  - [ ] Google Gemini API key
  - [ ] Anthropic API key
- [ ] Backup any existing data on VPS

## Step 1: VPS Analysis

```bash
# Run on your VPS to analyze current state
wget https://raw.githubusercontent.com/yourusername/cbthis/main/scripts/vps-discovery.sh
chmod +x vps-discovery.sh
./vps-discovery.sh > vps-report.txt
```

## Step 2: Initial Setup

```bash
# Run the automated setup script
wget https://raw.githubusercontent.com/yourusername/cbthis/main/scripts/vps-setup.sh
chmod +x vps-setup.sh
sudo ./vps-setup.sh
```

## Step 3: Choose Deployment Method

### Option A: Docker Deployment (Recommended)
- [ ] Follow instructions in `DOCKER_DEPLOYMENT.md`
- [ ] Simpler setup
- [ ] Better isolation
- [ ] Easier updates

### Option B: PM2/venv Deployment
- [ ] Follow instructions in `PM2_DEPLOYMENT.md`
- [ ] More control
- [ ] Lower resource usage
- [ ] More complex setup

## Step 4: Configuration Files

1. **Environment Variables**
   ```bash
   # Copy template and edit
   cp .env.production.template .env.production
   nano .env.production
   ```

2. **Nginx Configuration**
   ```bash
   # Copy to nginx sites
   sudo cp nginx.conf.template /etc/nginx/sites-available/cbthis
   sudo ln -s /etc/nginx/sites-available/cbthis /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl reload nginx
   ```

## Step 5: SSL Certificate

```bash
# Install Let's Encrypt certificate
sudo certbot --nginx -d 32cbgg8.com -d www.32cbgg8.com
```

## Step 6: Verify Deployment

- [ ] Main app: `curl http://localhost:3000/health`
- [ ] RAG service: `curl http://localhost:8000/health`
- [ ] Redis: `redis-cli ping`
- [ ] Nginx: `curl https://32cbgg8.com/health`
- [ ] SSL: `curl -I https://32cbgg8.com`

## Step 7: Monitoring

### Docker Commands
```bash
docker-compose ps
docker-compose logs -f
docker stats
```

### PM2 Commands
```bash
pm2 status
pm2 logs
pm2 monit
```

### System Monitoring
```bash
htop
df -h
free -h
systemctl status nginx redis cf-rag-service
```

## Step 8: Backup Setup

```bash
# Create backup script
nano ~/backup-cbthis.sh
chmod +x ~/backup-cbthis.sh

# Add to crontab
crontab -e
# Add: 0 3 * * * ~/backup-cbthis.sh
```

## Troubleshooting Quick Reference

### Port Conflicts
```bash
sudo netstat -tlnp | grep -E '3000|8000|6379|80|443'
```

### Service Issues
```bash
# Docker
docker-compose down
docker-compose up -d

# PM2
pm2 restart all
sudo systemctl restart cf-rag-service
```

### Memory Issues
```bash
# Add swap if needed
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

### Log Locations
- Nginx: `/var/log/nginx/`
- PM2: `pm2 logs`
- Docker: `docker-compose logs`
- RAG service: `/var/www/cbthis/rag-service/logs/`

## Support Resources

- Application health: https://32cbgg8.com/health
- RAG API docs: https://32cbgg8.com/api/rag/docs
- System info: `/etc/cbthis/deployment-info.txt`

## Final Checklist

- [ ] All services running
- [ ] SSL certificate active
- [ ] Health checks passing
- [ ] Firewall configured
- [ ] Backups scheduled
- [ ] Monitoring in place
- [ ] Documentation updated

Remember to commit any configuration changes and keep your deployment documentation up to date!