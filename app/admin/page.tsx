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
        .order('pickup_time', { ascending: true }); // Susun ikut waktu pickup
      if (data) setBookings(data);
    }
    if (isAuth) fetchBookings();
  }, [isAuth]);

  if (!isAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-4 font-sans">
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-stone-200 w-full max-w-sm">
          <h2 className="font-bold text-stone-900 mb-6 text-center">Bagirasa Admin</h2>
          <input 
            type="password" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-stone-300 p-3 rounded-lg mb-4 text-center text-stone-900"
            placeholder="Enter Password"
          />
          <button 
            onClick={() => password === "230187Sa" ? setIsAuth(true) : alert('Wrong Password!')}
            className="w-full bg-stone-900 text-white py-3 rounded-lg font-bold"
          >
            Access Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white p-8 font-sans">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-stone-900 mb-8">Bagirasa Admin Dashboard</h1>
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-stone-100 border-b border-stone-200">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-stone-600 uppercase tracking-wider">Customer</th>
                <th className="px-6 py-4 text-xs font-bold text-stone-600 uppercase tracking-wider">Pickup</th>
                <th className="px-6 py-4 text-xs font-bold text-stone-600 uppercase tracking-wider">Order</th>
                <th className="px-6 py-4 text-xs font-bold text-stone-600 uppercase tracking-wider">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {bookings.length > 0 ? bookings.map((b) => (
                <tr key={b.id} className="hover:bg-stone-50 transition-colors">
                  <td className="px-6 py-4 font-semibold text-stone-900">{b.customer_name}</td>
                  <td className="px-6 py-4 text-sm text-stone-700 font-medium">
                    {new Date(b.pickup_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-6 py-4 text-sm text-stone-700">
                    {b.items?.map((item: any, i: number) => (
                      <div key={i}>{item.quantity}× {item.name}</div>
                    ))}
                  </td>
                  <td className="px-6 py-4 font-bold text-stone-900">RM {Number(b.total_price || 0).toFixed(2)}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-stone-500 italic">No bookings found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}