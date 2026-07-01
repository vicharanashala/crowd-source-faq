# Deployment Guide

The platform is designed to be deployed either via a **unified single-container Docker image** (recommended for production) or directly on a virtual private server (VPS/Bare-metal) using a process manager like **PM2**.

---

## 1. Unified Docker Deployment (Recommended)

The project includes a multi-stage `Dockerfile` in `apps/backend/Dockerfile` that builds the Vite frontend, compiles backend dependencies, and packages both into a single runtime image. The backend automatically serves the frontend static assets out of the box.

### Build the Image
Run this command from the root of the monorepo:
```bash
docker build -t csfaq-app -f apps/backend/Dockerfile .
```

### Run the Container
Start the container and map the API port (`6767`):
```bash
docker run -d \
  -p 6767:6767 \
  --name csfaq-instance \
  --env-file apps/backend/.env \
  csfaq-app
```

### Secret Management (Infisical)
The Docker runtime includes the **Infisical CLI** for pulling secrets at runtime. If you use Infisical for secret injection:
- Ensure your orchestration environment passes the `INFISICAL_TOKEN` env variable to the container.
- Modify the startup command to:
  ```bash
  infisical run -- node --import tsx src/server.ts
  ```

---

## 2. PM2 / Virtual Private Server (VPS) Deployment

To deploy directly on a Linux VPS (e.g. Ubuntu):

### Prerequisites
- Node.js 22 or later
- pnpm 9.x (`npm install -g pnpm@9`)
- PM2 (`npm install -g pm2`)

### Setup and Build
1. Clone the repository and navigate to the directory:
   ```bash
   git clone <repo-url> csfaq && cd csfaq
   ```
2. Install monorepo dependencies:
   ```bash
   pnpm install --frozen-lockfile
   ```
3. Create and configure your environment files:
   - `apps/backend/.env`
   - `apps/frontend/.env`
4. Build the workspace:
   ```bash
   pnpm build
   ```

### Start the Application
Create a PM2 process file `ecosystem.config.js` in the root:
```javascript
module.exports = {
  apps: [
    {
      name: 'csfaq-backend',
      cwd: './apps/backend',
      script: 'node',
      args: '--import tsx src/server.ts',
      env: {
        NODE_ENV: 'production',
        PORT: 6767
      }
    }
  ]
};
```

Launch the server:
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

---

## 3. Nginx Reverse Proxy Configuration

To expose the application to the web on a specific domain over SSL, configure Nginx as a reverse proxy.

Add this location block to your server config (usually in `/etc/nginx/sites-available/default`):

```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;

    # SSL configuration here...

    # Route all /csfaq traffic (both frontend and API) to the Node server
    location /csfaq {
        proxy_pass http://127.0.0.1:6767;
        proxy_http_version 1.1;
        
        # Enable WebSockets (needed for hot-reloads and status sync)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        
        # Forward client headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Disable caching for the API routes
        proxy_cache_bypass $http_upgrade;
    }
}
```

Test and reload Nginx:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## 4. Health Checks and Monitoring

- **API Endpoint**: The backend serves a healthcheck endpoint at `/csfaq/api/health`. It returns a 200 OK status containing health details (database connection state, Redis connectivity, and bot integrations status).
- **Docker Healthcheck**: The Dockerfile includes a built-in health check:
  ```bash
  curl -sf http://localhost:6767/csfaq/api/health || exit 1
  ```
  This runs every 30 seconds to ensure the process remains responsive.
