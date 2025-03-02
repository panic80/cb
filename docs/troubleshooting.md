# Troubleshooting Guide

This guide provides solutions to common issues that may arise during development, deployment, or operation of the application.

## API Connection Issues

### Gemini API Not Responding

**Symptoms**:
- "Unable to generate response" error messages
- Empty or incomplete AI responses
- Network errors in console

**Possible Causes**:
1. Invalid API key
2. Rate limiting
3. Network connectivity issues
4. Incorrect model name

**Solutions**:

1. **Verify API Key**:
   ```bash
   # Check environment variable
   echo $VITE_GEMINI_API_KEY
   
   # Verify key format (should start with 'AIza')
   ```

2. **Check for Rate Limiting**:
   - Look for 429 status codes in network requests
   - Wait a few minutes before retrying
   - Review Proxy server logs for rate limit messages

3. **Verify Model Name**:
   - Ensure you're using `gemini-2.0-flash` or `gemini-2.0-flash-lite`
   - Check for typos in model name

4. **Test Direct API Access**:
   ```bash
   curl -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"contents":[{"parts":[{"text":"Hello, how are you?"}]}]}'
   ```

## Server Issues

### Proxy Server Not Starting

**Symptoms**:
- Connection refused errors
- "Cannot reach server" messages
- Server exits immediately after starting

**Possible Causes**:
1. Port conflicts
2. Missing dependencies
3. Environment configuration issues

**Solutions**:

1. **Check for Port Conflicts**:
   ```bash
   # Check if ports are already in use
   lsof -i :3000
   lsof -i :3001
   
   # Kill processes if needed
   kill -9 <PID>
   ```

2. **Verify Environment Setup**:
   - Check for `.env` file with required variables
   - Ensure Node.js version is 18+

3. **Check Server Logs**:
   ```bash
   # In development
   npm run dev -- --verbose
   
   # In production
   pm2 logs
   ```

### Server Crashes in Production

**Symptoms**:
- 502 Bad Gateway errors
- PM2 reports process died
- Application unavailable

**Solutions**:

1. **Check System Resources**:
   ```bash
   # Check memory usage
   free -m
   
   # Check disk space
   df -h
   ```

2. **Review PM2 Logs**:
   ```bash
   pm2 logs --lines 100
   ```

3. **Verify Node.js Heap Size**:
   - Adjust max memory in ecosystem.config.cjs if needed

4. **Restart Services**:
   ```bash
   pm2 restart all
   sudo service nginx restart
   ```

## Frontend Issues

### Build Failures

**Symptoms**:
- Build process fails
- TypeScript errors
- Missing dependencies

**Solutions**:

1. **Clean and Rebuild**:
   ```bash
   # Remove build artifacts
   rm -rf dist
   rm -rf node_modules/.vite
   
   # Reinstall dependencies
   npm ci
   
   # Rebuild
   npm run build
   ```

2. **Check TypeScript Errors**:
   ```bash
   npx tsc --noEmit
   ```

3. **Update Dependencies**:
   ```bash
   npm update
   ```

### Chat Interface Not Working

**Symptoms**:
- Messages not sending
- No responses from AI
- UI elements missing or broken

**Solutions**:

1. **Check Browser Console for Errors**
2. **Verify API Connection**:
   - Check Network tab in DevTools
   - Ensure proxy server is running
3. **Clear Browser Cache and Storage**:
   - Clear IndexedDB storage
   - Clear browser cache
4. **Test in Incognito/Private Browsing Mode**

## Caching Issues

### Stale Data Persisting

**Symptoms**:
- Old content continues to display after updates
- Changes not reflecting

**Solutions**:

1. **Clear Client-Side Cache**:
   ```javascript
   // Run in browser console
   indexedDB.deleteDatabase('travel-instructions-cache');
   ```

2. **Clear Server Cache**:
   ```bash
   # Restart the proxy server
   pm2 restart proxy-server
   ```

3. **Force Cache Revalidation**:
   ```bash
   # Add cache-busting parameter to URL
   ?cache=false
   ```

## Deployment Issues

### Nginx Configuration Problems

**Symptoms**:
- 502 Bad Gateway errors
- CORS errors
- Redirects not working

**Solutions**:

1. **Verify Nginx Configuration**:
   ```bash
   sudo nginx -t
   ```

2. **Check Nginx Logs**:
   ```bash
   sudo tail -f /var/log/nginx/error.log
   ```

3. **Restart Nginx**:
   ```bash
   sudo service nginx restart
   ```

### SSL Certificate Issues

**Symptoms**:
- Browser security warnings
- Certificate errors
- Mixed content warnings

**Solutions**:

1. **Check Certificate Status**:
   ```bash
   sudo certbot certificates
   ```

2. **Renew Certificates**:
   ```bash
   sudo certbot renew --dry-run
   sudo certbot renew
   ```

3. **Force HTTPS Redirection**:
   - Verify Nginx config includes redirection from HTTP to HTTPS

## Environment-Specific Debugging

### Development Environment

For debugging in development:

1. **Enable Verbose Logging**:
   ```bash
   # Set environment variable
   DEBUG=app:* npm run dev
   ```

2. **Use Browser DevTools**:
   - Network tab for API requests
   - Console for JavaScript errors
   - Application tab for storage inspection

### Production Environment

For debugging in production:

1. **Enable Temporary Debug Mode**:
   ```bash
   # Edit ecosystem.config.cjs to add DEBUG env var
   pm2 reload ecosystem.config.cjs
   ```

2. **Check All Log Sources**:
   ```bash
   # Application logs
   pm2 logs
   
   # Nginx logs
   sudo tail -f /var/log/nginx/error.log
   
   # System logs
   sudo journalctl -u nginx
   sudo journalctl -u pm2-root
   ```

## When All Else Fails

If you've tried everything above:

1. **Perform a Clean Restart**:
   ```bash
   # Stop all services
   pm2 stop all
   sudo service nginx stop
   
   # Start services in order
   pm2 start ecosystem.config.cjs
   sudo service nginx start
   ```

2. **Verify System Time**:
   ```bash
   date
   # If incorrect, sync NTP
   sudo timedatectl set-ntp true
   ```

3. **Check System Resource Limits**:
   ```bash
   ulimit -a
   ```

4. **Consider Server Reboot** (last resort):
   ```bash
   sudo reboot
   ```