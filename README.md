# SOC Triage Dashboard

Dashboard analisis log keamanan berbasis AI untuk Security Operations Center (SOC). Mendukung korelasi manual log dari berbagai sumber berdasarkan source IP, analisis AI via Gemini atau n8n SOAR, dan penyimpanan laporan insiden.

## Fitur Utama

- **Multi-source log ingestion** — Paste raw JSON log dari FortiGate, WatchGuard EDR, Windows Agent, Linux Agent
- **Korelasi otomatis by source IP** — Field `data.srcip`, `agent.ip`, `data.watchguard.ip_address` diekstrak dan dikelompokkan
- **IP Masking** — Toggle untuk anonimisasi IP (format: `x.x.*.*`)
- **AI Analysis via n8n SOAR** — Kirim log ke n8n webhook → Gemini AI → laporan narasi
- **Fallback direct Gemini** — Jika n8n tidak dikonfigurasi, analisis langsung via Gemini API
- **Laporan tersimpan** — Semua hasil analisis disimpan di PostgreSQL
- **Dashboard overview** — Statistik, aktivitas terbaru, breakdown severity, distribusi sumber

## Arsitektur

```
artifacts/
├── api-server/          # Express 5 API backend
│   └── src/routes/
│       ├── sessions.ts       # CRUD triage sessions
│       ├── logs.ts           # Log entry management + IP extraction
│       ├── correlations.ts   # IP correlation grouping
│       ├── analyze.ts        # n8n/Gemini AI analysis
│       ├── reports.ts        # Report CRUD
│       ├── dashboard.ts      # Stats & analytics
│       └── n8nConfig.ts      # n8n webhook config
└── dashboard/           # React + Vite frontend
    └── src/
        ├── pages/
        │   ├── Dashboard.tsx         # Overview halaman utama
        │   ├── Sessions.tsx          # Daftar triage session
        │   ├── SessionWorkspace.tsx  # Workspace split-panel
        │   ├── Reports.tsx           # Daftar laporan
        │   ├── ReportDetail.tsx      # Detail laporan AI
        │   └── Settings.tsx          # Konfigurasi n8n
        └── components/
            ├── ui/badges.tsx         # SourceBadge, StatusBadge, SeverityBadge
            ├── EmptyState.tsx
            └── AppLayout.tsx + Sidebar.tsx

lib/
├── api-spec/openapi.yaml    # OpenAPI 3.1 spec (source of truth)
├── api-client-react/        # Generated React Query hooks
├── api-zod/                 # Generated Zod validation schemas
└── db/src/schema/
    ├── sessions.ts
    ├── logEntries.ts
    ├── reports.ts
    └── n8nConfig.ts
```

## Stack

| Layer | Teknologi |
|-------|-----------|
| Frontend | React 19, Vite 7, Tailwind CSS, Recharts, Wouter |
| Backend | Node.js 24, Express 5, TypeScript |
| Database | PostgreSQL + Drizzle ORM |
| Validation | Zod v4, OpenAPI codegen (Orval) |
| AI | Google Gemini API (direct) atau via n8n SOAR |
| SOAR | n8n webhook integration |

## Persyaratan

- Node.js 24+
- pnpm 10+
- PostgreSQL 15+
- (Opsional) Gemini API Key — `GEMINI_API_KEY`
- (Opsional) n8n instance dengan webhook

## Instalasi & Setup

### 1. Clone repository

```bash
git clone https://github.com/<your-username>/soc-triage-dashboard.git
cd soc-triage-dashboard
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Setup environment variables

Buat file `.env` di root project:

```env
# Database (wajib)
DATABASE_URL=postgresql://user:password@localhost:5432/soc_triage

# Gemini AI (opsional — diperlukan jika tidak pakai n8n)
GEMINI_API_KEY=your_gemini_api_key_here

