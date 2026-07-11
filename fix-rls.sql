-- Run this entirely in your Supabase SQL Editor

-- 0a. Migrate legacy table shapes left over from the previous app that used
--     to live in this Supabase project. The app code expects
--     products.price/stock_quantity/low_stock_threshold, but the live table
--     still had selling_price/current_stock/minimum_stock, plus a NOT NULL
--     `name` and `buying_price` the app never sets — that's the exact cause
--     of the "column products.stock_quantity does not exist" 400 error.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='selling_price') THEN
    ALTER TABLE public.products RENAME COLUMN selling_price TO price;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='current_stock') THEN
    ALTER TABLE public.products RENAME COLUMN current_stock TO stock_quantity;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='minimum_stock') THEN
    ALTER TABLE public.products RENAME COLUMN minimum_stock TO low_stock_threshold;
  END IF;
END $$;
ALTER TABLE public.products DROP COLUMN IF EXISTS name;
ALTER TABLE public.products DROP COLUMN IF EXISTS buying_price;
ALTER TABLE public.products DROP COLUMN IF EXISTS image_url;

-- 0b. The live profiles.role column still has the OLD check constraint from
--     the previous app, which never allowed 'seller' as a value. Every seller
--     creation calls handle_new_user(), which inserts role='seller' and gets
--     rejected by this constraint — auth.admin.createUser() then rolls back
--     and Supabase's Auth API returns a bare 500 ("{}" in the browser). This
--     was the real cause of the Add Seller failure the whole time.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('owner','seller'));

-- 0c. profiles.phone is used by the staff UI but never existed on the live
--     table — add it.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;

-- 0d. Fix the trigger that creates users (this was crashing when you added
--     staff!). It also now fills in profiles.email, which is NOT NULL on the
--     live table with no default — the old trigger only inserted
--     id/full_name/role, so every new-user insert violated that constraint
--     and rolled back the whole auth.admin.createUser() call. That was the
--     real cause of the "Add Seller" failure.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
  v_role text;
BEGIN
  SELECT count(*) INTO v_count FROM public.profiles;
  v_role := CASE WHEN v_count = 0 THEN 'owner' ELSE 'seller' END;

  INSERT INTO public.profiles (id, full_name, role, email)
  VALUES (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), v_role, new.email)
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 1. Helper function used by the policies below
CREATE OR REPLACE FUNCTION public.is_owner(uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = uid AND role = 'owner');
$$;

-- 2. Table-level grants — profiles only, least privilege (do NOT grant blanket
--    access to every table in the schema; products/sales/sale_items/categories
--    already have their own correct grants in supabase-schema.sql).
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.profiles TO anon, authenticated;
GRANT INSERT, UPDATE ON public.profiles TO authenticated;

-- 3. Drop every existing policy on profiles, whatever it's named. The
--    original pre-migration app left behind at least one policy that calls a
--    get_user_role() function which the current roles have no EXECUTE on,
--    causing "permission denied for function get_user_role" on every read —
--    a fixed list of DROP POLICY names can't catch policies it doesn't know
--    about, so this walks pg_policies instead.
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', pol.policyname);
  END LOOP;
END $$;

-- 4. Recreate policies. Anonymous visitors (the seller-login card grid) can
--    only ever see rows where role = 'seller' — never the owner's row, so the
--    owner's name/phone/role never becomes visible to an unauthenticated
--    request. Authenticated users can see their own row, or every row if
--    they're the owner.
CREATE POLICY "profiles read anon sellers" ON public.profiles
  FOR SELECT
  TO anon
  USING (role = 'seller');

CREATE POLICY "profiles read own or owner" ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR public.is_owner(auth.uid()));

CREATE POLICY "profiles insert self" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles update self or owner" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_owner(auth.uid()));

-- 5. Force RLS to be enabled
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
