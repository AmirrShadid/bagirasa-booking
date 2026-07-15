'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [isAuth, setIsAuth] = useState(false);
  const [bookings, setBookings] = useState<any[]>([]);

  useEffect(() => {
    async function fetchBookings() {
      const { data } = await supabase
        .from('bookings')
        .select('*')
        .order('created_at', { ascending: false });
      if (data) setBookings(data);
    }
    if (isAuth) fetchBookings();
  }, [isAuth]);

  if (!isAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="bg-white p-6 rounded-xl shadow-lg border border-stone-200 w-80">
          <h2 className="font-bold mb-4 text-center">Bagirasa Access</h2>
          <input 
            type="password" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border p-2 rounded mb-4 text-center"
            placeholder="Enter Password"
          />
          <button 
            onClick={() => password === "230187Sa" ? setIsAuth(true) : alert('Wrong Password!')}
            className="w-full bg-stone-900 text-white py-2 rounded"
          >
            Enter
          </button>
        </div>
      </div>
    );
  }

  // Dashboard penuh kau
  return (
    <div className="min-h-screen bg-stone-50 p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold mb-8">Bagirasa Admin Dashboard</h1>
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-stone-50 border-b border-stone-200">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-stone-400">Customer</th>
                <th className="px-6 py-4 text-xs font-bold text-stone-400">Order</th>
                <th className="px-6 py-4 text-xs font-bold text-stone-400">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {bookings.map((b) => (
                <tr key={b.id} className="hover:bg-stone-50">
                  <td className="px-6 py-4 font-semibold">{b.customer_name}</td>
                  <td className="px-6 py-4 text-sm">
                    {b.items?.map((item: any, i: number) => (
                      <div key={i}>{item.quantity}× {item.name}</div>
                    ))}
                  </td>
                  <td className="px-6 py-4 font-bold">RM {b.total_price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}