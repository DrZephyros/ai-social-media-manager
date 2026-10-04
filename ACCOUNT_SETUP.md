# Account and quota setup

The app uses Supabase Auth for email and password accounts. New accounts are marked confirmed immediately, so signup does not send verification emails. The server uses a Supabase secret key; it must only be configured in server environments and must never be added to browser code or committed files.

## Supabase project

1. Create a Supabase project.
2. Copy the Project URL from **Project Settings → API** (or **Connect**).
3. Create or rotate a **Secret key** under **Project Settings → API Keys**. Secret keys bypass row level security, so store the value only in Vercel as `SUPABASE_SECRET_KEY` and in a local ignored `.env` for development.
4. Add `SUPABASE_URL` with the project URL to Vercel and local `.env`.
5. Optionally set `GENERATION_TICKET_SECRET` to a separate random secret. If omitted, the server uses the Supabase secret key to sign short-lived generation tickets.

## One-time database setup

Run the SQL in [`supabase/migrations/20261004000000_generation_quota.sql`](supabase/migrations/20261004000000_generation_quota.sql) once in the Supabase Dashboard's **SQL Editor**. It creates the quota table and the atomic reservation functions used to enforce two generations per rolling seven-day period.

## Local development

Copy `.env.example` to `.env` and fill in the app's existing AI provider keys plus `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. Keep `.env` private. Do not put the Supabase secret key in `index.html`, a `NEXT_PUBLIC_` variable, or source control.

Existing Firebase accounts are not migrated automatically. Since there are currently no users to preserve, people can create fresh accounts after the Supabase configuration is deployed.
