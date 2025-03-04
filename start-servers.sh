#!/bin/bash

# Start the proxy server
echo "Starting proxy server on port 3001..."
node server/proxy.js &
PROXY_PID=$!

# Wait for proxy server to start
sleep 2

# Start the main server
echo "Starting main server on port 3000..."
node server/main.js &
MAIN_PID=$!

# Handle graceful shutdown
trap 'kill $PROXY_PID $MAIN_PID; exit' SIGINT SIGTERM

# Keep script running
wait