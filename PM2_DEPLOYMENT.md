# PM2/venv Deployment Guide for CF Travel Bot on Hostinger VPS

This guide provides step-by-step instructions for deploying the Canadian Forces Travel Instructions Chatbot using PM2 and Python venv on your Hostinger VPS (46.202.177.230).

## Prerequisites

- SSH access to your VPS as root
- A domain name pointing to your VPS IP (46.202.177.230)
- API keys for: OpenAI, Google Gemini, and Anthropic
- At least 2GB RAM (4GB recommended)

## Step 1: Initial VPS Setup

```bash
# Connect to your VPS
ssh root@46.202.177.230

# Update system packages
apt update && apt upgrade -y

# Install essential packages
apt install -y curl wget git nano build-essential

# Create a non-root user (recommended for security)
adduser deploy
usermod -aG sudo deploy

# Copy SSH keys to new user (run from your local machine)
# ssh-copy-id deploy@46.202.177.230

# Switch to deploy user
su - deploy
```

## Step 2: Install System Dependencies

```bash
# Add repositories for newer versions
sudo add-apt-repository ppa:deadsnakes/ppa -y
sudo apt update

# Install all required system packages
sudo apt install -y \
    nginx \
    redis-server \
    python3.11 \
    python3.11-venv \
    python3.11-dev \
    python3-pip \
    gcc \
    g++ \
    make \
    libssl-dev \
    libffi-dev \
    libpq-dev \
    libxml2-dev \
    libxslt1-dev \
    libjpeg-dev \
    zlib1g-dev \
    libpng-dev \
    libmagic1 \
    poppler-utils \
    tesseract-ocr \
    libreoffice \
    supervisor
```

## Step 3: Install Node.js and PM2

```bash
# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version
npm --version

# Install PM2 globally
sudo npm install -g pm2

# Setup PM2 to start on boot
pm2 startup systemd -u deploy --hp /home/deploy
# Follow the command it outputs
```

## Step 4: Setup Application Directory

```bash
# Create application directory
sudo mkdir -p /var/www/cbthis
sudo chown -R deploy:deploy /var/www/cbthis

# Clone the repository
cd /var/www
git clone https://github.com/yourusername/cbthis.git
cd cbthis
```

## Step 5: Configure Node.js Application

```bash
# Install Node dependencies
npm ci

# Create production environment file
nano .env.production
```

Add the following content:

```env
# Node Environment
NODE_ENV=production
PORT=3000

# API Keys
VITE_GEMINI_API_KEY=your_gemini_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Redis Configuration
REDIS_URL=redis://localhost:6379
ENABLE_CACHE=true
CACHE_TTL=3600000

# Rate Limiting
ENABLE_RATE_LIMIT=true
RATE_LIMIT_MAX=60
RATE_LIMIT_WINDOW=60000

# Logging
ENABLE_LOGGING=true
LOG_LEVEL=info

# RAG Service
RAG_SERVICE_URL=http://localhost:8000
```

```bash
# Build the frontend
npm run build:production

# Update PM2 ecosystem file
nano ecosystem.config.cjs
```

Ensure the paths are correct in ecosystem.config.cjs:

```javascript
module.exports = {
  apps: [
    {
      name: 'cf-travel-bot',
      script: './server/main.js',
      cwd: '/var/www/cbthis',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      // ... rest of config
    }
  ]
};
```

## Step 6: Setup Python RAG Service

```bash
# Navigate to RAG service directory
cd /var/www/cbthis/rag-service

# Create Python virtual environment
python3.11 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Upgrade pip
pip install --upgrade pip setuptools wheel

# Install dependencies (this may take a while)
# First, install numpy to avoid conflicts
pip install numpy==1.26.2

# Install PyTorch CPU version (lighter than GPU version)
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu

# Install remaining requirements
pip install -r requirements.txt

# Create necessary directories
mkdir -p chroma_db logs cooccurrence_index

# Create .env file for RAG service
nano .env
```

