'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AdminDashboard() {
  const [bookings, setBookings] = useState<any[]>([]);

  useEffect(() => {
    async function fetchBookings() {
      const { data } = await supabase
        .from('bookings')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (data) setBookings(data);
    }
    fetchBookings();
  }, []);

  const exportToCSV = () => {
    const headers = ["Customer", "Phone", "Original", "Chocolate", "Pickup", "Total"];
    const rows = bookings.map(b => [
      b.customer_name,
      b.phone,
      b.items?.find((i: any) => i.name === 'Original Salt Bread')?.quantity || 0,
      b.items?.find((i: any) => i.name === 'Chocolate Salt Bread')?.quantity || 0,
      new Date(b.pickup_time).toLocaleTimeString(),
      b.total_price
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Bagirasa_Sales_${new Date().toLocaleDateString()}.csv`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-stone-50 p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-stone-900">Bagirasa Dashboard</h1>
            <p className="text-stone-500">Overview of today's bread reservations</p>
          </div>
          <button 
            onClick={exportToCSV}
            className="bg-stone-900 hover:bg-stone-800 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all"
          >
            EXPORT CSV
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-stone-50 border-b border-stone-200">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-wider">Customer</th>
                <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-wider">Contact</th>
                <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-wider">Order</th>
                <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-wider">Pickup</th>
                <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-wider">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {bookings && bookings.length > 0 ? (
                bookings.map((b) => (
                  <tr key={b.id} className="hover:bg-stone-50 transition-colors">
                    <td className="px-6 py-4 font-semibold text-stone-800">{b.customer_name}</td>
                    <td className="px-6 py-4 text-stone-600 font-mono text-sm">{b.phone}</td>
                    <td className="px-6 py-4">
                      {b.items && b.items.map((item: any, idx: number) => (
                        <div key={idx} className="text-sm text-stone-700">
                          <span className="font-semibold">{item.quantity}×</span> {item.name}
                        </div>
                      ))}
                    </td>
                    <td className="px-6 py-4 text-stone-600">
                      {new Date(b.pickup_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </td>
                    <td className="px-6 py-4 font-bold text-stone-900">
                      RM {Number(b.total_price || 0).toFixed(2)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-stone-400 italic">
                    {bookings ? "No active reservations found." : "Loading..."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}