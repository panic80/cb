#\!/bin/bash

# CF Travel Bot Health Check Script
# Usage: ./health-check.sh [url] [timeout] [max_attempts]

set -e

# Default values
DEFAULT_URL="http://localhost:3000/health"
DEFAULT_TIMEOUT=30
DEFAULT_MAX_ATTEMPTS=3

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parameters
URL="${1:-$DEFAULT_URL}"
TIMEOUT="${2:-$DEFAULT_TIMEOUT}"
MAX_ATTEMPTS="${3:-$DEFAULT_MAX_ATTEMPTS}"

# Function to print colored output
print_status() {
    echo -e "${GREEN}[HEALTH]${NC} $1"
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

# Function to check HTTP endpoint
check_http_endpoint() {
    local url=$1
    local timeout=$2
    
    print_info "Checking HTTP endpoint: $url (timeout: ${timeout}s)"
    
    # Use curl to check the endpoint
    response=$(curl -s -w "%{http_code}|%{time_total}|%{size_download}" \
                   --max-time "$timeout" \
                   --connect-timeout 10 \
                   "$url" 2>/dev/null) || return 1
    
    # Parse response
    http_code=$(echo "$response" | grep -o '[0-9]*|[0-9.]*|[0-9]*$' | cut -d'|' -f1)
    response_time=$(echo "$response" | grep -o '[0-9]*|[0-9.]*|[0-9]*$' | cut -d'|' -f2)
    response_size=$(echo "$response" | grep -o '[0-9]*|[0-9.]*|[0-9]*$' | cut -d'|' -f3)
    
    if [ "$http_code" = "200" ]; then
        print_status "HTTP endpoint OK (${http_code}) - Response time: ${response_time}s, Size: ${response_size} bytes"
        return 0
    else
        print_error "HTTP endpoint failed (${http_code:-000})"
        return 1
    fi
}

# Function to parse and validate health response
validate_health_response() {
    local url=$1
    
    print_info "Validating health response format..."
    
    # Get the actual response body
    response_body=$(curl -s --max-time 10 "$url" 2>/dev/null) || {
        print_error "Failed to get response body"
        return 1
    }
    
    # Check if response is valid JSON
    if \! echo "$response_body" | python3 -m json.tool > /dev/null 2>&1; then
        print_warning "Response is not valid JSON"
        echo "$response_body"
        return 1
    fi
    
    # Parse JSON and check required fields
    status=$(echo "$response_body" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('status', 'unknown'))
except:
    print('error')
    " 2>/dev/null)
    
    if [ "$status" = "healthy" ] || [ "$status" = "ok" ]; then
        print_status "Health status: $status"
        
        # Show additional health information if available
        echo "$response_body" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if 'checks' in data:
        print('\\n${BLUE}[INFO]${NC} Health check details:')
        for key, value in data['checks'].items():
            status_icon = '✓' if value == 'ok' else '✗'
            print(f'  {status_icon} {key}: {value}')
    if 'timestamp' in data:
        print(f'\\n${BLUE}[INFO]${NC} Last updated: {data[\"timestamp\"]}')
    if 'uptime' in data:
        print(f'${BLUE}[INFO]${NC} Uptime: {data[\"uptime\"]}')
except:
    pass
        " 2>/dev/null || true
        
        return 0
    else
        print_error "Health status: $status"
        echo "$response_body"
        return 1
    fi
}

# Function to check system resources (if accessible)
check_system_resources() {
    local url=$1
    
    print_info "Checking system resources..."
    
    # Try to get system info from health endpoint
    response_body=$(curl -s --max-time 10 "$url" 2>/dev/null) || {
        print_warning "Could not retrieve system resource information"
        return 0
    }
    
    # Parse system information if available
    echo "$response_body" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if 'system' in data:
        system = data['system']
        if 'memory' in system:
            memory = system['memory']
            print(f'${BLUE}[INFO]${NC} Memory usage: {memory.get(\"used\", \"unknown\")} / {memory.get(\"total\", \"unknown\")}')
        if 'cpu' in system:
            cpu = system['cpu']
            print(f'${BLUE}[INFO]${NC} CPU load: {cpu.get(\"load\", \"unknown\")}')
        if 'disk' in system:
            disk = system['disk']
            print(f'${BLUE}[INFO]${NC} Disk usage: {disk.get(\"used\", \"unknown\")} / {disk.get(\"total\", \"unknown\")}')
except:
    pass
    " 2>/dev/null || true
}

# Main health check function
perform_health_check() {
    local url=$1
    local timeout=$2
    
    print_info "Starting health check for: $url"
    
    # Basic HTTP endpoint check
    if \! check_http_endpoint "$url" "$timeout"; then
        return 1
    fi
    
    # Validate health response format
    if \! validate_health_response "$url"; then
        return 1
    fi
    
    # Check system resources
    check_system_resources "$url"
    
    print_status "Health check completed successfully ✓"
    return 0
}

# Usage function
usage() {
    echo "Usage: $0 [url] [timeout] [max_attempts]"
    echo ""
    echo "Parameters:"
    echo "  url          - Health check URL (default: $DEFAULT_URL)"
    echo "  timeout      - Request timeout in seconds (default: $DEFAULT_TIMEOUT)"
    echo "  max_attempts - Maximum number of attempts (default: $DEFAULT_MAX_ATTEMPTS)"
    echo ""
    echo "Examples:"
    echo "  $0                                           # Use defaults"
    echo "  $0 http://localhost:3000/health              # Custom URL"
    echo "  $0 http://staging.example.com/health 60 5    # Custom URL, timeout, and attempts"
    echo ""
    echo "Exit codes:"
    echo "  0 - Health check passed"
    echo "  1 - Health check failed"
    echo "  2 - Invalid arguments or configuration"
    echo ""
    exit 2
}

# Validate arguments
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    usage
fi

# Validate URL format
if \! echo "$URL" | grep -E "^https?://" > /dev/null; then
    print_error "Invalid URL format: $URL"
    print_error "URL must start with http:// or https://"
    usage
fi

# Validate timeout
if \! [[ "$TIMEOUT" =~ ^[0-9]+$ ]] || [ "$TIMEOUT" -lt 1 ] || [ "$TIMEOUT" -gt 300 ]; then
    print_error "Invalid timeout: $TIMEOUT"
    print_error "Timeout must be a number between 1 and 300 seconds"
    usage
fi

# Validate max attempts
if \! [[ "$MAX_ATTEMPTS" =~ ^[0-9]+$ ]] || [ "$MAX_ATTEMPTS" -lt 1 ] || [ "$MAX_ATTEMPTS" -gt 10 ]; then
    print_error "Invalid max attempts: $MAX_ATTEMPTS"
    print_error "Max attempts must be a number between 1 and 10"
    usage
fi

# Main execution
print_info "Health Check Configuration:"
print_info "  URL: $URL"
print_info "  Timeout: ${TIMEOUT}s"
print_info "  Max attempts: $MAX_ATTEMPTS"
echo ""

# Perform health check with retries
for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
    if [ "$attempt" -gt 1 ]; then
        print_warning "Attempt $attempt of $MAX_ATTEMPTS"
        sleep 5
    fi
    
    if perform_health_check "$URL" "$TIMEOUT"; then
        print_status "Health check passed on attempt $attempt ✓"
        exit 0
    else
        if [ "$attempt" -eq "$MAX_ATTEMPTS" ]; then
            print_error "Health check failed after $MAX_ATTEMPTS attempts ✗"
            exit 1
        else
            print_warning "Attempt $attempt failed, retrying..."
        fi
    fi
done

# Should not reach here, but just in case
print_error "Health check failed"
exit 1
HEALTH_EOF < /dev/null