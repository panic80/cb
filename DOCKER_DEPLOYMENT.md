# Docker Deployment Guide for CF Travel Bot on Hostinger VPS

This guide provides step-by-step instructions for deploying the Canadian Forces Travel Instructions Chatbot using Docker on your Hostinger VPS (46.202.177.230).

## Prerequisites

- SSH access to your VPS as root
- A domain name pointing to your VPS IP (46.202.177.230)
- API keys for: OpenAI, Google Gemini, and Anthropic

## Step 1: Initial VPS Setup

```bash
# Connect to your VPS
ssh root@46.202.177.230

# Update system packages
apt update && apt upgrade -y

# Install essential packages
apt install -y curl wget git nano

# Create a non-root user (recommended for security)
adduser deploy
usermod -aG sudo deploy

# Copy SSH keys to new user (run from your local machine)
# ssh-copy-id deploy@46.202.177.230

# Switch to deploy user
su - deploy
```

## Step 2: Install Docker and Docker Compose

```bash
# Install Docker
curl -fsSL https://get.docker.com | sudo sh

# Add current user to docker group
sudo usermod -aG docker $USER

# Log out and back in for group changes to take effect
exit
ssh deploy@46.202.177.230

# Verify Docker installation
docker --version

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify Docker Compose installation
docker-compose --version
```

## Step 3: Setup Application Directory

```bash
# Create application directory
sudo mkdir -p /var/www/cbthis
sudo chown -R $USER:$USER /var/www/cbthis

# Clone the repository
cd /var/www
git clone https://github.com/yourusername/cbthis.git
cd cbthis
```

## Step 4: Configure Environment Variables

```bash
# Create production environment file
nano .env.production
```

Add the following content (replace with your actual API keys):

```env
# Node Environment
NODE_ENV=production
PORT=3000

# API Keys
VITE_GEMINI_API_KEY=your_gemini_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Redis Configuration
REDIS_URL=redis://redis:6379
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
RAG_SERVICE_URL=http://rag-service:8000
```

## Step 5: Build and Deploy with Docker Compose

```bash
# Build and start all services in detached mode
docker-compose up -d --build

# View logs to ensure everything is running
docker-compose logs -f

# Press Ctrl+C to exit log view
```

## Step 6: Setup Nginx as Reverse Proxy

```bash
# Install Nginx
sudo apt install -y nginx

# Remove default site
sudo rm /etc/nginx/sites-enabled/default

# Create new site configuration
sudo nano /etc/nginx/sites-available/cbthis
```

Add the following Nginx configuration:

```nginx
server {
    listen 80;
    server_name 32cbgg8.com www.32cbgg8.com;

    # Main application
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts for SSE
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://localhost:3000/health;
        access_log off;
    }
}
```

Enable the site:

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/cbthis /etc/nginx/sites-enabled/

# Test Nginx configuration
sudo nginx -t

# Reload Nginx
sudo systemctl restart nginx
```

## Step 7: Setup SSL with Let's Encrypt

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtain SSL certificate
sudo certbot --nginx -d 32cbgg8.com -d www.32cbgg8.com

# Follow the prompts and choose to redirect HTTP to HTTPS
```

## Step 8: Configure Firewall

```bash
# Install UFW if not already installed
sudo apt install -y ufw

# Allow SSH, HTTP, and HTTPS
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw --force enable

# Check status
sudo ufw status
```

## Step 9: Setup Docker Auto-restart

```bash
# Ensure Docker starts on boot
sudo systemctl enable docker

# Docker Compose services are already configured with restart: unless-stopped
```

## Step 10: Setup RAG Service (if not included in main docker-compose)

```bash
# Navigate to RAG service directory
cd /var/www/cbthis/rag-service

# Start RAG service with its own docker-compose
docker-compose up -d

# Check logs
docker-compose logs -f
```

## Monitoring and Maintenance

### View Container Status
```bash
docker ps
docker-compose ps
```

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f app
docker-compose logs -f redis
docker-compose logs -f nginx
```

### Restart Services
```bash
# Restart all services
docker-compose restart

# Restart specific service
docker-compose restart app
```

### Update Application
```bash
cd /var/www/cbthis
git pull origin main
docker-compose build
docker-compose up -d
```

### Backup Data
```bash
# Backup Redis data
docker-compose exec redis redis-cli BGSAVE

# Backup ChromaDB (for RAG service)
sudo tar -czf chroma-backup-$(date +%Y%m%d).tar.gz rag-service/chroma_db/
```

### Monitor Resource Usage
```bash
# Overall system resources
htop

# Docker specific resources
docker stats

# Disk usage
df -h
du -sh /var/lib/docker/
```

## Troubleshooting

### Container Won't Start
```bash
# Check logs
docker-compose logs app

# Check if ports are in use
sudo netstat -tlnp | grep -E '3000|6379|8000'
```

### Out of Memory
```bash
# Add swap space
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Make permanent
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Clean Up Docker Resources
```bash
# Remove unused containers, networks, images
docker system prune -a

# Remove unused volumes
docker volume prune
```

## Security Checklist

- [ ] Changed default SSH port (optional)
- [ ] Disabled root SSH login
- [ ] Setup SSH key authentication
- [ ] Configured firewall (UFW)
- [ ] SSL certificate installed
- [ ] Environment variables secured
- [ ] Regular system updates scheduled
- [ ] Backup strategy implemented

## Performance Optimization

### Docker Compose Production Overrides
Create `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  app:
    restart: always
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
  
  redis:
    restart: always
    command: redis-server --appendonly yes --maxmemory 512mb --maxmemory-policy allkeys-lru
```

Use with:
```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Support and Updates

- Check application health: `curl https://32cbgg8.com/health`
- View real-time logs: `docker-compose logs -f`
- Update instructions are in the main README.md
- For issues, check the logs first, then system resources

Remember to add your real API keys to the environment file.