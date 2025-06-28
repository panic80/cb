#!/bin/bash

# VPS Setup Script for CF Travel Bot
# This script automates the initial setup of your VPS for deployment

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_info() {
    echo -e "${BLUE}[i]${NC} $1"
}

# Function to check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        print_error "This script must be run as root"
        exit 1
    fi
}

# Function to create a non-root user
create_user() {
    local username=$1
    
    if id "$username" &>/dev/null; then
        print_warning "User $username already exists"
        return 0
    fi
    
    print_info "Creating user $username..."
    adduser --gecos "" "$username"
    usermod -aG sudo "$username"
    print_status "User $username created and added to sudo group"
    
    # Setup SSH directory
    mkdir -p /home/$username/.ssh
    chmod 700 /home/$username/.ssh
    
    # Copy root's authorized_keys if exists
    if [ -f /root/.ssh/authorized_keys ]; then
        cp /root/.ssh/authorized_keys /home/$username/.ssh/
        chown -R $username:$username /home/$username/.ssh
        chmod 600 /home/$username/.ssh/authorized_keys
        print_status "SSH keys copied to $username"
    fi
}

# Function to update system
update_system() {
    print_info "Updating system packages..."
    apt update && apt upgrade -y
    print_status "System updated"
}

# Function to install base dependencies
install_base_deps() {
    print_info "Installing base dependencies..."
    apt install -y \
        curl \
        wget \
        git \
        nano \
        vim \
        htop \
        build-essential \
        software-properties-common \
        apt-transport-https \
        ca-certificates \
        gnupg \
        lsb-release \
        ufw \
        fail2ban
    
    print_status "Base dependencies installed"
}

# Function to setup firewall
setup_firewall() {
    print_info "Setting up UFW firewall..."
    
    # Default policies
    ufw default deny incoming
    ufw default allow outgoing
    
    # Allow SSH (make sure to update if you change SSH port)
    ufw allow 22/tcp
    
    # Allow HTTP and HTTPS
    ufw allow 80/tcp
    ufw allow 443/tcp
    
    # Enable firewall
    ufw --force enable
    
    print_status "Firewall configured and enabled"
}

# Function to install Docker
install_docker() {
    print_info "Installing Docker..."
    
    # Remove old versions
    apt remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true
    
    # Install Docker
    curl -fsSL https://get.docker.com | sh
    
    # Install Docker Compose
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    
    # Add user to docker group if specified
    if [ -n "$DEPLOY_USER" ]; then
        usermod -aG docker "$DEPLOY_USER"
    fi
    
    # Start and enable Docker
    systemctl start docker
    systemctl enable docker
    
    print_status "Docker and Docker Compose installed"
}

# Function to install Node.js and PM2
install_nodejs_pm2() {
    print_info "Installing Node.js 18.x..."
    
    # Install Node.js
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt install -y nodejs
    
    # Install PM2
    npm install -g pm2
    
    print_status "Node.js and PM2 installed"
}

# Function to install Python 3.11
install_python() {
    print_info "Installing Python 3.11..."
    
    # Add deadsnakes PPA
    add-apt-repository ppa:deadsnakes/ppa -y
    apt update
    
    # Install Python 3.11 and related packages
    apt install -y \
        python3.11 \
        python3.11-venv \
        python3.11-dev \
        python3-pip
    
    print_status "Python 3.11 installed"
}

# Function to install system services
install_services() {
    print_info "Installing system services..."
    
    # Install Redis
    apt install -y redis-server
    
    # Configure Redis
    sed -i 's/^# maxmemory <bytes>/maxmemory 512mb/' /etc/redis/redis.conf
    sed -i 's/^# maxmemory-policy noeviction/maxmemory-policy allkeys-lru/' /etc/redis/redis.conf
    sed -i 's/^appendonly no/appendonly yes/' /etc/redis/redis.conf
    
    systemctl restart redis-server
    systemctl enable redis-server
    
    # Install Nginx
    apt install -y nginx
    
    # Remove default site
    rm -f /etc/nginx/sites-enabled/default
    
    systemctl start nginx
    systemctl enable nginx
    
    print_status "Redis and Nginx installed and configured"
}

# Function to install additional dependencies for RAG
install_rag_deps() {
    print_info "Installing RAG service dependencies..."
    
    apt install -y \
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
        libreoffice
    
    print_status "RAG dependencies installed"
}

# Function to setup swap if needed
setup_swap() {
    local swap_size=$1
    
    # Check if swap already exists
    if [ -f /swapfile ]; then
        print_warning "Swap file already exists"
        return 0
    fi
    
    print_info "Creating ${swap_size}G swap file..."
    
    fallocate -l ${swap_size}G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    
    # Make permanent
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    
    print_status "${swap_size}G swap file created"
}