# Session secret
SESSION_SECRET=your_random_secret_here
```

> **Catatan:** Jika menggunakan Replit, semua env var diatur otomatis via Replit Secrets.

### 4. Setup database

```bash
# Push schema ke database
pnpm --filter @workspace/db run push
```

### 5. Generate API client (jika ada perubahan spec)

```bash
pnpm --filter @workspace/api-spec run codegen
```

### 6. Jalankan development

**API Server** (port 5000 / dikonfigurasi via PORT env):
```bash
pnpm --filter @workspace/api-server run dev
```

**Frontend** (port dikonfigurasi via PORT env):
```bash
pnpm --filter @workspace/dashboard run dev
```

## Konfigurasi n8n SOAR

### Setup Workflow n8n

1. Buka n8n instance Anda
2. Buat workflow baru dengan trigger **Webhook**
3. Salin URL webhook-nya
4. Di dashboard, buka **Settings** → masukkan URL webhook → Save

### Format Payload yang Dikirim ke n8n

```json
{
  "sessionId": 1,
  "maskIps": true,
  "additionalContext": "Teks konteks tambahan dari analis",
  "logs": [
    {
      "source": "fortigate",
      "rawJson": "{...}",
      "extractedIp": "192.168.1.*.*"
    }
  ]
}
```

### Format Response yang Diharapkan dari n8n

```json
{
  "summary": "Narasi analisis lengkap...",
  "severity": "high",
  "iocs": ["192.168.1.50", "lsass.exe", "T1003"],
  "recommendations": ["Isolate host", "Reset credentials"],
  "attackVector": "Lateral Movement via SMB",
  "affectedSystems": ["192.168.1.50", "AD server"],
  "executionId": "n8n-exec-id-optional"
}
```

### n8n Workflow Contoh (Gemini)

Di dalam n8n, tambahkan node **HTTP Request** ke Gemini API:
- Method: POST
- URL: `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={{ $env.GEMINI_API_KEY }}`
- Body: prompt berisi log dari webhook payload

## Analisis Langsung via Gemini (tanpa n8n)

Jika n8n tidak dikonfigurasi, sistem akan otomatis memanggil Gemini API langsung.  
Set `GEMINI_API_KEY` di environment variables.

## Field IP yang Didukung

| Sumber | Field JSON |
|--------|------------|
| FortiGate Firewall | `data.srcip` |
| Windows / Linux Agent | `agent.ip` |
| WatchGuard EDR | `data.watchguard.ip_address` |

## Workflow Penggunaan

1. **Buat Session** baru di halaman Sessions
2. **Paste raw JSON log** dari berbagai sumber (FortiGate, WatchGuard, Agent)
3. Lihat **IP Correlation Map** — log dari IP yang sama dikelompokkan otomatis
4. Toggle **Mask IPs** jika perlu anonimisasi sebelum analisis
5. Klik **Analyze with AI** — sistem kirim ke n8n/Gemini
6. Lihat **laporan** dengan ringkasan narasi, IOC, rekomendasi
7. Laporan tersimpan otomatis dan bisa diakses dari halaman Reports

## Commands

```bash
# Typecheck semua packages
pnpm run typecheck

# Build semua packages
pnpm run build

# Push DB schema (dev)
pnpm --filter @workspace/db run push

# Regenerate API hooks & Zod schemas dari OpenAPI
pnpm --filter @workspace/api-spec run codegen

# Run API server
pnpm --filter @workspace/api-server run dev

# Run frontend
pnpm --filter @workspace/dashboard run dev
```

## Konfigurasi untuk GitHub

Sebelum push ke GitHub, pastikan:

1. **Buat `.gitignore`** (sudah ada di monorepo ini):
   ```
   node_modules/
   dist/
   .env
   *.local
   ```

2. **Jangan commit `.env`** — gunakan `.env.example` sebagai template

3. **Environment variables di GitHub Actions** — set secrets di repo settings

## Lisensi

MIT
