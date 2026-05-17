# Deploying NetAxis to Render

This document explains how to deploy the NetAxis monorepo to Render using the provided `render.yaml` manifest.

Overview
- The repo contains four services: `frontend` (Next.js), `backend` (NestJS), `network-service` (FastAPI), and `radius-service` (Python).
- `render.yaml` defines one Render service per component and uses the repository Dockerfiles.

Quick steps
1. Push your branch to GitHub (or your Git provider).
2. Sign in to Render and connect your Git repository.
3. Import the repository using the `render.yaml` manifest (Render will detect it automatically when you create a new service and choose "Create from Render.yaml").
4. Add required environment variables and secrets in the Render dashboard (see list below).
5. Deploy and monitor logs from the Render dashboard. Enable auto-deploy if you want pushes to `main` to redeploy.

Required environment variables / secrets
You must create these env vars/secrets in Render for the services that need them. Exact keys depend on your `.env` and app usage, but common required keys for this repo are:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (secure)
- `DATABASE_URL` (if using an external DB)
- `PAYFAST_*` / `JAZZCASH_*` / `EASYPaisa_*` (payment gateway credentials)
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` (email)
- `SMS_PROVIDER_*` (SMS credentials)
- `NETWORK_SERVICE_API_KEY` (if used between backend and network-service)
- Any other keys referenced by `backend/.env` or `frontend/.env.local`.

Notes and recommendations
- Review the `frontend/Dockerfile` and `backend/Dockerfile` to confirm they respect the `PORT` env var Render provides. Render sets a `PORT` env var for web services — Dockerfiles should not hardcode a different port.
- If you want Render to build without using Dockerfiles, create separate services and set build and start commands per service.
- For Supabase/Postgres, keep the database hosted externally (Supabase) and set `SUPABASE_` vars as Render secrets.
- Set the `branch` field in `render.yaml` to the branch you deploy from (default: `main`).

Common commands (local)
- Create a branch, commit, push:
```bash
git checkout -b deploy/render
git add render.yaml docs/render-deploy.md
git commit -m "Add Render manifest and deployment instructions"
git push --set-upstream origin deploy/render
```

If you want me to push the branch for you, tell me and I will create a commit and push it (I need remote access permissions). Otherwise, follow the steps above and then import the repo into Render.

Troubleshooting
- If a service fails during startup, open the service logs in Render to see the build or runtime error.
- If a service cannot connect to Supabase or external DB, double-check secrets and any network allowlists (IP restrictions).
