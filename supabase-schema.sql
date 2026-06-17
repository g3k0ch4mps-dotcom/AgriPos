-- =====================================================================
-- AgriPOS schema — run this once in the Supabase SQL editor.
-- Project: https://zkdtwkumygouutkvjdtz.supabase.co
-- =====================================================================

-- Extensions ---------------------------------------------------------
create extension if not exists "pgcrypto";

-- profiles -----------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null check (role in ('owner','seller')) default 'seller',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;

-- Helper to check owner status without RLS recursion
create or replace function public.is_owner(uid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = uid and role = 'owner');
$$;

drop policy if exists "profiles read own or owner" on public.profiles;
create policy "profiles read own or owner" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_owner(auth.uid()));

drop policy if exists "profiles insert self" on public.profiles;
create policy "profiles insert self" on public.profiles
  for insert to authenticated with check (id = auth.uid());

drop policy if exists "profiles update self or owner" on public.profiles;
create policy "profiles update self or owner" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_owner(auth.uid()));

-- Auto-create profile on signup. The first user to sign up becomes the owner.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_role text;
begin
  select count(*) into v_count from public.profiles;
  v_role := case when v_count = 0 then 'owner' else 'seller' end;
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), v_role)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- categories ---------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

alter table public.categories enable row level security;
grant select on public.categories to anon, authenticated;
grant insert, update, delete on public.categories to authenticated;
grant all on public.categories to service_role;

drop policy if exists "categories read all" on public.categories;
create policy "categories read all" on public.categories for select using (true);

drop policy if exists "categories owner write" on public.categories;
create policy "categories owner write" on public.categories
  for all to authenticated
  using (public.is_owner(auth.uid()))
  with check (public.is_owner(auth.uid()));

insert into public.categories (name) values
  ('Calcium'), ('Fertilizers'), ('Kensalt'), ('Nevira'), ('Sacks'), ('Tents/Hema')
on conflict (name) do nothing;

-- products -----------------------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete set null,
  brand text not null,
  grade text,
  type text,
  size text,
  price numeric(12,2) not null default 0,
  stock_quantity int not null default 0,
  low_stock_threshold int not null default 10,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products enable row level security;
grant select on public.products to authenticated;
grant insert, update, delete on public.products to authenticated;
grant all on public.products to service_role;

drop policy if exists "products read all auth" on public.products;
create policy "products read all auth" on public.products
  for select to authenticated using (true);

drop policy if exists "products owner write" on public.products;
create policy "products owner write" on public.products
  for all to authenticated
  using (public.is_owner(auth.uid()))
  with check (public.is_owner(auth.uid()));

-- sales --------------------------------------------------------------
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid references public.profiles(id) on delete set null,
  customer_name text,
  total_amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

alter table public.sales enable row level security;
grant select, insert on public.sales to authenticated;
grant all on public.sales to service_role;

drop policy if exists "sales read all auth" on public.sales;
create policy "sales read all auth" on public.sales for select to authenticated using (true);

drop policy if exists "sales insert seller" on public.sales;
create policy "sales insert seller" on public.sales
  for insert to authenticated with check (seller_id = auth.uid());

-- sale_items ---------------------------------------------------------
create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity int not null check (quantity > 0),
  unit_price numeric(12,2) not null,
  subtotal numeric(12,2) not null
);

alter table public.sale_items enable row level security;
grant select, insert on public.sale_items to authenticated;
grant all on public.sale_items to service_role;

drop policy if exists "sale_items read all auth" on public.sale_items;
create policy "sale_items read all auth" on public.sale_items for select to authenticated using (true);

drop policy if exists "sale_items insert via own sale" on public.sale_items;
create policy "sale_items insert via own sale" on public.sale_items
  for insert to authenticated
  with check (exists (select 1 from public.sales s where s.id = sale_id and s.seller_id = auth.uid()));

-- Sale RPC: insert sale + items atomically and decrement stock --------
create or replace function public.create_sale(
  p_customer_name text,
  p_items jsonb -- [{product_id, quantity}]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id uuid;
  v_total numeric(12,2) := 0;
  v_item jsonb;
  v_price numeric(12,2);
  v_qty int;
  v_pid uuid;
  v_stock int;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  insert into public.sales (seller_id, customer_name, total_amount)
  values (auth.uid(), nullif(p_customer_name,''), 0)
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::int;

    select price, stock_quantity into v_price, v_stock
      from public.products where id = v_pid for update;

    if v_stock < v_qty then
      raise exception 'Insufficient stock for product %', v_pid;
    end if;

    insert into public.sale_items (sale_id, product_id, quantity, unit_price, subtotal)
    values (v_sale_id, v_pid, v_qty, v_price, v_price * v_qty);

    update public.products
      set stock_quantity = stock_quantity - v_qty,
          updated_at = now()
      where id = v_pid;

    v_total := v_total + (v_price * v_qty);
  end loop;

  update public.sales set total_amount = v_total where id = v_sale_id;
  return v_sale_id;
end;
$$;

grant execute on function public.create_sale(text, jsonb) to authenticated;
