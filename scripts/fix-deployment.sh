#!/bin/bash
# Fix deployment issues script
# This script helps recover from deployment failures

set -e

# Configuration
SERVER_USER="${1:-root}"
SERVER_HOST="${2:-46.202.177.230}"
ENVIRONMENT="${3:-production}"

if [ "$ENVIRONMENT" = "production" ]; then
    APP_NAME="cf-travel-bot"
    DEPLOY_DIR="/home/${SERVER_USER}/apps/cf-travel-bot"
else
    APP_NAME="cf-travel-bot-staging"
    DEPLOY_DIR="/home/${SERVER_USER}/apps/cf-travel-bot-staging"
fi

echo "=== Deployment Fix Script for ${ENVIRONMENT} ==="
echo "Server: ${SERVER_USER}@${SERVER_HOST}"
echo "App: ${APP_NAME}"
echo "Deploy directory: ${DEPLOY_DIR}"
echo ""

# Function to run SSH commands
run_ssh() {
    ssh "${SERVER_USER}@${SERVER_HOST}" "$@"
}

# Check current deployment status
echo "1. Checking current deployment status..."
run_ssh << EOF
    echo "=== Current symlink ==="
    if [ -L "${DEPLOY_DIR}/current" ]; then
        ls -la "${DEPLOY_DIR}/current"
        CURRENT_TARGET=\$(readlink -f "${DEPLOY_DIR}/current")
        echo "Points to: \$CURRENT_TARGET"
        
        if [ -d "\$CURRENT_TARGET/dist" ]; then
            echo "✅ dist/ folder exists"
            ls -la "\$CURRENT_TARGET/dist/" | head -5
        else
            echo "❌ dist/ folder missing"
        fi
    else
        echo "❌ No current symlink found"
    fi
    
    echo ""
    echo "=== Available releases ==="
    if [ -d "${DEPLOY_DIR}/releases" ]; then
        ls -lt "${DEPLOY_DIR}/releases" | head -10
    else
        echo "No releases directory found"
    fi
    
    echo ""
    echo "=== Available backups ==="
    if [ -d "${DEPLOY_DIR}/backup" ]; then
        ls -lt "${DEPLOY_DIR}/backup" | head -10
    else
        echo "No backup directory found"
    fi
    
    echo ""
    echo "=== PM2 Status ==="
    pm2 list | grep "${APP_NAME}" || echo "App not running in PM2"
EOF

# Find latest working release
echo ""
echo "2. Finding latest working release..."
run_ssh << EOF
    WORKING_RELEASE=""
    
    # Check releases first
    if [ -d "${DEPLOY_DIR}/releases" ]; then
        for release in \$(ls -t "${DEPLOY_DIR}/releases" 2>/dev/null); do
            if [ -f "${DEPLOY_DIR}/releases/\$release/dist/index.html" ]; then
                WORKING_RELEASE="${DEPLOY_DIR}/releases/\$release"
                echo "✅ Found working release: \$release"
                break
            fi
        done
    fi
    
    # If no working release, check backups
    if [ -z "\$WORKING_RELEASE" ] && [ -d "${DEPLOY_DIR}/backup" ]; then
        for backup in \$(ls -t "${DEPLOY_DIR}/backup" 2>/dev/null); do
            if [ -f "${DEPLOY_DIR}/backup/\$backup/dist/index.html" ]; then
                WORKING_RELEASE="${DEPLOY_DIR}/backup/\$backup"
                echo "✅ Found working backup: \$backup"
                break
            fi
        done
    fi
    
    if [ -n "\$WORKING_RELEASE" ]; then
        echo "Working directory: \$WORKING_RELEASE"
    else
        echo "❌ No working release or backup found"
        exit 1
    fi
EOF

# Fix deployment
echo ""
echo "3. Would you like to fix the deployment by pointing to the latest working release? (y/n)"
read -r response

if [ "$response" = "y" ]; then
    echo "Fixing deployment..."
    run_ssh << EOF
        set -e
        
        # Find the working release again
        WORKING_RELEASE=""
        
        # Check releases first
        if [ -d "${DEPLOY_DIR}/releases" ]; then
            for release in \$(ls -t "${DEPLOY_DIR}/releases" 2>/dev/null); do
                if [ -f "${DEPLOY_DIR}/releases/\$release/dist/index.html" ]; then
                    WORKING_RELEASE="${DEPLOY_DIR}/releases/\$release"
                    break
                fi
            done
        fi
        
        # If no working release, check backups
        if [ -z "\$WORKING_RELEASE" ] && [ -d "${DEPLOY_DIR}/backup" ]; then
            for backup in \$(ls -t "${DEPLOY_DIR}/backup" 2>/dev/null); do
                if [ -f "${DEPLOY_DIR}/backup/\$backup/dist/index.html" ]; then
                    WORKING_RELEASE="${DEPLOY_DIR}/backup/\$backup"
                    break
                fi
            done
        fi
        
        if [ -n "\$WORKING_RELEASE" ]; then
            echo "Updating symlink to: \$WORKING_RELEASE"
            ln -sfn "\$WORKING_RELEASE" "${DEPLOY_DIR}/current"
            
            # Verify the fix
            if [ -f "${DEPLOY_DIR}/current/dist/index.html" ]; then
                echo "✅ Symlink updated successfully"
                
                # Restart PM2
                echo "Restarting PM2 application..."
                pm2 restart "${APP_NAME}" || pm2 start "${DEPLOY_DIR}/current/ecosystem.config.cjs" --only "${APP_NAME}"
                
                echo "✅ Deployment fixed!"
            else
                echo "❌ Fix failed - dist/index.html still not accessible"
                exit 1
            fi
        else
            echo "❌ No working release found to fix deployment"
            exit 1
        fi
EOF
    
    # Verify the fix
    echo ""
    echo "4. Verifying the fix..."
    sleep 5
    
    if [ "$ENVIRONMENT" = "production" ]; then
        HEALTH_URL="https://aihelp.i9uuf6nb.workers.dev/health"
    else
        HEALTH_URL="http://${SERVER_HOST}:3001/health"
    fi
    
    echo "Checking health endpoint: $HEALTH_URL"
    if curl -f -s "$HEALTH_URL" > /dev/null; then
        echo "✅ Health check passed"
    else
        echo "❌ Health check failed"
    fi
else
    echo "Fix cancelled"
fi

echo ""
echo "Script completed"