# Qabeela

Qabeela is a full-stack family community platform for preserving family history and coordinating members across branches. It combines an interactive family tree with member accounts, branch administration, events, notifications, messaging, lineage requests, file uploads, and a platform administration area.

The repository is a TypeScript monorepo with three applications:

- `apps/web` — React + Vite web application
- `apps/mobile` — Expo / React Native application
- `apps/api` — Express + MongoDB API
- `packages/ui` and `packages/types` — shared UI and domain types

## Features

- Interactive family tree with profiles, branches, search, and editing
- Tenant-aware family spaces with separate branch administration
- Member registration, approval workflows, and lineage verification requests
- Family occasions, event registration, reminders, and activity history
- Direct, branch, and announcement messaging with real-time streams
- Web and mobile clients backed by the same API
- Optional custom domains and per-tenant database isolation
- API security helpers for rate limiting, tenant checks, and authenticated routes

## Stack

TypeScript, React, Vite, Expo, React Native, Express, MongoDB, Mongoose, Socket.IO, JWT, Zod, Tailwind CSS, and pnpm workspaces.

## Requirements

- Node.js 18 or newer
- pnpm 8 or newer
- MongoDB for local API development

## Run locally

```bash
pnpm install
```

Create a local API environment file:

```bash
cp apps/api/.env.example apps/api/.env
```

Set `MONGODB_URI` and `JWT_SECRET` in that file. Then start the API and web app in separate terminals:

```bash
pnpm dev:api
pnpm dev:web
```

The web client uses `http://localhost:3001/api` by default. To use another API URL, set `VITE_API_URL` before starting the web app. The mobile client accepts `EXPO_PUBLIC_API_URL`.

For a local demo database, set `USE_MEMORY_DB=true` and `NODE_ENV=development`, then call `POST /api/seed/init`. The seed route is intentionally disabled outside development and test environments.

## Validation

```bash
pnpm --filter api build
pnpm --filter web build
pnpm --filter api test
```

## Configuration and security

Secrets belong in environment variables and are never committed. Review `apps/api/.env.example` for the available server settings. Bunny Storage, SMTP, Gemini, web push, and dedicated tenant databases are optional integrations.

The API must run with a strong `JWT_SECRET` and a real `MONGODB_URI` in any deployed environment. Demo credentials created by the local seed route are for local development only.

## License

No license has been selected for this repository yet. Add one before accepting external contributions or redistributing the code.
