#\!/bin/bash

# CF Travel Bot Deployment Script
# Usage: ./deploy.sh [staging|production] [server_user] [server_host]

set -e

ENVIRONMENT=$1
SERVER_USER=$2
SERVER_HOST=$3

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Usage function
usage() {
    echo "Usage: $0 [staging|production] [server_user] [server_host]"
    echo ""
    echo "Examples:"
    echo "  $0 staging ubuntu staging.32cbgg8.com"
    echo "  $0 production ubuntu 32cbgg8.com"
    echo ""
    echo "Required environment variables for production:"
    echo "  - SSH_PRIVATE_KEY (path to SSH private key)"
    echo ""
    exit 1
}

# Validate arguments
if [ $# -ne 3 ]; then
    print_error "Invalid number of arguments"
    usage
fi

if [ "$ENVIRONMENT" \!= "staging" ] && [ "$ENVIRONMENT" \!= "production" ]; then
    print_error "Environment must be 'staging' or 'production'"
    usage
fi

# Set deployment configuration based on environment
if [ "$ENVIRONMENT" == "production" ]; then
    APP_DIR="/home/$SERVER_USER/apps/cf-travel-bot"
    PM2_APP="cf-travel-bot"
    PORT=3000
    HEALTH_URL="http://$SERVER_HOST/health"
    KEEP_RELEASES=5
    BUILD_COMMAND="build:production"
elif [ "$ENVIRONMENT" == "staging" ]; then
    APP_DIR="/home/$SERVER_USER/apps/cf-travel-bot-staging"
    PM2_APP="cf-travel-bot-staging"
    PORT=3001
    HEALTH_URL="http://$SERVER_HOST/health"
    KEEP_RELEASES=3
    BUILD_COMMAND="build:staging"
fi

print_status "Starting deployment to $ENVIRONMENT environment"
print_status "Target: $SERVER_USER@$SERVER_HOST"
print_status "App directory: $APP_DIR"

# Pre-deployment checks
print_status "Running pre-deployment checks..."

# Check if we're in the correct directory
if [ \! -f "package.json" ]; then
    print_error "package.json not found. Please run from project root directory."
    exit 1
fi

# Check if we can connect to the server
if \! ssh -o ConnectTimeout=10 -o BatchMode=yes "$SERVER_USER@$SERVER_HOST" exit 2>/dev/null; then
    print_error "Cannot connect to server $SERVER_USER@$SERVER_HOST"
    print_error "Please check your SSH configuration and ensure the server is accessible"
    exit 1
fi

# Install dependencies and build locally
print_status "Installing dependencies..."
npm ci

print_status "Running tests..."
npm run test || {
    print_error "Tests failed. Deployment aborted."
    exit 1
}

print_status "Building application for $ENVIRONMENT..."
npm run $BUILD_COMMAND || {
    print_error "Build failed. Deployment aborted."
    exit 1
}

# Create deployment package
print_status "Creating deployment package..."
PACKAGE_NAME="cf-travel-bot-$ENVIRONMENT-$(date +%Y%m%d%H%M%S).tar.gz"

tar -czf "$PACKAGE_NAME" \
    --exclude=node_modules \
    --exclude=.git \
    --exclude=.env.* \
    --exclude=logs \
    --exclude=screenshots \
    --exclude=dev.log \
    --exclude=proxy.log \
    --exclude=server.log \
    --exclude=vite.log \
    --exclude="*.tar.gz" \
    .

# Upload to server
print_status "Uploading package to server..."
scp "$PACKAGE_NAME" "$SERVER_USER@$SERVER_HOST:/tmp/"

# Remove local package
rm "$PACKAGE_NAME"

# Deploy on server
print_status "Deploying application on server..."
ssh "$SERVER_USER@$SERVER_HOST" << EOF
set -e

# Create deployment directory
TIMESTAMP=\$(date +%Y%m%d%H%M%S)
DEPLOY_DIR="$APP_DIR"
RELEASE_DIR="\$DEPLOY_DIR/releases/\$TIMESTAMP"

echo "Creating release directory: \$RELEASE_DIR"
mkdir -p "\$RELEASE_DIR"

# Extract application
cd "\$RELEASE_DIR"
tar -xzf "/tmp/$PACKAGE_NAME"
rm "/tmp/$PACKAGE_NAME"

# Install production dependencies
echo "Installing production dependencies..."
npm ci --production --silent

# Copy environment file
if [ -f "\$DEPLOY_DIR/shared/.env.$ENVIRONMENT" ]; then
    echo "Copying environment configuration..."
    cp "\$DEPLOY_DIR/shared/.env.$ENVIRONMENT" .env
else
    echo "Warning: Environment file \$DEPLOY_DIR/shared/.env.$ENVIRONMENT not found"
fi

# Build frontend (in case we need server-side build)
echo "Building frontend..."
npm run $BUILD_COMMAND --silent

# Create backup of current release (production only)
if [ "$ENVIRONMENT" == "production" ] && [ -L "\$DEPLOY_DIR/current" ]; then
    echo "Creating backup of current release..."
    BACKUP_DIR="\$DEPLOY_DIR/backup/\$(date +%Y%m%d%H%M%S)"
    mkdir -p "\$BACKUP_DIR"
    cp -r \$(readlink "\$DEPLOY_DIR/current")/* "\$BACKUP_DIR/" 2>/dev/null || true
fi

# Update symlink atomically
echo "Updating current release symlink..."
ln -sfn "\$RELEASE_DIR" "\$DEPLOY_DIR/current"

# Reload PM2 application
echo "Reloading PM2 application: $PM2_APP"
pm2 reload "$PM2_APP" || {
    echo "PM2 app not found, starting new instance..."
    cd "\$DEPLOY_DIR/current"
    pm2 start ecosystem.config.cjs --only "$PM2_APP"
}

# Cleanup old releases
echo "Cleaning up old releases (keeping last $KEEP_RELEASES)..."
cd "\$DEPLOY_DIR/releases"
ls -t | tail -n +\$((${KEEP_RELEASES} + 1)) | xargs -r rm -rf

# Cleanup old backups (production only)
if [ "$ENVIRONMENT" == "production" ] && [ -d "\$DEPLOY_DIR/backup" ]; then
    echo "Cleaning up old backups (keeping last 3)..."
    cd "\$DEPLOY_DIR/backup"
    ls -t | tail -n +4 | xargs -r rm -rf
fi

echo "Deployment completed successfully\!"
EOF

# Health check
print_status "Performing health check..."
sleep 10

HEALTH_CHECK_ATTEMPTS=5
HEALTH_CHECK_DELAY=10

for i in $(seq 1 $HEALTH_CHECK_ATTEMPTS); do
    if curl -f -s "$HEALTH_URL" > /dev/null; then
        print_status "Health check passed ✓"
        break
    else
        if [ $i -eq $HEALTH_CHECK_ATTEMPTS ]; then
            print_error "Health check failed after $HEALTH_CHECK_ATTEMPTS attempts"
            
            if [ "$ENVIRONMENT" == "production" ]; then
                print_warning "Initiating automatic rollback..."
                ssh "$SERVER_USER@$SERVER_HOST" << 'ROLLBACK_EOF'
                    DEPLOY_DIR="/home/$SERVER_USER/apps/cf-travel-bot"
                    if [ -d "$DEPLOY_DIR/backup" ]; then
                        BACKUP_DIR=$(ls -t "$DEPLOY_DIR/backup" | head -n 1)
                        if [ -n "$BACKUP_DIR" ]; then
                            echo "Rolling back to $BACKUP_DIR"
                            rm -f "$DEPLOY_DIR/current"
                            ln -s "$DEPLOY_DIR/backup/$BACKUP_DIR" "$DEPLOY_DIR/current"
                            pm2 reload cf-travel-bot-prod
                            echo "Rollback completed"
                        fi
                    fi
ROLLBACK_EOF
            fi
            exit 1
        else
            print_warning "Health check attempt $i failed, retrying in ${HEALTH_CHECK_DELAY}s..."
            sleep $HEALTH_CHECK_DELAY
        fi
    fi
done

print_status "Deployment to $ENVIRONMENT completed successfully\! 🎉"
print_status "Application is running at: $HEALTH_URL"

# Show PM2 status
print_status "Current PM2 status:"
ssh "$SERVER_USER@$SERVER_HOST" "pm2 status $PM2_APP"
DEPLOY_EOF < /dev/null