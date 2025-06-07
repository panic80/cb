#!/bin/bash

# Force Cache Refresh Script
# This script helps users clear their browser cache and see the latest version

echo "=== CF Travel Bot Cache Refresh Helper ==="
echo ""

# Get current deployment info
echo "Checking current deployment..."
DEPLOYMENT_INFO=$(curl -s http://32cbgg8.com/api/deployment-info 2>/dev/null || curl -s https://32cbgg8.com/api/deployment-info 2>/dev/null)

if [ $? -eq 0 ]; then
    echo "Current deployment info:"
    echo "$DEPLOYMENT_INFO" | jq '.' 2>/dev/null || echo "$DEPLOYMENT_INFO"
else
    echo "Could not fetch deployment info - server may be down"
fi

echo ""
echo "=== Manual Cache Clearing Instructions ==="
echo ""
echo "To see the latest version, please:"
echo "1. Press Ctrl+F5 (or Cmd+Shift+R on Mac) to hard refresh"
echo "2. Or clear browser cache:"
echo "   - Chrome: Settings > Privacy and security > Clear browsing data"
echo "   - Firefox: Settings > Privacy & Security > Clear Data"
echo "   - Safari: Safari menu > Clear History"
echo ""
echo "3. If still not working, try incognito/private browsing mode"
echo ""
echo "=== Quick Test URLs ==="
echo "- Health check: http://32cbgg8.com/health"
echo "- Config: http://32cbgg8.com/api/config"
echo "- Deployment info: http://32cbgg8.com/api/deployment-info"
echo ""