Add RAG service environment variables:

```env
# Copy the same API keys from main .env.production
OPENAI_API_KEY=your_openai_api_key_here
VITE_GEMINI_API_KEY=your_gemini_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Redis Configuration
REDIS_URL=redis://localhost:6379

# RAG Configuration
RAG_CHUNK_SIZE=1000
RAG_CHUNK_OVERLAP=200
RAG_RETRIEVAL_K=5
```

## Step 7: Configure Redis

```bash
# Edit Redis configuration
sudo nano /etc/redis/redis.conf
```

Make these changes:
```conf
# Set memory limit
maxmemory 512mb
maxmemory-policy allkeys-lru

# Enable persistence
appendonly yes
```

```bash
# Restart Redis
sudo systemctl restart redis
sudo systemctl enable redis
```

## Step 8: Create Systemd Service for RAG

```bash
# Create systemd service file
sudo nano /etc/systemd/system/cf-rag-service.service
```

Add the following content:

```ini
[Unit]
Description=CF Travel Bot RAG Service
After=network.target redis.service

[Service]
Type=simple
User=deploy
WorkingDirectory=/var/www/cbthis/rag-service
Environment="PATH=/var/www/cbthis/rag-service/venv/bin:/usr/local/bin:/usr/bin:/bin"
Environment="PYTHONUNBUFFERED=1"
ExecStart=/var/www/cbthis/rag-service/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
Restart=always
RestartSec=10
StandardOutput=append:/var/www/cbthis/rag-service/logs/rag-service.log
StandardError=append:/var/www/cbthis/rag-service/logs/rag-service-error.log

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start the service
sudo systemctl daemon-reload
sudo systemctl enable cf-rag-service
sudo systemctl start cf-rag-service

# Check status
sudo systemctl status cf-rag-service
```

## Step 9: Start Node.js Application with PM2

```bash
# Navigate back to main directory
cd /var/www/cbthis

# Start the application with PM2
pm2 start ecosystem.config.cjs --env production

# Save PM2 configuration
pm2 save

# Check status
pm2 status
pm2 logs cf-travel-bot
```

## Step 10: Configure Nginx

```bash
# Remove default site
sudo rm -f /etc/nginx/sites-enabled/default

# Create new site configuration
sudo nano /etc/nginx/sites-available/cbthis
```

Add the following configuration:

```nginx
# Upstream definitions
upstream app_backend {
    server localhost:3000;
    keepalive 32;
}

upstream rag_backend {
    server localhost:8000;
    keepalive 16;
}

# HTTP server - redirect to HTTPS (after SSL is set up)
server {
    listen 80;
    server_name 32cbgg8.com www.32cbgg8.com;
    
    # Allow Let's Encrypt challenges
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    
    # Redirect all other traffic to HTTPS (uncomment after SSL setup)
    # location / {
    #     return 301 https://$server_name$request_uri;
    # }
    
    # For initial setup without SSL:
    location / {
        proxy_pass http://app_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # SSE support
        proxy_buffering off;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
    
    # RAG service proxy
    location /api/rag/ {
        proxy_pass http://rag_backend/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Increase timeouts for RAG processing
        proxy_connect_timeout 60s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
    
    # Health check endpoint
    location /health {
        proxy_pass http://app_backend/health;
        access_log off;
    }
}
```

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/cbthis /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
sudo systemctl enable nginx
```

## Step 11: Setup SSL with Let's Encrypt

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtain SSL certificate
sudo certbot --nginx -d 32cbgg8.com -d www.32cbgg8.com

# The certificate will auto-renew. Test renewal:
sudo certbot renew --dry-run
```

## Step 12: Configure Firewall

```bash
# Setup UFW firewall
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

# Check status
sudo ufw status
```

## Step 13: Setup Log Rotation

```bash
# Configure PM2 log rotation
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7

# Create logrotate config for RAG service
sudo nano /etc/logrotate.d/cf-rag-service
```

