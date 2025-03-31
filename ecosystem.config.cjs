module.exports = {
  apps: [
    {
      name: 'main-server',
      script: './server/main.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/var/log/pb-cline/main-error.log',
      out_file: '/var/log/pb-cline/main-out.log',
      time: true,
      restart_delay: 4000
    },
    {
      name: 'proxy-server',
      script: './server/proxy.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/var/log/pb-cline/proxy-error.log',
      out_file: '/var/log/pb-cline/proxy-out.log',
      time: true,
      restart_delay: 4000
    }
  ],

  // Deployment Configuration
  deploy: {
    production: {
      user: 'appuser',
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
