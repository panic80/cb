# Deployment Strategies

This document outlines the procedures for deploying the application to a Hostinger VPS.

## 1. Manual Deployment to Hostinger VPS with PM2

This method involves manually connecting to the VPS via SSH and updating the application. Ensure Node.js and PM2 are pre-installed on the VPS.

**Steps:**

1.  **Connect to VPS:**
    ```bash
    ssh your_username@your_vps_ip
    ```

2.  **Navigate to Project Directory:**
    ```bash
    cd /path/to/your/project
    ```
    *Replace `/path/to/your/project` with the actual path on the VPS.*

3.  **Update Code:**
    Pull the latest changes from your repository's main branch (or the relevant branch).
    ```bash
    git checkout main
    git pull origin main
    ```

4.  **Install/Update Dependencies:**
    Install any new or updated Node.js packages.
    ```bash
    npm install
    ```

5.  **Build Project (If Applicable):**
    If your project requires a build step (e.g., for frontend assets or TypeScript compilation).
    ```bash
    npm run build
    ```
    *(Check your `package.json` if a build script is necessary)*

6.  **Restart Application with PM2:**
    Use your PM2 ecosystem configuration file (`ecosystem.config.cjs` is assumed based on project files) to restart the application. This ensures zero-downtime reloads if configured correctly.
    ```bash
    pm2 reload ecosystem.config.cjs --env production
    # Or, if it's the first time or 'reload' causes issues:
    # pm2 restart ecosystem.config.cjs --env production
    ```

7.  **Check Status and Logs:**
    Verify the application restarted correctly and check for any errors.
    ```bash
    pm2 status
    pm2 logs [app-name] # Replace [app-name] with the name defined in your ecosystem file
    ```

## 2. CI/CD with GitHub Actions

Automating deployment using GitHub Actions provides consistency and reduces manual effort. This workflow triggers on pushes to the `main` branch.

**Conceptual Overview:**

The workflow will run on a GitHub-hosted runner. It will check out the code, set up Node.js, install dependencies, build the project, and then securely connect to the VPS via SSH to deploy the new code and restart the PM2 process.

**Key Considerations:**

*   **Secrets:** Store sensitive information like your VPS SSH private key, SSH host, SSH user, and any necessary environment variables as encrypted secrets in your GitHub repository settings (`Settings` > `Secrets and variables` > `Actions`). **Never commit secrets directly into your code.**
*   **SSH Agent:** Use an action like `webfactory/ssh-agent` to securely load your SSH private key for the deployment step.
*   **PM2 Restart:** The SSH command executed on the VPS will navigate to the project directory, pull the latest code, install dependencies, build (if needed), and finally reload the PM2 process.

**Basic Workflow Example (`.github/workflows/deploy.yml`):**

```yaml
name: Deploy to VPS

on:
  push:
    branches:
      - main # Or your deployment branch

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
    - name: Checkout code
      uses: actions/checkout@v4

    - name: Set up Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20' # Specify your Node.js version
        cache: 'npm'

    - name: Install dependencies
      run: npm install

    - name: Build project
      run: npm run build # Add this step if your project needs building

    - name: Setup SSH Agent
      uses: webfactory/ssh-agent@v0.9.0
      with:
        ssh-private-key: ${{ secrets.VPS_SSH_PRIVATE_KEY }}

    - name: Deploy to VPS and Restart PM2
      env:
        SSH_HOST: ${{ secrets.VPS_SSH_HOST }}
        SSH_USER: ${{ secrets.VPS_SSH_USER }}
      run: |
        # Add remote host key to known_hosts to avoid prompt
        ssh-keyscan -H $SSH_HOST >> ~/.ssh/known_hosts

        # Execute deployment commands on VPS
        ssh $SSH_USER@$SSH_HOST << 'EOF'
          cd /path/to/your/project # IMPORTANT: Use the correct path on your VPS
          git checkout main
          git pull origin main
          npm install --production # Install only production dependencies
          npm run build # Run build if necessary
          pm2 reload ecosystem.config.cjs --env production # Or pm2 restart
        EOF

    - name: Verify Deployment (Optional)
      # Add steps here to curl an endpoint or check PM2 status remotely if possible
            run: |
        echo "Attempting to verify deployment at https://32cbgg8.com ..."
        curl -sSf https://32cbgg8.com || (echo "Verification failed!" && exit 1)
        echo "Verification successful!"
```

**Note:** This is a basic example. You might need to adjust paths, commands, Node.js versions, and add error handling based on your specific project and VPS setup. Remember to configure the required secrets (`VPS_SSH_PRIVATE_KEY`, `VPS_SSH_HOST`, `VPS_SSH_USER`) in your GitHub repository.