Add:
```
/var/www/cbthis/rag-service/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 deploy deploy
    sharedscripts
    postrotate
        systemctl reload cf-rag-service > /dev/null 2>&1 || true
    endscript
}
```

## Monitoring and Maintenance

### Check Service Status
```bash
# PM2 status
pm2 status
pm2 logs

# RAG service status
sudo systemctl status cf-rag-service
sudo journalctl -u cf-rag-service -f

# Nginx status
sudo systemctl status nginx

# Redis status
sudo systemctl status redis
```

### Monitor Resources
```bash
# Install htop for better monitoring
sudo apt install -y htop

# Check memory usage
free -h

# Check disk usage
df -h

# Monitor in real-time
htop
```

### Update Application
```bash
cd /var/www/cbthis

# Pull latest changes
git pull origin main

# Update Node.js app
npm ci
npm run build:production
pm2 restart cf-travel-bot

# Update RAG service
cd rag-service
source venv/bin/activate
pip install -r requirements.txt
sudo systemctl restart cf-rag-service
```

### Backup Strategy
```bash
# Create backup script
nano /home/deploy/backup.sh
```

Add:
```bash
#!/bin/bash
BACKUP_DIR="/home/deploy/backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup Redis
redis-cli BGSAVE
sleep 5
sudo cp /var/lib/redis/dump.rdb $BACKUP_DIR/redis_$DATE.rdb

# Backup ChromaDB
tar -czf $BACKUP_DIR/chromadb_$DATE.tar.gz -C /var/www/cbthis/rag-service chroma_db/

# Backup environment files
tar -czf $BACKUP_DIR/env_$DATE.tar.gz -C /var/www/cbthis .env.production .env

# Keep only last 7 days of backups
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete
find $BACKUP_DIR -name "*.rdb" -mtime +7 -delete
```

```bash
chmod +x /home/deploy/backup.sh

# Add to crontab
crontab -e
# Add: 0 3 * * * /home/deploy/backup.sh
```

## Troubleshooting

### Memory Issues
If you run out of memory during Python package installation:

```bash
# Add swap space
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Make permanent
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Port Conflicts
```bash
# Check what's using ports
sudo netstat -tlnp | grep -E ':3000|:8000|:6379'

# Kill process using a port
sudo fuser -k 3000/tcp
```

### Service Won't Start
```bash
# Check logs
pm2 logs cf-travel-bot
sudo journalctl -u cf-rag-service -n 100

# Check permissions
ls -la /var/www/cbthis
```

### Python Package Issues
```bash
# If packages fail to install, try:
cd /var/www/cbthis/rag-service
source venv/bin/activate

# Clear pip cache
pip cache purge

# Install with no cache
pip install --no-cache-dir -r requirements.txt
```

## Security Checklist

- [ ] Created non-root user
- [ ] Configured SSH key authentication
- [ ] Disabled password authentication
- [ ] Changed SSH port (optional)
- [ ] Configured firewall (UFW)
- [ ] SSL certificate installed
- [ ] Environment files have restricted permissions
- [ ] Regular system updates scheduled
- [ ] Backup strategy implemented
- [ ] Log rotation configured

## Performance Optimization

### Optimize PM2
```bash
# Set cluster mode for better performance
pm2 scale cf-travel-bot 2

# Monitor performance
pm2 monit
```

### Optimize Python/RAG Service
```bash
# Edit systemd service to add more workers
sudo nano /etc/systemd/system/cf-rag-service.service
# Change: --workers 2 (or more based on CPU cores)

sudo systemctl daemon-reload
sudo systemctl restart cf-rag-service
```

### Monitor and Optimize
```bash
# Install monitoring tools
sudo apt install -y nethogs iotop

# Monitor network usage
sudo nethogs

# Monitor disk I/O
sudo iotop
```

Remember to add your real API keys to the environment files.