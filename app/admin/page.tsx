'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AdminDashboard() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    fetchBookings();
    fetchProducts();
  }, []);

  async function fetchBookings() {
    const { data } = await supabase.from('bookings').select('*').order('created_at', { ascending: false });
    if (data) setBookings(data);
  }

  async function fetchProducts() {
    const { data } = await supabase.from('products').select('*');
    if (data) setProducts(data);
  }

  const updateStock = async (id: string, newStock: number) => {
    const { error } = await supabase.from('products').update({ stock: newStock }).eq('id', id);
    if (!error) fetchProducts();
  };

  return (
    <div className="min-h-screen bg-stone-50 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        
        {/* Stock Control Panel */}
        <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm">
          <h2 className="text-lg font-bold mb-4">Stock Control</h2>
          <div className="grid grid-cols-2 gap-4">
            {products.map((p) => (
              <div key={p.id} className="bg-stone-50 p-4 rounded-xl border border-stone-100 flex justify-between items-center">
                <div>
                  <p className="text-xs font-bold text-stone-500 uppercase">{p.name}</p>
                  <p className="text-xl font-black">{p.stock}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => updateStock(p.id, p.stock - 1)} className="w-8 h-8 bg-stone-200 rounded-lg font-bold">-</button>
                  <button onClick={() => updateStock(p.id, p.stock + 1)} className="w-8 h-8 bg-stone-900 text-white rounded-lg font-bold">+</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Orders Table */}
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-stone-50 border-b border-stone-200">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-stone-400">CUSTOMER</th>
                <th className="px-6 py-4 text-xs font-bold text-stone-400">ORDER</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {bookings.map((b) => (
                <tr key={b.id}>
                  <td className="px-6 py-4 font-semibold">{b.customer_name}</td>
                  <td className="px-6 py-4">
                    {b.items?.map((item: any, i: number) => (
                      <div key={i} className="text-sm">{item.quantity}× {item.name}</div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}