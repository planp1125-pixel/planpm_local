# 🚀 Plan-PM Local Server Deployment Guide

Deploy Plan-PM on a Windows machine as a local server, accessible from all computers on your network.

---

## 📋 Prerequisites

### On the Windows Server Machine:

| Requirement | Download |
|-------------|----------|
| Docker Desktop | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) |
| Git | [git-scm.com/download/win](https://git-scm.com/download/win) |
| 8GB+ RAM | Required for Supabase containers |

### Docker Desktop Setup:
1. Download and install Docker Desktop
2. During installation, select **WSL 2 backend** (recommended)
3. After install, restart your computer
4. Launch Docker Desktop and wait until it shows "Docker is running"

---

## 🛠️ Step-by-Step Installation

### Step 1: Clone the Repository

Open **PowerShell** or **Command Prompt** and run:

```powershell
cd C:\Projects
git clone https://github.com/planp1125-pixel/planpm_local.git planpm
cd planpm
```

### Step 2: Create Environment File

Create `.env.docker` file in the project root:

```env
# Supabase Keys (from Supabase CLI or generate your own)
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU
OPENAI_API_KEY=your_openai_key_here_optional
```

### Step 3: Get Your Server IP Address

Run in PowerShell:

```powershell
ipconfig
```

Look for **IPv4 Address** under your active network adapter (e.g., `192.168.1.100`)

### Step 4: Get Your Server IP Address

Run in PowerShell:

```powershell
ipconfig
```

Look for **IPv4 Address** under your active network adapter (e.g., `192.168.1.100`)

### Step 5: Update Configuration for Network Access

Edit `docker-compose.prod.yml` and replace all occurrences of `localhost` with your server IP:

```yaml
# Change these lines to use your IP:
- NEXT_PUBLIC_SUPABASE_URL=http://192.168.1.100:54321
- GOTRUE_SITE_URL: http://192.168.1.100:9002
- API_EXTERNAL_URL: http://192.168.1.100:54321
```

### Step 6: Build and Start Everything

```powershell
# Build and start all containers
docker-compose -f docker-compose.prod.yml --env-file .env.docker up -d --build

# Watch the logs (Ctrl+C to exit)
docker-compose -f docker-compose.prod.yml logs -f

# Check all services are running
docker-compose -f docker-compose.prod.yml ps
```

### Step 7: Verify Setup

Wait ~2 minutes for all services to start, then:

```powershell
# Check database is healthy
docker logs planpm_supabase_db 2>&1 | findstr "ready"

# Check app is running
curl http://localhost:9002
```

```yaml
# Production Docker Compose - Accessible on LAN
# Run: docker-compose -f docker-compose.prod.yml up -d

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile.prod
    container_name: planpm_app
    ports:
      - "80:3000"  # Accessible on port 80
    environment:
      - NODE_ENV=production
      - NEXT_PUBLIC_SUPABASE_URL=http://YOUR_SERVER_IP:54321
      - NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
    depends_on:
      supabase-db:
        condition: service_healthy
    networks:
      - planpm_network
    restart: unless-stopped

  supabase-db:
    image: supabase/postgres:15.1.1.78
    container_name: planpm_supabase_db
    ports:
      - "54322:5432"
    environment:
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: postgres
      JWT_SECRET: super-secret-jwt-token-with-at-least-32-characters-long
      JWT_EXP: 604800
    volumes:
      - supabase_db_data:/var/lib/postgresql/data
      - ./supabase/migrations:/docker-entrypoint-initdb.d/migrations
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 10
    networks:
      - planpm_network
    restart: unless-stopped

  supabase-auth:
    image: supabase/gotrue:v2.151.0
    container_name: planpm_supabase_auth
    ports:
      - "54321:9999"
    environment:
      GOTRUE_API_HOST: 0.0.0.0
      GOTRUE_API_PORT: 9999
      API_EXTERNAL_URL: http://YOUR_SERVER_IP:54321
      GOTRUE_DB_DRIVER: postgres
      GOTRUE_DB_DATABASE_URL: postgres://supabase_auth_admin:postgres@supabase-db:5432/postgres
      GOTRUE_SITE_URL: http://YOUR_SERVER_IP
      GOTRUE_URI_ALLOW_LIST: http://YOUR_SERVER_IP
      GOTRUE_DISABLE_SIGNUP: "false"
      GOTRUE_JWT_SECRET: super-secret-jwt-token-with-at-least-32-characters-long
      GOTRUE_JWT_EXP: 604800
      GOTRUE_MAILER_AUTOCONFIRM: "true"
    depends_on:
      supabase-db:
        condition: service_healthy
    networks:
      - planpm_network
    restart: unless-stopped

  supabase-rest:
    image: postgrest/postgrest:v12.0.2
    container_name: planpm_supabase_rest
    ports:
      - "54323:3000"
    environment:
      PGRST_DB_URI: postgres://authenticator:postgres@supabase-db:5432/postgres
      PGRST_DB_SCHEMAS: public,graphql_public
      PGRST_DB_ANON_ROLE: anon
      PGRST_JWT_SECRET: super-secret-jwt-token-with-at-least-32-characters-long
    depends_on:
      supabase-db:
        condition: service_healthy
    networks:
      - planpm_network
    restart: unless-stopped

  supabase-storage:
    image: supabase/storage-api:v0.46.4
    container_name: planpm_supabase_storage
    ports:
      - "54324:5000"
    environment:
      ANON_KEY: ${SUPABASE_ANON_KEY}
      SERVICE_KEY: ${SUPABASE_SERVICE_ROLE_KEY}
      POSTGREST_URL: http://supabase-rest:3000
      DATABASE_URL: postgres://supabase_storage_admin:postgres@supabase-db:5432/postgres
      FILE_SIZE_LIMIT: 52428800
      STORAGE_BACKEND: file
      FILE_STORAGE_BACKEND_PATH: /var/lib/storage
    volumes:
      - supabase_storage_data:/var/lib/storage
    depends_on:
      supabase-rest:
        condition: service_started
    networks:
      - planpm_network
    restart: unless-stopped

volumes:
  supabase_db_data:
  supabase_storage_data:

networks:
  planpm_network:
    driver: bridge
```

**⚠️ IMPORTANT:** Replace `YOUR_SERVER_IP` with your actual IP (e.g., `192.168.1.100`)

### Step 5: Create Production Dockerfile

Create `Dockerfile.prod`:

```dockerfile
# Production Dockerfile for Plan-PM
FROM node:20-alpine AS builder

WORKDIR /app
RUN apk add --no-cache libc6-compat

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT 3000

CMD ["node", "server.js"]
```

### Step 6: Update next.config.ts for Standalone Build

Add this to your `next.config.ts`:

```typescript
const nextConfig = {
  output: 'standalone',
  // ... rest of config
};
```

### Step 7: Build and Start

```powershell
# Build the containers
docker-compose -f docker-compose.prod.yml build

# Start all services
docker-compose -f docker-compose.prod.yml --env-file .env.docker up -d

# Check status
docker-compose -f docker-compose.prod.yml ps
```

---

## 🌐 Accessing from Other Computers

### On Client Computers (same network):

1. Open a web browser
2. Navigate to: `http://YOUR_SERVER_IP`
   - Example: `http://192.168.1.100`

### Windows Firewall Configuration:

On the server, allow incoming connections:

```powershell
# Run as Administrator
netsh advfirewall firewall add rule name="Plan-PM Web" dir=in action=allow protocol=tcp localport=80
netsh advfirewall firewall add rule name="Plan-PM Supabase Auth" dir=in action=allow protocol=tcp localport=54321
netsh advfirewall firewall add rule name="Plan-PM Supabase REST" dir=in action=allow protocol=tcp localport=54323
```

---

## 📊 What Docker Handles

| Component | Handled by Docker? |
|-----------|-------------------|
| Next.js App | ✅ Yes |
| PostgreSQL Database | ✅ Yes |
| Supabase Auth | ✅ Yes |
| Supabase REST API | ✅ Yes |
| Supabase Storage | ✅ Yes |
| Database Migrations | ✅ Yes (on first start) |
| Data Persistence | ✅ Yes (Docker volumes) |

---

## 🔧 Useful Commands

| Action | Command |
|--------|---------|
| Start all services | `docker-compose -f docker-compose.prod.yml up -d` |
| Stop all services | `docker-compose -f docker-compose.prod.yml down` |
| View logs | `docker-compose -f docker-compose.prod.yml logs -f` |
| Restart app only | `docker-compose -f docker-compose.prod.yml restart app` |
| View running containers | `docker ps` |
| Reset database | `docker-compose -f docker-compose.prod.yml down -v` (⚠️ deletes data) |

---

## 🔄 Auto-Start on Boot

To start Plan-PM automatically when Windows starts:

1. Open Docker Desktop Settings
2. Go to **General**
3. Enable **Start Docker Desktop when you sign in**
4. Your containers will restart automatically (due to `restart: unless-stopped`)

---

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| "Cannot connect" from client | Check firewall rules, verify IP address |
| Database not starting | Wait 30 seconds, check `docker logs planpm_supabase_db` |
| App shows error | Check `docker logs planpm_app` |
| Slow performance | Increase Docker memory in Docker Desktop settings |
| Port already in use | Change port 80 to 8080 in docker-compose.prod.yml |

---

## 📱 Quick Access Tip

On client computers, create a bookmark or desktop shortcut to:
```
http://192.168.1.100  (replace with your server IP)
```

---

## ✅ Summary

After following this guide:
- ✅ Plan-PM runs on your Windows server
- ✅ All Supabase services run in Docker
- ✅ Accessible from any computer on your network
- ✅ Data persists even after restart
- ✅ Starts automatically on boot
