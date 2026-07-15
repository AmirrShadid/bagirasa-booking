import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type SaltBread = {
  id: string;
  name: string;
  price: number;
  stock: number;
};

export type BookingItem = {
  bread_id: string;
  name: string;
  quantity: number;
  price: number;
};

export type ConfirmedBooking = {
  customerName: string;
  phone: string;
  pickupTime: string;
  items: BookingItem[];
  total: number;
};
