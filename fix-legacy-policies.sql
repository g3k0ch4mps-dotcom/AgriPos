-- Run this entirely in your Supabase SQL Editor.
--
-- Same root cause as the earlier profiles fix: the previous app left behind
-- RLS policies on categories/products/sale_items that call a get_user_role()
-- function the current roles have no EXECUTE on. Only `profiles` was cleaned
-- up before — this does the same dynamic drop-all-then-recreate for every
-- other table, so no leftover policy can hide on any of them.
--
-- It also fixes create_sale() having two overloads: add-loans-schema.sql
-- used CREATE OR REPLACE with a different parameter list, which in Postgres
-- creates a second function instead of replacing the first one (functions
-- are identified by name + signature). PostgREST then can't tell them apart
-- and every sale fails with "Could not choose the best candidate function".

-- 1. Drop every existing policy on these tables, whatever it's named.
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('categories','products','sale_items')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;

-- 2. Re-assert grants (in case the old app revoked/never granted these).
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.categories TO authenticated;

GRANT SELECT ON public.products TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.products TO authenticated;

GRANT SELECT, INSERT ON public.sale_items TO authenticated;

-- 3. Recreate the canonical policies (same as supabase-schema.sql).
DROP POLICY IF EXISTS "categories read all" ON public.categories;
CREATE POLICY "categories read all" ON public.categories FOR SELECT USING (true);
DROP POLICY IF EXISTS "categories owner write" ON public.categories;
CREATE POLICY "categories owner write" ON public.categories
  FOR ALL TO authenticated
  USING (public.is_owner(auth.uid()))
  WITH CHECK (public.is_owner(auth.uid()));

DROP POLICY IF EXISTS "products read all auth" ON public.products;
CREATE POLICY "products read all auth" ON public.products
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "products owner write" ON public.products;
CREATE POLICY "products owner write" ON public.products
  FOR ALL TO authenticated
  USING (public.is_owner(auth.uid()))
  WITH CHECK (public.is_owner(auth.uid()));

DROP POLICY IF EXISTS "sale_items read all auth" ON public.sale_items;
CREATE POLICY "sale_items read all auth" ON public.sale_items
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "sale_items insert via own sale" ON public.sale_items;
CREATE POLICY "sale_items insert via own sale" ON public.sale_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_id AND s.seller_id = auth.uid()));

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

-- 4. Drop the old 2-argument create_sale() overload so only the new
--    7-argument version (with payment method / loan support) remains.
DROP FUNCTION IF EXISTS public.create_sale(text, jsonb);

GRANT EXECUTE ON FUNCTION public.create_sale(text, jsonb, text, text, uuid, jsonb, date) TO authenticated;
