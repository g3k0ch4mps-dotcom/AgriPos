import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: typeof window !== "undefined",
    autoRefreshToken: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});

export type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: "owner" | "seller";
  created_at: string;
};

export type Category = { id: string; name: string; created_at: string };

export type Product = {
  id: string;
  category_id: string | null;
  brand: string | null;
  grade: string | null;
  type: string | null;
  size: string | null;
  price: number;
  stock_quantity: number;
  low_stock_threshold: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Sale = {
  id: string;
  seller_id: string | null;
  customer_name: string | null;
  total_amount: number;
  payment_method: "cash" | "mpesa" | "loan";
  mpesa_code: string | null;
  customer_id: string | null;
  created_at: string;
};

export type SaleItem = {
  id: string;
  sale_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
};

export type Customer = {
  id: string;
  full_name: string;
  phone: string | null;
  national_id: string | null;
  address: string | null;
  created_at: string;
};

export type Loan = {
  id: string;
  sale_id: string;
  customer_id: string;
  principal_amount: number;
  due_date: string;
  status: "outstanding" | "partial" | "paid";
  created_at: string;
};

export type LoanPayment = {
  id: string;
  loan_id: string;
  amount: number;
  payment_method: "cash" | "mpesa";
  mpesa_code: string | null;
  paid_at: string;
  recorded_by: string | null;
};
