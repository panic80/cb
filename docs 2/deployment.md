# Deployment Guide

This document provides detailed instructions for deploying the application to a Hostinger VPS.

## Prerequisites

- Hostinger VPS with Ubuntu 20.04 or later
- Node.js 18+ installed
- Domain name configured with DNS pointing to the VPS
- SSH access to the server

## Environment Setup

1. **Set up environment variables**

Create a `.env` file at the root of your project:

```
PORT=3000
PROXY_PORT=3001
NODE_ENV=production
VITE_GEMINI_API_KEY=your-api-key-here
```

2. **Install PM2 for process management**

```bash
npm install -g pm2
```

## Application Deployment

1. **Clone repository to the server**

```bash
git clone https://github.com/yourusername/your-repo.git
cd your-repo
```

2. **Install dependencies**

```bash
npm install --production
```

3. **Build the application**

```bash
npm run build
```

4. **Start the application with PM2**

```bash
pm2 start ecosystem.config.cjs
```

5. **Configure PM2 to start on system boot**

```bash
pm2 startup
pm2 save
```

## Nginx Configuration

1. **Install Nginx**

```bash
sudo apt-get update
sudo apt-get install nginx
```

2. **Create Nginx configuration**

Create a file at `/etc/nginx/sites-available/pb-cline`:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Rate limiting for external API requests
    location /api/gemini/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        
        # Additional rate limiting at Nginx level
        limit_req zone=api burst=10 nodelay;
        limit_req_status 429;
    }
}

# Define rate limiting zone
limit_req_zone $binary_remote_addr zone=api:10m rate=20r/m;
```

3. **Enable the site and restart Nginx**

```bash
sudo ln -s /etc/nginx/sites-available/pb-cline /etc/nginx/sites-enabled/
sudo nginx -t
sudo service nginx restart
```

4. **Set up SSL with Let's Encrypt**

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

## Hostinger VPS Specific Setup

1. **Configure Firewall**

Allow necessary ports:

```bash
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

2. **Set up Log Rotation**

Create a file at `/etc/logrotate.d/pm2-pb-cline`:

```
/var/log/pb-cline/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 www-data adm
}
```

## Monitoring and Maintenance

1. **Monitor application logs**

```bash
pm2 logs
```

2. **Check application status**

```bash
pm2 status
```

3. **Monitor health endpoint**

Visit `https://yourdomain.com/health` to check the application's health status.

4. **Restart the application**

```bash
pm2 restart all
```

## Updating the Application

To deploy updates to the application:

1. **Pull latest changes**

```bash
cd /path/to/your/app
git pull origin main
```

2. **Install dependencies and rebuild**

```bash
npm install --production
npm run build
```

3. **Restart the application**

```bash
pm2 reload ecosystem.config.cjs
```

## Troubleshooting

### API Key Issues

If you encounter API key issues:

1. Verify the API key in your `.env` file
2. Check PM2 environment variables:

```bash
pm2 env 0
```

3. Restart the application after updating the API key:

```bash
pm2 restart all
```

### Connection Refused

If you see connection refused errors:

1. Check if the server is running:

```bash
pm2 status
```

2. Verify port configuration:

```bash
netstat -tuln | grep '3000\|3001'
```

3. Check firewall settings:

```bash
sudo ufw status
```

### Rate Limiting Issues

If users are hitting rate limits:

1. Check Nginx logs:

```bash
sudo tail -f /var/log/nginx/error.log | grep "limiting"
```

2. Adjust rate limits in Nginx config if needed.

## Backup and Recovery

Regularly back up important data:

```bash
# Back up PM2 process list
pm2 save

# Back up environment variables
cp .env .env.backup

# Back up Nginx configs
sudo cp /etc/nginx/sites-available/pb-cline /etc/nginx/sites-available/pb-cline.backup
```