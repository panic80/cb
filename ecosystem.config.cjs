module.exports = {
  apps: [
    {
      name: 'cf-travel-bot',
      script: './server/main.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3000,
        LOG_LEVEL: 'debug'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        LOG_LEVEL: 'warn'
      },
      instances: 'max',
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/cf-travel-bot-error.log',
      out_file: './logs/cf-travel-bot-out.log',
      merge_logs: true,
      time: true,
      restart_delay: 4000
    }
  ],

  // Deployment Configuration
  deploy: {
    production: {
      user: 'root',
      host: '46.202.177.230',
      path: '/var/www/32cbgg8.com',
      repo: 'git@github.com:yourusername/pb-cline.git',
      ref: 'origin/main',
      'pre-deploy': 'mkdir -p /var/log/pb-cline',
      'post-deploy': 'npm ci && npm run build && NODE_ENV=production pm2 reload ecosystem.config.cjs --env production && pm2 save',
      'pre-setup': 'npm install -g pm2',
      env: {
        NODE_ENV: 'production',
        VITE_GEMINI_API_KEY: '{{GEMINI_API_KEY}}'
      }
    },
    staging: {
      user: 'deployer',
      host: 'staging.32cbgg8.com',
      path: '/var/www/staging.32cbgg8.com',
      'post-deploy': 'npm ci && npm run build && NODE_ENV=staging pm2 reload ecosystem.config.cjs --env staging',
      env: {
        NODE_ENV: 'staging',
        PORT: 3000,
        PROXY_PORT: 3001
      }
    }
  }
};
