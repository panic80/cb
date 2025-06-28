#!/bin/bash

# VPS Discovery Script for CF Travel Bot Deployment
# This script analyzes the VPS environment to prepare for deployment

echo "================================================"
echo "VPS Discovery Script for CF Travel Bot"
echo "================================================"
echo ""

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# System Information
echo "=== System Information ==="
echo "Hostname: $(hostname)"
echo "OS: $(cat /etc/os-release | grep PRETTY_NAME | cut -d'"' -f2)"
echo "Kernel: $(uname -r)"
echo "Architecture: $(uname -m)"
echo "CPU Cores: $(nproc)"
echo "Total Memory: $(free -h | grep Mem | awk '{print $2}')"
echo "Available Memory: $(free -h | grep Mem | awk '{print $7}')"
echo "Disk Usage:"
df -h | grep -E "^/dev/"
echo ""

# Check existing web directories
echo "=== Web Directories ==="
for dir in /var/www /home/*/public_html /srv /opt; do
    if [ -d "$dir" ]; then
        echo "Found: $dir"
        ls -la "$dir" 2>/dev/null | head -5
    fi
done
echo ""

# Check installed software
echo "=== Installed Software ==="

# Node.js
if command_exists node; then
    echo "✓ Node.js: $(node --version)"
else
    echo "✗ Node.js: Not installed"
fi

# npm
if command_exists npm; then
    echo "✓ npm: $(npm --version)"
else
    echo "✗ npm: Not installed"
fi

# Python
if command_exists python3; then
    echo "✓ Python3: $(python3 --version)"
    # Check specific Python versions
    for ver in python3.11 python3.10 python3.9; do
        if command_exists $ver; then
            echo "  - $ver: $($ver --version)"
        fi
    done
else
    echo "✗ Python3: Not installed"
fi

# PM2
if command_exists pm2; then
    echo "✓ PM2: $(pm2 --version)"
    echo "  PM2 processes:"
    pm2 list
else
    echo "✗ PM2: Not installed"
fi

# Docker
if command_exists docker; then
    echo "✓ Docker: $(docker --version)"
    if command_exists docker-compose; then
        echo "✓ Docker Compose: $(docker-compose --version)"
    else
        echo "✗ Docker Compose: Not installed"
    fi
    echo "  Docker containers:"
    docker ps -a 2>/dev/null || echo "  (Docker daemon not running or no permission)"
else
    echo "✗ Docker: Not installed"
fi

# Redis
if command_exists redis-server; then
    echo "✓ Redis: $(redis-server --version | head -1)"
    if systemctl is-active --quiet redis-server || systemctl is-active --quiet redis; then
        echo "  Redis is running"
    else
        echo "  Redis is not running"
    fi
else
    echo "✗ Redis: Not installed"
fi

# Nginx
if command_exists nginx; then
    echo "✓ Nginx: $(nginx -v 2>&1)"
    if systemctl is-active --quiet nginx; then
        echo "  Nginx is running"
        echo "  Nginx sites enabled:"
        ls /etc/nginx/sites-enabled/ 2>/dev/null || echo "  No sites-enabled directory"
    else
        echo "  Nginx is not running"
    fi
else
    echo "✗ Nginx: Not installed"
fi

# Apache (check if competing web server exists)
if command_exists apache2; then
    echo "⚠ Apache2 is installed (may conflict with Nginx)"
    if systemctl is-active --quiet apache2; then
        echo "  Apache2 is running on port: $(netstat -tlnp 2>/dev/null | grep apache2 | awk '{print $4}')"
    fi
fi

echo ""

# Check ports
echo "=== Port Usage ==="
echo "Active listening ports:"
netstat -tlnp 2>/dev/null | grep LISTEN | grep -E ':80|:443|:3000|:3001|:6379|:8000' || \
    ss -tlnp 2>/dev/null | grep LISTEN | grep -E ':80|:443|:3000|:3001|:6379|:8000' || \
    echo "Could not check ports (need root privileges)"
echo ""

# Check firewall
echo "=== Firewall Status ==="
if command_exists ufw; then
    ufw status 2>/dev/null || echo "UFW installed but need root to check status"
elif command_exists firewall-cmd; then
    firewall-cmd --list-all 2>/dev/null || echo "Firewalld installed but need root to check"
else
    echo "No common firewall detected (ufw/firewalld)"
fi
echo ""

# Check systemd services
echo "=== Relevant Systemd Services ==="
for service in nginx redis redis-server postgresql mysql docker pm2-root pm2-$USER; do
    if systemctl list-units --full -all | grep -Fq "$service.service"; then
        echo "$service: $(systemctl is-active $service 2>/dev/null || echo 'unknown')"
    fi
done
echo ""

# Check existing Node.js apps
echo "=== Existing Node.js Applications ==="
if [ -d /var/www ]; then
    find /var/www -name "package.json" -type f 2>/dev/null | while read pkg; do
        dir=$(dirname "$pkg")
        echo "Found Node.js app in: $dir"
        if [ -f "$dir/package.json" ]; then
            echo "  Name: $(grep '"name"' "$dir/package.json" | head -1 | cut -d'"' -f4)"
        fi
    done
fi
echo ""

# Check Python environments
echo "=== Python Virtual Environments ==="
find /var/www /home /opt -name "venv" -type d 2>/dev/null | head -10
find /var/www /home /opt -name ".venv" -type d 2>/dev/null | head -10
find /var/www /home /opt -name "virtualenv" -type d 2>/dev/null | head -10
echo ""

# Environment recommendations
echo "=== Deployment Recommendations ==="
echo ""

# Check if Docker is recommended
total_mem=$(free -m | grep Mem | awk '{print $2}')
if [ $total_mem -ge 4096 ]; then
    echo "✓ Sufficient memory for Docker deployment ($total_mem MB)"
    if command_exists docker; then
        echo "  Docker is already installed - Docker deployment recommended"
    else
        echo "  Docker not installed - can use either Docker or PM2/venv deployment"
    fi
else
    echo "⚠ Limited memory ($total_mem MB) - PM2/venv deployment recommended"
fi

# Check Python version for RAG service
if command_exists python3.11; then
    echo "✓ Python 3.11 available - optimal for RAG service"
elif command_exists python3.10; then
    echo "⚠ Python 3.10 available - will work but 3.11 recommended"
else
    echo "✗ Python 3.11 not found - need to install for RAG service"
fi

# Check for competing services
if systemctl is-active --quiet apache2 2>/dev/null; then
    echo "⚠ Apache2 is running - will need to disable or reconfigure"
fi

echo ""
echo "=== Next Steps ==="
echo "1. Save this output for deployment planning"
echo "2. Ensure you have backups of any existing applications"
echo "3. Prepare API keys for services (OpenAI, Gemini, Anthropic)"
echo "4. Decide between Docker or PM2/venv deployment"
echo ""
echo "Script completed: $(date)"