-- =====================================================================
-- AgriPOS schema — run this once in the Supabase SQL editor.
-- Project: https://hybmotfjgaepnxpixbrs.supabase.co
-- =====================================================================

-- Extensions ---------------------------------------------------------
create extension if not exists "pgcrypto";

-- profiles -----------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  role text not null check (role in ('owner','seller')) default 'seller',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
grant select on public.profiles to anon, authenticated;
grant insert, update on public.profiles to authenticated;
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

drop policy if exists "profiles read anon sellers" on public.profiles;
create policy "profiles read anon sellers" on public.profiles
  for select to anon
  using (role = 'seller');

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
  brand text,
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

-- customers (loan borrowers) ------------------------------------------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  national_id text,
  address text,
  created_at timestamptz not null default now()
);

alter table public.customers enable row level security;
grant select, insert, update on public.customers to authenticated;
grant all on public.customers to service_role;

drop policy if exists "customers read all auth" on public.customers;
create policy "customers read all auth" on public.customers for select to authenticated using (true);

drop policy if exists "customers write auth" on public.customers;
create policy "customers write auth" on public.customers for insert to authenticated with check (true);

drop policy if exists "customers update auth" on public.customers;
create policy "customers update auth" on public.customers for update to authenticated using (true) with check (true);

-- sales --------------------------------------------------------------
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid references public.profiles(id) on delete set null,
  customer_name text,
  total_amount numeric(12,2) not null default 0,
  payment_method text not null default 'cash' check (payment_method in ('cash','mpesa','loan')),
  mpesa_code text,
  customer_id uuid references public.customers(id),
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

-- loans (one row per credit sale) --------------------------------------
create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null unique references public.sales(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  principal_amount numeric(12,2) not null,
  due_date date not null,
  status text not null default 'outstanding' check (status in ('outstanding','partial','paid')),
  created_at timestamptz not null default now()
);

create index if not exists loans_customer_id_idx on public.loans(customer_id);
create index if not exists loans_status_idx on public.loans(status);
create index if not exists loans_due_date_idx on public.loans(due_date);

alter table public.loans enable row level security;
grant select on public.loans to authenticated;
grant all on public.loans to service_role;

drop policy if exists "loans read all auth" on public.loans;
create policy "loans read all auth" on public.loans for select to authenticated using (true);

-- loan_payments (full repayment history) --------------------------------
create table if not exists public.loan_payments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('cash','mpesa')),
  mpesa_code text,
  paid_at timestamptz not null default now(),
  recorded_by uuid references public.profiles(id)
);

create index if not exists loan_payments_loan_id_idx on public.loan_payments(loan_id);

alter table public.loan_payments enable row level security;
grant select on public.loan_payments to authenticated;
grant all on public.loan_payments to service_role;

drop policy if exists "loan_payments read all auth" on public.loan_payments;
create policy "loan_payments read all auth" on public.loan_payments for select to authenticated using (true);

-- Sale RPC: insert sale + items atomically, decrement stock, and record
-- a loan when payment_method = 'loan' -----------------------------------
create or replace function public.create_sale(
  p_customer_name text,
  p_items jsonb, -- [{product_id, quantity}]
  p_payment_method text default 'cash', -- 'cash' | 'mpesa' | 'loan'
  p_mpesa_code text default null,
  p_customer_id uuid default null, -- existing customer, for loans
  p_new_customer jsonb default null, -- {full_name, phone, national_id, address}, for loans
  p_due_date date default null -- required for loans
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
  v_customer_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_payment_method not in ('cash','mpesa','loan') then
    raise exception 'Invalid payment method: %', p_payment_method;
  end if;

  if p_payment_method = 'loan' then
    if p_due_date is null then
      raise exception 'A due date is required for loan sales';
    end if;
    if p_customer_id is not null then
      v_customer_id := p_customer_id;
    elsif p_new_customer is not null then
      insert into public.customers (full_name, phone, national_id, address)
      values (
        p_new_customer->>'full_name',
        p_new_customer->>'phone',
        p_new_customer->>'national_id',
        p_new_customer->>'address'
      )
      returning id into v_customer_id;
    else
      raise exception 'A customer is required for loan sales';
    end if;
  end if;

  insert into public.sales (seller_id, customer_name, total_amount, payment_method, mpesa_code, customer_id)
  values (auth.uid(), nullif(p_customer_name,''), 0, p_payment_method, p_mpesa_code, v_customer_id)
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

  if p_payment_method = 'loan' then
    insert into public.loans (sale_id, customer_id, principal_amount, due_date)
    values (v_sale_id, v_customer_id, v_total, p_due_date);
  end if;

  return v_sale_id;
end;
$$;

grant execute on function public.create_sale(text, jsonb, text, text, uuid, jsonb, date) to authenticated;

-- Loan repayment RPC: records a payment and recomputes loan status ------
create or replace function public.record_loan_payment(
  p_loan_id uuid,
  p_amount numeric,
  p_payment_method text, -- 'cash' | 'mpesa'
  p_mpesa_code text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_principal numeric(12,2);
  v_paid numeric(12,2);
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_amount <= 0 then raise exception 'Payment amount must be positive'; end if;
  if p_payment_method not in ('cash','mpesa') then
    raise exception 'Invalid payment method: %', p_payment_method;
  end if;

  select principal_amount into v_principal from public.loans where id = p_loan_id;
  if v_principal is null then raise exception 'Loan not found'; end if;

  insert into public.loan_payments (loan_id, amount, payment_method, mpesa_code, recorded_by)
  values (p_loan_id, p_amount, p_payment_method, p_mpesa_code, auth.uid());

  select coalesce(sum(amount), 0) into v_paid from public.loan_payments where loan_id = p_loan_id;

  update public.loans
    set status = case
      when v_paid >= v_principal then 'paid'
      when v_paid > 0 then 'partial'
      else 'outstanding'
    end
    where id = p_loan_id;
end;
$$;

grant execute on function public.record_loan_payment(uuid, numeric, text, text) to authenticated;
