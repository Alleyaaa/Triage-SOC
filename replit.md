# SOC Triage Dashboard

Dashboard analisis log keamanan berbasis AI untuk SOC analyst. Korelasi manual JSON log dari FortiGate, WatchGuard EDR, Windows/Linux Agent by source IP, lalu trigger analisis AI via n8n SOAR atau Gemini langsung.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run API server (port dari env PORT)
- `pnpm --filter @workspace/dashboard run dev` — run frontend (port dari env PORT)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks dan Zod schemas dari OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Optional env: `GEMINI_API_KEY` — untuk analisis AI langsung tanpa n8n

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19, Vite 7, Tailwind CSS, Recharts, Wouter
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod v4, `drizzle-zod`
- API codegen: Orval (dari OpenAPI spec)
- Build: esbuild (CJS bundle)
- AI: Google Gemini API (direct) atau via n8n SOAR webhook

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI 3.1 spec (source of truth)
- `lib/db/src/schema/` — DB schema: sessions, logEntries, reports, n8nConfig
- `artifacts/api-server/src/routes/` — Route handlers (sessions, logs, correlations, analyze, reports, dashboard, n8nConfig)
- `artifacts/dashboard/src/pages/` — React pages (Dashboard, Sessions, SessionWorkspace, Reports, ReportDetail, Settings)
- `artifacts/dashboard/src/components/` — Shared UI components

## Architecture decisions

- OpenAPI-first: spec di `lib/api-spec/openapi.yaml` menghasilkan React Query hooks + Zod schemas via Orval codegen
- IP extraction server-side: field `data.srcip`, `agent.ip`, `data.watchguard.ip_address` diekstrak saat log masuk, disimpan di `extracted_ip`
- IP masking client-side: masking toggle menggunakan `maskedIp` dari correlations endpoint (format x.x.*.*)
- Dual AI path: jika n8n webhook dikonfigurasi → pakai n8n SOAR, jika tidak → Gemini API langsung
- Satu report per session: analyze ulang akan replace report lama

## Product

- **Dashboard** — Stats cards, source distribution chart, threat breakdown chart, recent activity feed
- **Sessions** — Create/manage triage sessions, search/filter
- **Session Workspace** — Split panel: log list (kiri) + add log form (kanan), IP correlation map, Mask IPs toggle, Analyze with AI button
- **Reports** — Daftar laporan tersimpan dengan severity badges
- **Report Detail** — Narasi AI, IOCs, rekomendasi, affected systems, raw AI response
- **Settings** — Konfigurasi n8n SOAR webhook URL

## User preferences

- FE dan BE dipisahkan (artifacts/dashboard vs artifacts/api-server)
- Komponen FE dipecah per file (satu komponen per file)
- Backend routes dipecah per domain (satu file per resource)
- Gunakan Gemini API untuk AI, n8n untuk SOAR
- Tidak perlu emojis di UI

## Gotchas

- Rebuild `@workspace/db` lib dengan `pnpm run typecheck:libs` setelah tambah tabel baru sebelum typecheck API server
- Import dari `@workspace/api-client-react` hanya via barrel export — jangan deep import ke `src/generated/`
- Setelah ubah OpenAPI spec, selalu run codegen sebelum pakai hooks baru
- n8n webhook harus return format JSON yang spesifik (lihat README.md)

## Pointers

- Lihat `pnpm-workspace` skill untuk workspace structure, TypeScript setup, dan package details
- Lihat `README.md` di root untuk panduan instalasi lengkap untuk GitHub