# Function to create application directories
create_app_directories() {
    print_info "Creating application directories..."
    
    mkdir -p /var/www/cbthis
    mkdir -p /var/log/cbthis
    mkdir -p /etc/cbthis
    
    if [ -n "$DEPLOY_USER" ]; then
        chown -R $DEPLOY_USER:$DEPLOY_USER /var/www/cbthis
        chown -R $DEPLOY_USER:$DEPLOY_USER /var/log/cbthis
    fi
    
    print_status "Application directories created"
}

# Main menu
show_menu() {
    echo ""
    echo "========================================"
    echo "   CF Travel Bot VPS Setup Script"
    echo "========================================"
    echo ""
    echo "This script will help you set up your VPS for deployment."
    echo ""
    echo "Select deployment method:"
    echo "1) Docker deployment (Recommended)"
    echo "2) PM2/venv deployment"
    echo "3) Both (install all dependencies)"
    echo "4) Exit"
    echo ""
    read -p "Enter your choice [1-4]: " choice
}

# Main execution
main() {
    check_root
    
    echo "========================================"
    echo "   CF Travel Bot VPS Setup"
    echo "========================================"
    echo ""
    
    # Ask for deploy user
    read -p "Enter username for deployment (default: deploy): " DEPLOY_USER
    DEPLOY_USER=${DEPLOY_USER:-deploy}
    
    # Check total memory
    total_mem=$(free -m | grep Mem | awk '{print $2}')
    print_info "Total memory: ${total_mem}MB"
    
    if [ $total_mem -lt 2048 ]; then
        print_warning "Less than 2GB RAM detected. Swap file recommended."
        read -p "Create swap file? (y/n): " create_swap_answer
        if [[ $create_swap_answer =~ ^[Yy]$ ]]; then
            read -p "Swap size in GB (default: 4): " swap_size
            swap_size=${swap_size:-4}
            setup_swap $swap_size
        fi
    fi
    
    # Basic setup
    update_system
    install_base_deps
    create_user $DEPLOY_USER
    setup_firewall
    
    # Show menu
    show_menu
    
    case $choice in
        1)
            print_info "Installing Docker deployment dependencies..."
            install_docker
            install_services
            create_app_directories
            ;;
        2)
            print_info "Installing PM2/venv deployment dependencies..."
            install_nodejs_pm2
            install_python
            install_services
            install_rag_deps
            create_app_directories
            ;;
        3)
            print_info "Installing all dependencies..."
            install_docker
            install_nodejs_pm2
            install_python
            install_services
            install_rag_deps
            create_app_directories
            ;;
        4)
            print_info "Exiting..."
            exit 0
            ;;
        *)
            print_error "Invalid choice"
            exit 1
            ;;
    esac
    
    # Final steps
    print_info "Creating deployment info file..."
    cat > /etc/cbthis/deployment-info.txt << EOF
CF Travel Bot Deployment Information
====================================
Date: $(date)
Deploy User: $DEPLOY_USER
Deployment Type: $choice
Memory: ${total_mem}MB
VPS IP: $(curl -s http://ipinfo.io/ip)

Services Installed:
- Nginx: $(nginx -v 2>&1 | cut -d' ' -f3)
- Redis: $(redis-server --version | cut -d' ' -f3)
$(command -v docker >/dev/null && echo "- Docker: $(docker --version | cut -d' ' -f3)")
$(command -v node >/dev/null && echo "- Node.js: $(node --version)")
$(command -v pm2 >/dev/null && echo "- PM2: $(pm2 --version)")
$(command -v python3.11 >/dev/null && echo "- Python: $(python3.11 --version | cut -d' ' -f2)")

Next Steps:
1. Clone your repository to /var/www/cbthis
2. Configure environment variables
3. Follow the appropriate deployment guide:
   - Docker: DOCKER_DEPLOYMENT.md
   - PM2/venv: PM2_DEPLOYMENT.md
EOF
    
    print_status "Setup complete!"
    echo ""
    print_info "Deployment information saved to: /etc/cbthis/deployment-info.txt"
    print_info "You can now proceed with deployment as user: $DEPLOY_USER"
    echo ""
    echo "To switch to deploy user:"
    echo "  su - $DEPLOY_USER"
    echo ""
    echo "To clone your repository:"
    echo "  cd /var/www"
    echo "  git clone https://github.com/yourusername/cbthis.git"
    echo ""
}

# Run main function
main "$@"