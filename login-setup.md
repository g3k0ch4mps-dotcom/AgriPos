# AgriPOS Login Setup

## Portals
- **Owner**: `https://agriposystem.pages.dev/owner/login` (sign in or sign up)
- **Seller**: `https://agriposystem.pages.dev/seller/login` (sign in only)

## First-time Supabase Setup
1. Go to **Supabase dashboard → SQL Editor**, paste and run the entire `supabase-schema.sql` — this creates the `profiles` table and the trigger that auto-assigns `owner` role to the first signup
2. Go to **Supabase → Authentication → Providers → Email** and make sure it's **enabled**

## Logging In
Visit `https://agriposystem.pages.dev/owner/login`, click **"Need to create the first owner account?"**, sign up — the first account automatically becomes owner.
