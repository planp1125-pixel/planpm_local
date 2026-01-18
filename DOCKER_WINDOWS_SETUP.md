# Docker Development Setup for Windows

## Requirements

| Software | Version | Purpose |
|----------|---------|---------|
| **Docker Desktop** | Latest | Container runtime |
| **WSL 2** | - | Linux subsystem (installed with Docker Desktop) |
| **Git** | Latest | Source control |

---

## Quick Start

### 1. Install Docker Desktop
Download from: https://www.docker.com/products/docker-desktop/

> **Important:** During installation, enable **WSL 2 backend** (recommended for Windows)

### 2. Clone the Repository
```powershell
git clone https://github.com/planp1125-pixel/planpm_local.git
cd planpm_local
```

### 3. Create Environment File
```powershell
copy env.docker.example .env
```

Edit `.env` with your keys if needed (demo keys work for local development).

### 4. Start All Services
```powershell
docker-compose -f docker-compose.dev.yml up --build
```

### 5. Access the Application
- **App:** http://localhost:9002
- **Supabase API:** http://localhost:54321
- **Database:** localhost:54322

---

## Services Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Network                        │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  Next.js App │  │ Supabase DB  │  │ Supabase Auth│   │
│  │  Port: 9002  │  │ Port: 54322  │  │ Port: 54321  │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐                     │
│  │ Supabase REST│  │   Storage    │                     │
│  │ Port: 54323  │  │ Port: 54324  │                     │
│  └──────────────┘  └──────────────┘                     │
└─────────────────────────────────────────────────────────┘
```

---

## Useful Commands

### Start in Background
```powershell
docker-compose -f docker-compose.dev.yml up -d
```

### View Logs
```powershell
docker-compose -f docker-compose.dev.yml logs -f app
```

### Stop All Services
```powershell
docker-compose -f docker-compose.dev.yml down
```

### Rebuild After Code Changes
```powershell
docker-compose -f docker-compose.dev.yml up --build
```

### Reset Database
```powershell
docker-compose -f docker-compose.dev.yml down -v
docker-compose -f docker-compose.dev.yml up --build
```

---

## Hot Reload

The setup includes hot-reload support. Changes to `.tsx`, `.ts`, `.css` files will automatically refresh the browser.

**Excluded from hot-reload:**
- `node_modules/` (uses container version)
- `.next/` (uses container version)

---

## Troubleshooting

### Port Already in Use
```powershell
# Check what's using port 9002
netstat -ano | findstr :9002

# Kill the process
taskkill /PID <process_id> /F
```

### Container Won't Start
```powershell
# Clean up everything
docker-compose -f docker-compose.dev.yml down -v
docker system prune -f

# Restart
docker-compose -f docker-compose.dev.yml up --build
```

### Database Connection Failed
Wait for the database to be healthy:
```powershell
docker-compose -f docker-compose.dev.yml logs supabase-db
```

---

## Alternative: Using Supabase CLI

If you prefer using the Supabase CLI instead of the custom docker-compose:

1. Install Supabase CLI:
   ```powershell
   npm install -g supabase
   ```

2. Start Supabase:
   ```powershell
   cd supabase
   npx supabase start
   ```

3. Start the App only:
   ```powershell
   docker build -f Dockerfile.dev -t planpm-app .
   docker run -p 9002:9002 -v ${PWD}:/app planpm-app
   ```
