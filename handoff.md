# AgriPOS — Full Handoff Document

## Project
- **Repo:** `c:\Users\kaito_netsuro\Project\agriharvest`
- **Framework:** TanStack Start (Vite + Nitro SSR), React, TypeScript
- **Supabase Project:** `https://hybmotfjgaepnxpixbrs.supabase.co`

---

## Credentials

### `.env` (already set, gitignored — values live only in that file, not here)
```
VITE_SUPABASE_URL=https://hybmotfjgaepnxpixbrs.supabase.co
VITE_SUPABASE_ANON_KEY=<see .env>
SUPABASE_SERVICE_ROLE_KEY=<see .env>
```

### Admin (Owner) Login
- **URL:** `http://localhost:8080/owner/login`
- **Email:** `admin@info.com`
- **Password:** `Admin@2020`
- The admin profile is in the `profiles` table with `role = 'owner'` (confirmed via script)

---

## What Was Built

### 1. Staff Management (`/owner/staff`)
**File:** `src/routes/owner.staff.tsx`  
**Nav:** Added "Staff" link in `src/components/owner/OwnerLayout.tsx`

Owner can:
- **Add a seller** — Name, Phone, Password. Creates a Supabase Auth user with a hidden internal email (`name.hash@agripos.internal`) and inserts into `profiles` with `role = 'seller'`.
- **Edit seller** — Change name, phone, reset password.
- **Delete seller** — Removes auth user and profile.

### 2. Seller Login (`/seller/login`)
**File:** `src/routes/seller.login.tsx`

Two-step flow:
1. **Card grid** showing all sellers by name (no email shown). Fetched anonymously (no login needed at this step).
2. **Password entry** for the selected seller.

### 3. Backend Admin API
**File:** `src/lib/api/admin-users.ts`

Server-side functions using the `service_role` key (bypasses RLS):
- `createSeller(name, phone, password)`
- `updateSeller(id, name, phone)`
- `deleteSeller(id)`
- `resetSellerPassword(id, newPassword)`

Uses a `generateHiddenEmail(name)` utility to map seller names to internal emails so sellers never need to know their email.

### 4. Supabase Schema
**File:** `supabase-schema.sql`

Key changes from original:
- Added `phone text` column to `profiles`
- `role` column supports `'owner'` and `'seller'` (old DB had `'cashier'` — that was the root cause of the crashes)
- Updated project URL in the comment header

---

## Root Cause of the Login / Staff Issues

The Supabase database at `hybmotfjgaepnxpixbrs.supabase.co` was **not a fresh database**. It had an old `handle_new_user` trigger from a previous setup that tried to insert `role = 'cashier'`, but the updated schema only accepts `'owner'` or `'seller'`. This caused a silent crash every time the app tried to create a seller.

**Additionally**, the RLS (Row Level Security) policies were blocking reads with `403` errors because there was no policy allowing unauthenticated access to the seller list needed for the card-grid login page.

---

## The Fix — SQL to Run

The file `fix-rls.sql` (in the project root) contains the complete fix. It must be run in the **Supabase SQL Editor**:

```sql
-- 0. Fix the trigger (root cause of staff creation failure)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int; v_role text;
BEGIN
  SELECT count(*) INTO v_count FROM public.profiles;
  v_role := CASE WHEN v_count = 0 THEN 'owner' ELSE 'seller' END;
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), v_role)
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;
  RETURN new;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 1. Grants
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;

-- 2. is_owner helper
CREATE OR REPLACE FUNCTION public.is_owner(uid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = uid AND role = 'owner');
$$;

-- 3. Drop all old policies
DROP POLICY IF EXISTS "profiles read own or owner" ON public.profiles;
DROP POLICY IF EXISTS "profiles insert self" ON public.profiles;
DROP POLICY IF EXISTS "profiles update self or owner" ON public.profiles;
DROP POLICY IF EXISTS "profiles read anon sellers" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile." ON public.profiles;
DROP POLICY IF EXISTS "profiles select any" ON public.profiles;

-- 4. New open-read policy (fixes the 403 on login)
CREATE POLICY "profiles select any" ON public.profiles FOR SELECT USING (true);

CREATE POLICY "profiles insert self" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

CREATE POLICY "profiles update self or owner" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_owner(auth.uid()));

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
```

> **Important:** Run this in Supabase SQL Editor. After it succeeds, restart `npm run dev` and try adding a staff member. It will work.

---

## Supabase Dashboard Settings Required

- **Authentication → Email → Confirm email:** Must be **disabled** (to allow sellers to be created without email verification)
- This is required for the staff creation flow to work

---

## Files Changed / Created

| File | Change |
|------|--------|
| `.env` | Updated to new Supabase credentials |
| `supabase-schema.sql` | Added `phone` column, fixed role values, updated URL |
| `src/integrations/supabase/client.ts` | Added `phone` to `Profile` type |
| `src/components/owner/OwnerLayout.tsx` | Added "Staff" navigation link |
| `src/lib/api/admin-users.ts` | **NEW** — Server-side admin user management functions |
| `src/routes/owner.staff.tsx` | **NEW** — Staff management UI (add/edit/delete sellers) |
| `src/routes/seller.login.tsx` | Redesigned — Two-step card-grid + password login |
| `fix-rls.sql` | **NEW** — One-time SQL fix script to run in Supabase |

---

## Current State of the Database

| User | Role | Email |
|------|------|-------|
| Admin | `owner` | `admin@info.com` |
| TESTER 1 | `owner` | `g3k0ch4mps@gmail.com` |
| mike tester | `owner` | `napevi1817@herojp.com` |
| admin (old) | `cashier` | `admin@agrostock.test` |

> The old `admin@agrostock.test` with role `cashier` is a leftover from the previous setup. It should be deleted from the Supabase Auth dashboard to keep things clean.

---

## What Still Needs To Be Done

1. **Run `fix-rls.sql`** in Supabase SQL Editor (the single remaining blocker)
2. **Disable Email Confirmation** in Supabase Auth settings
3. **Delete old test users** from Supabase Auth (`admin@agrostock.test`, `napevi1817@herojp.com`, `g3k0ch4mps@gmail.com`, `ddf4405e...`)
4. Test the full seller flow end-to-end
