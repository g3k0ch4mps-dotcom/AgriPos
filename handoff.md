# AgriPOS — Handoff / Conversation Pickup Doc

Last updated: 2026-07-12. Read this first in any new session before touching the DB or deployment again.

## Project

- **Repo (local):** `C:\Users\kaito_netsuro\Project\agriharvest`
- **GitHub (origin):** `https://github.com/g3k0ch4mps-dotcom/AgriPos`
- **GitHub (fork, deploys from here):** `https://github.com/suziednls-ux/AgriPos` — Cloudflare builds off this fork, not origin. Any fix pushed to origin needs **Sync fork** on the fork's GitHub page before Cloudflare picks it up.
- **Framework:** TanStack Start (Vite + Nitro SSR), React, TypeScript
- **Supabase project:** `https://hybmotfjgaepnxpixbrs.supabase.co`
- **Live URL:** `https://agripos.suziednls.workers.dev/`

## Credentials

`.env` is gitignored, values live only there. Owner login:
- URL: `/owner/login`
- Email: `admin@info.com`
- Password: `Admin@2020`

## Database — status: fixed, migrations already run

The Supabase project was **not fresh** — it still had tables/constraints/policies from a previous, unrelated "cashier" POS app. Three SQL files in the repo root fixed this, **already run against the live DB**, safe to re-run (all idempotent) if anything regresses:

1. `fix-rls.sql` — fixed `handle_new_user` trigger (role + email), added `profiles.phone`, renamed legacy `products` columns (`selling_price→price`, `current_stock→stock_quantity`, `minimum_stock→low_stock_threshold`), fixed a stale `profiles_role_check` CHECK constraint that only allowed old role values, rebuilt `profiles` RLS policies.
2. `fix-legacy-policies.sql` — same "leftover policy referencing a nonexistent `get_user_role()` function" problem also existed on `categories`/`products`/`sale_items` (not just `profiles`) — dropped and rebuilt those too. Also drops a duplicate `create_sale()` overload (see next point).
3. `add-loans-schema.sql` — adds `customers`, `loans`, `loan_payments` tables + extends `create_sale()` + adds `record_loan_payment()`.

**Gotcha already hit once:** `CREATE OR REPLACE FUNCTION create_sale(...)` with a *different parameter list* creates a second overload in Postgres instead of replacing the first — breaks PostgREST ("Could not choose the best candidate function"). If `create_sale` is ever modified again, drop the old signature explicitly first.

Three unrelated legacy tables (`transactions`, `transaction_items`, `stock_movements`) still exist from the old app, unused by this codebase, left alone — harmless clutter, not touched.

`supabase-schema.sql` is the fresh-install baseline (kept in sync with the above so a brand-new Supabase project wouldn't need the fix-*.sql files at all).

## Features built this session

| Feature | Where |
|---|---|
| Staff management (add/edit/reset/delete sellers) | `src/routes/owner.staff.tsx`, `src/lib/api/admin-users.ts` |
| Seller card-grid login (no email needed) | `src/routes/seller.login.tsx` |
| Show/hide password toggle | `owner.login.tsx`, `seller.login.tsx` |
| POS payment methods: Cash / M-Pesa / Loan | `src/routes/seller.pos.tsx` |
| Loan capture (existing/new client, due date) at checkout | same, via extended `create_sale()` RPC |
| Owner "Credit / Loans" tab (balances, due dates, payment history, record repayment) | `src/routes/owner.sales-history.tsx` (tab: Credit/Loans) |
| Financial Reports (week/month/year/custom, revenue trend, payment-method breakdown) | `src/routes/owner.reports.tsx` |
| Hover tooltips on icon-only buttons | `src/components/ui/tooltip.tsx` (`HoverTip`), wired app-wide via `TooltipProvider` in `__root.tsx` |
| Optional product brand/grade/type | `owner.products.tsx`, `src/lib/format.ts` (`productName()` fallback) |

## Cloudflare deployment — Worker, not Pages

**Direct answer to "do I upload as a Worker or a Page":** this project deploys as a **Worker** (specifically "Workers Builds" — Cloudflare's git-connected CI for Workers), not classic Cloudflare Pages. Both products are converging under "Workers & Pages" in the dashboard, but they behave differently under the hood:

- **Classic Pages**: build command only, Cloudflare's own pipeline uploads the output directory — no separate deploy command, no `wrangler deploy`.
- **Workers (what we have)**: build command (`npm run build`) *then* a deploy command (`npx wrangler deploy`), which reads a `wrangler.json` with `main` (entry point) + `assets.directory` (static files) and publishes an actual Worker with an assets binding.

The nitro build preset in `vite.config.ts` must match which one Cloudflare is actually running — `preset: "cloudflare-module"` (current setting) generates the Worker-shaped `main`+`assets` config; the old `"cloudflare-pages"` preset generated a Pages-only config (`pages_build_output_dir`) that `wrangler deploy` can't use, which is what caused the first deploy failures.

### Two separate places for environment variables (easy to get wrong)

- **Settings → Variables & Secrets** — runtime only (`env.X` inside the Worker's `fetch` handler). `SUPABASE_SERVICE_ROLE_KEY` belongs here, marked **Secret**.
- **Settings → Build → "Build variables and secrets"** — build-time only, explicitly *not* available at runtime. Vite's `VITE_*` vars get inlined into the bundle during `npm run build`, so `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` **must** go here, not (only) in the runtime section.

**Current status (as of last message): this was the active blocker.** The site was 500ing on every request because `import.meta.env.VITE_SUPABASE_URL` was empty at build time (client was only in the runtime vars section), so `createClient("", ...)` throws immediately on module load in `src/integrations/supabase/client.ts`, crashing SSR before React renders (caught generically by `src/server.ts`'s error wrapper).

**Fix in progress:** add `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` to **Settings → Build → Build variables and secrets**, then trigger a fresh deployment. Verify by hitting `https://agripos.suziednls.workers.dev/owner/login` and confirming it loads (not the generic "This page didn't load" error).

## What still needs to be done

1. Confirm the Build-variables fix above actually resolves the live 500 error.
2. Disable **Authentication → Email → Confirm email** in Supabase (needed for seller accounts, which use fake `@agripos.internal` emails that can't receive confirmation mail) — check this was actually done; it was flagged early in the project but never explicitly re-confirmed after all the other fixes.
3. Once live, smoke-test end-to-end on the deployed URL: owner login → add a seller → seller login → POS sale (cash/mpesa/loan) → owner Credit/Loans tab shows it → Financial Reports shows it.
4. Consider whether to drop the three unused legacy tables (`transactions`, `transaction_items`, `stock_movements`) — currently left alone, harmless.
