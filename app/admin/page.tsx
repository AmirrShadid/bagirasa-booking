'use client';

import { useEffect, useState, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Tukar timestamp (pickup_time) kepada key tarikh "YYYY-MM-DD" ikut waktu Malaysia,
// supaya booking dikumpul ikut tarikh yang betul (bukan ikut UTC yang boleh tersalah hari)
const getDateKey = (isoString: string): string => {
  return new Date(isoString).toLocaleDateString('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur',
  }); // hasil cth: "2026-07-23"
};

// Format tarikh untuk paparan (cth: "Monday, 27 July 2026")
const formatDateLabel = (dateKey: string): string => {
  const [year, month, day] = dateKey.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

export default function AdminPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const [isAuth, setIsAuth] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [bookings, setBookings] = useState<any[]>([]);
  const [filter, setFilter] = useState<'pending' | 'picked_up'>('pending');
  const [selectedDate, setSelectedDate] = useState<string>('all'); // 'all' atau "YYYY-MM-DD"

  // Semak sama ada dah ada sesi login sedia ada (contoh: refresh page tak logout terus)
  useEffect(() => {
    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      setIsAuth(!!data.session);
      setCheckingSession(false);
    }
    checkSession();

    // Dengar perubahan status login (login/logout) secara live
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuth(!!session);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    async function fetchBookings() {
      const { data } = await supabase
        .from('bookings')
        .select('*')
        .order('pickup_time', { ascending: true });
      if (data) setBookings(data);
    }
    if (isAuth) fetchBookings();
  }, [isAuth]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setLoginError('Email atau password salah.');
      setLoggingIn(false);
      return;
    }

    setPassword('');
    setLoggingIn(false);
    // isAuth akan auto-update melalui onAuthStateChange di atas
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setIsAuth(false);
  }

  async function markAsPicked(id: string) {
    const { data, error } = await supabase
      .from('bookings')
      .update({ status: 'picked_up' })
      .eq('id', id)
      .select();

    if (error) {
      console.error("Gagal update:", error);
      alert("Gagal update! Sila semak RLS Policy di Supabase.");
      return;
    }

    if (data) {
      setBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'picked_up' } : b));
    }
  }

  // Senarai tarikh unik (dari terkini ke lama) untuk dropdown filter
  const availableDates = useMemo(() => {
    const dateKeys = new Set(bookings.map(b => getDateKey(b.pickup_time)));
    return Array.from(dateKeys).sort().reverse(); // terkini dulu
  }, [bookings]);

  // Bookings yang dah ditapis ikut status + tarikh (kalau dipilih)
  const filteredBookings = useMemo(() => {
    return bookings
      .filter(b => (b.status || 'pending').toLowerCase().trim() === filter)
      .filter(b => selectedDate === 'all' || getDateKey(b.pickup_time) === selectedDate);
  }, [bookings, filter, selectedDate]);

  // Kumpulkan ikut tarikh, tersusun dari tarikh terkini ke lama.
  // Dalam setiap tarikh, order tersusun ikut waktu pickup (pagi -> petang)
  const groupedByDate = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const b of filteredBookings) {
      const key = getDateKey(b.pickup_time);
      if (!groups[key]) groups[key] = [];
      groups[key].push(b);
    }
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0])); // tarikh terkini dulu
  }, [filteredBookings]);

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-stone-400 text-sm">Memuatkan...</p>
      </div>
    );
  }

  if (!isAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-4 font-sans">
        <form onSubmit={handleLogin} className="bg-white p-8 rounded-2xl shadow-xl border border-stone-200 w-full max-w-sm">
          <h2 className="font-bold text-stone-900 mb-6 text-center">Bagirasa Admin</h2>

          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-stone-300 p-3 rounded-lg mb-3 text-center text-stone-900"
            placeholder="Email"
          />
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-stone-300 p-3 rounded-lg mb-4 text-center text-stone-900"
            placeholder="Password"
          />

          {loginError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2 mb-4 text-center">
              {loginError}
            </p>
          )}

          <button
            type="submit"
            disabled={loggingIn}
            className="w-full bg-stone-900 text-white py-3 rounded-lg font-bold disabled:opacity-50"
          >
            {loggingIn ? 'Log masuk...' : 'Log Masuk'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 p-8 font-sans">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-stone-900">Bagirasa Admin Dashboard</h1>
          <button
            onClick={handleLogout}
            className="text-xs font-bold text-stone-500 hover:text-stone-900 uppercase tracking-wide"
          >
            Log Keluar
          </button>
        </div>

        {/* Tab Filter Status + Dropdown Tarikh */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex gap-2">
            {(['pending', 'picked_up'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${
                  filter === status
                  ? 'bg-stone-900 text-white'
                  : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-100'
                }`}
              >
                {status === 'picked_up' ? 'Completed' : status}
              </button>
            ))}
          </div>

          <select
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="border border-stone-200 rounded-lg px-3 py-2 text-xs font-bold text-stone-700 bg-white uppercase tracking-wide"
          >
            <option value="all">All dates</option>
            {availableDates.map((dateKey) => (
              <option key={dateKey} value={dateKey}>
                {formatDateLabel(dateKey)}
              </option>
            ))}
          </select>
        </div>

        {groupedByDate.length === 0 ? (
          <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-10 text-center text-stone-400 text-sm">
            Tiada booking untuk paparan ini.
          </div>
        ) : (
          <div className="space-y-8">
            {groupedByDate.map(([dateKey, dateBookings]) => (
              <div key={dateKey}>
                {/* Header Tarikh Batch */}
                <div className="flex items-center gap-3 mb-3">
                  <h2 className="text-sm font-bold text-stone-900 uppercase tracking-wide">
                    {formatDateLabel(dateKey)}
                  </h2>
                  <span className="bg-stone-200 text-stone-700 px-2 py-0.5 rounded-full text-[10px] font-bold">
                    {dateBookings.length} order{dateBookings.length !== 1 ? 's' : ''}
                  </span>
                </div>

                <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-stone-100 border-b border-stone-200">
                      <tr>
                        <th className="px-6 py-4 text-xs font-bold text-stone-600 uppercase tracking-wider">Customer</th>
                        <th className="px-6 py-4 text-xs font-bold text-stone-600 uppercase tracking-wider">Pickup</th>
                        <th className="px-6 py-4 text-xs font-bold text-stone-600 uppercase tracking-wider">Order</th>
                        <th className="px-6 py-4 text-xs font-bold text-stone-600 uppercase tracking-wider">Total</th>
                        <th className="px-6 py-4 text-xs font-bold text-stone-600 uppercase tracking-wider">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {dateBookings.map((b) => (
                        <tr key={b.id} className={`${b.status === 'picked_up' ? 'bg-stone-50 opacity-60' : 'hover:bg-stone-50'} transition-all`}>
                          <td className="px-6 py-4 font-semibold text-stone-900">{b.customer_name}</td>
                          <td className="px-6 py-4 text-sm text-stone-700 font-medium">
                            {new Date(b.pickup_time).toLocaleTimeString('en-GB', {
                              hour: '2-digit',
                              minute: '2-digit',
                              timeZone: 'Asia/Kuala_Lumpur',
                            })}
                          </td>
                          <td className="px-6 py-4 text-sm text-stone-700">
                            {b.items?.map((item: any, i: number) => (
                              <div key={i}>{item.quantity}× {item.name}</div>
                            ))}
                          </td>
                          <td className="px-6 py-4 font-bold text-stone-900">RM {Number(b.total_price || 0).toFixed(2)}</td>
                          <td className="px-6 py-4">
                            {b.status !== 'picked_up' ? (
                              <button
                                onClick={() => markAsPicked(b.id)}
                                className="text-[10px] bg-emerald-600 text-white px-3 py-1.5 rounded-md font-bold hover:bg-emerald-700 uppercase transition-colors"
                              >
                                Pick Up
                              </button>
                            ) : (
                              <span className="text-[10px] font-bold text-stone-400 uppercase bg-stone-200 px-2 py-1 rounded">Done</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}