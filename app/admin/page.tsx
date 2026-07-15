'use client';

import { useState } from 'react';
import AdminDashboard from './dashboard-content'; // Kita pecahkan komponen ni nanti

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const checkPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === process.env.NEXT_PUBLIC_ADMIN_PASSWORD) { // Pastikan set di Vercel
      setIsAuthenticated(true);
    } else {
      alert('Password salah!');
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <form onSubmit={checkPassword} className="bg-white p-8 rounded-2xl shadow-sm border border-stone-200">
          <h2 className="font-bold mb-4">Admin Access</h2>
          <input 
            type="password" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border p-2 rounded w-full mb-4"
            placeholder="Masukkan password"
          />
          <button className="bg-stone-900 text-white px-4 py-2 rounded w-full">Masuk</button>
        </form>
      </div>
    );
  }

  return <AdminDashboard />;
}