# Deployment Guide for Hostinger VPS

This document provides detailed information for deploying this application to a Hostinger VPS. Follow these steps to ensure a smooth, secure deployment.

## API Security Enhancements

The following security enhancements have been implemented to make the application more secure and resilient for production deployment:

1. **API Key Security**
   - API keys can now be passed via headers instead of query parameters
   - Server validates API key format before processing requests
   - API keys are no longer exposed in logs or error messages

2. **Rate Limiting**
   - Implemented client-based rate limiting (60 requests per minute)
   - Proper 429 responses with Retry-After headers
   - Rate limiting statistics available via health check endpoint

3. **Error Handling**
   - Enhanced error classification (auth, rate limiting, server)
   - Production-safe error messages without stack traces
   - Standardized error response format
   - Exponential backoff with jitter for retries

4. **Caching**
   - Multi-level caching (memory + IndexedDB)
   - Stale-while-revalidate strategy for high availability
   - Cache invalidation with ETags and Last-Modified headers
   - Proper Cache-Control headers

5. **Fallback Content**
   - Graceful degradation when API is unavailable
   - Default content for critical paths

## Deployment Instructions

### Prerequisites
- Hostinger VPS with Node.js 18+ installed
- Domain name configured with DNS pointing to the VPS
- SSH access to the server

### Environment Setup

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

### Application Deployment

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

### Nginx Configuration

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

### Monitoring and Maintenance

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

## Troubleshooting

- **API Rate Limiting Issues**: Check `/var/log/nginx/error.log` for rate limiting errors
- **Application Crashes**: Check application logs with `pm2 logs`
- **Connection Refused Errors**: Ensure the application is running with `pm2 status`
- **API Key Issues**: Verify the API key in your `.env` file

## Security Best Practices

- Regularly rotate API keys
- Update Node.js and npm packages regularly
- Monitor server resources (CPU, memory, disk)
- Set up log rotation for application logs
- Configure a firewall to restrict access to essential ports only