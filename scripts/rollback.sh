#\!/bin/bash

# CF Travel Bot Rollback Script
# Usage: ./rollback.sh [staging|production] [server_user] [server_host] [release_number]

set -e

ENVIRONMENT=$1
SERVER_USER=$2
SERVER_HOST=$3
RELEASE_NUMBER=${4:-1}  # Default to previous release (1)

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[ROLLBACK]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

# Usage function
usage() {
    echo "Usage: $0 [staging|production] [server_user] [server_host] [release_number]"
    echo ""
    echo "Parameters:"
    echo "  environment    - Target environment (staging or production)"
    echo "  server_user    - SSH username for the server"
    echo "  server_host    - Server hostname or IP address"
    echo "  release_number - Number of releases to go back (default: 1)"
    echo ""
    echo "Examples:"
    echo "  $0 production ubuntu 32cbgg8.com      # Rollback to previous release"
    echo "  $0 staging ubuntu staging.example.com 2  # Rollback 2 releases"
    echo ""
    exit 1
}

# Validate arguments
if [ $# -lt 3 ] || [ $# -gt 4 ]; then
    print_error "Invalid number of arguments"
    usage
fi

if [ "$ENVIRONMENT" \!= "staging" ] && [ "$ENVIRONMENT" \!= "production" ]; then
    print_error "Environment must be 'staging' or 'production'"
    usage
fi

# Validate release number
if \! [[ "$RELEASE_NUMBER" =~ ^[0-9]+$ ]] || [ "$RELEASE_NUMBER" -lt 1 ] || [ "$RELEASE_NUMBER" -gt 10 ]; then
    print_error "Release number must be between 1 and 10"
    usage
fi

# Set deployment configuration based on environment
if [ "$ENVIRONMENT" == "production" ]; then
    APP_DIR="/home/$SERVER_USER/apps/cf-travel-bot"
    PM2_APP="cf-travel-bot-prod"
    HEALTH_URL="http://$SERVER_HOST/health"
elif [ "$ENVIRONMENT" == "staging" ]; then
    APP_DIR="/home/$SERVER_USER/apps/cf-travel-bot-staging"
    PM2_APP="cf-travel-bot-staging"
    HEALTH_URL="http://$SERVER_HOST/health"
fi

print_status "Starting rollback for $ENVIRONMENT environment"
print_info "Target: $SERVER_USER@$SERVER_HOST"
print_info "Rolling back $RELEASE_NUMBER release(s)"

# Check server connectivity
if \! ssh -o ConnectTimeout=10 -o BatchMode=yes "$SERVER_USER@$SERVER_HOST" exit 2>/dev/null; then
    print_error "Cannot connect to server $SERVER_USER@$SERVER_HOST"
    exit 1
fi

# Perform rollback on server
print_status "Performing rollback on server..."
ssh "$SERVER_USER@$SERVER_HOST" << EOF
set -e

DEPLOY_DIR="$APP_DIR"
RELEASES_DIR="\$DEPLOY_DIR/releases"

# Check if releases directory exists
if [ \! -d "\$RELEASES_DIR" ]; then
    echo "Error: Releases directory not found: \$RELEASES_DIR"
    exit 1
fi

# Get current release
CURRENT_RELEASE=\$(readlink "\$DEPLOY_DIR/current" 2>/dev/null | xargs basename) || {
    echo "Error: Current release symlink not found"
    exit 1
}

echo "Current release: \$CURRENT_RELEASE"

# List available releases
echo "Available releases:"
RELEASES=\$(ls -t "\$RELEASES_DIR" 2>/dev/null | head -10)
if [ -z "\$RELEASES" ]; then
    echo "Error: No releases found in \$RELEASES_DIR"
    exit 1
fi

echo "\$RELEASES" | nl -v0

# Calculate target release index
TARGET_INDEX=\$((${RELEASE_NUMBER}))

# Get target release
TARGET_RELEASE=\$(echo "\$RELEASES" | sed -n "\${TARGET_INDEX}p")

if [ -z "\$TARGET_RELEASE" ]; then
    echo "Error: Cannot find release at position $RELEASE_NUMBER"
    echo "Available releases: \$(echo "\$RELEASES" | wc -l)"
    exit 1
fi

if [ "\$TARGET_RELEASE" = "\$CURRENT_RELEASE" ]; then
    echo "Warning: Target release is the same as current release"
    echo "No rollback needed"
    exit 0
fi

echo "Target release: \$TARGET_RELEASE"

# Create backup of current state
echo "Creating backup of current state..."
BACKUP_DIR="\$DEPLOY_DIR/backup/rollback-\$(date +%Y%m%d%H%M%S)"
mkdir -p "\$BACKUP_DIR"
if [ -L "\$DEPLOY_DIR/current" ]; then
    cp -r "\$(readlink "\$DEPLOY_DIR/current")"/* "\$BACKUP_DIR/" 2>/dev/null || true
fi

# Perform rollback
echo "Rolling back to: \$TARGET_RELEASE"
ln -sfn "\$RELEASES_DIR/\$TARGET_RELEASE" "\$DEPLOY_DIR/current"

# Reload PM2 application
echo "Reloading PM2 application: $PM2_APP"
pm2 reload "$PM2_APP" || {
    echo "Error: Failed to reload PM2 application"
    # Attempt to restore backup
    if [ -L "\$BACKUP_DIR" ]; then
        echo "Attempting to restore from backup..."
        ln -sfn "\$BACKUP_DIR" "\$DEPLOY_DIR/current"
        pm2 reload "$PM2_APP"
    fi
    exit 1
}

echo "Rollback completed successfully\!"
echo "Active release: \$TARGET_RELEASE"
EOF

# Health check after rollback
print_status "Performing health check after rollback..."
sleep 10

HEALTH_CHECK_ATTEMPTS=5
HEALTH_CHECK_DELAY=10

for i in $(seq 1 $HEALTH_CHECK_ATTEMPTS); do
    if curl -f -s "$HEALTH_URL" > /dev/null; then
        print_status "Health check passed after rollback ✓"
        break
    else
        if [ $i -eq $HEALTH_CHECK_ATTEMPTS ]; then
            print_error "Health check failed after rollback"
            print_error "Manual intervention may be required"
            exit 1
        else
            print_warning "Health check attempt $i failed, retrying in ${HEALTH_CHECK_DELAY}s..."
            sleep $HEALTH_CHECK_DELAY
        fi
    fi
done

print_status "Rollback completed successfully\! 🎉"
print_info "Application is running at: $HEALTH_URL"

# Show current PM2 status
print_status "Current PM2 status:"
ssh "$SERVER_USER@$SERVER_HOST" "pm2 status $PM2_APP"

# Show rollback summary
print_info "Rollback Summary:"
print_info "  Environment: $ENVIRONMENT"
print_info "  Releases rolled back: $RELEASE_NUMBER"
print_info "  Health check: PASSED"
ROLLBACK_EOF < /dev/null