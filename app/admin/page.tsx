'use client';

import { useState } from 'react';

// Masukkan password rahsia kau kat sini
const SECRET_PASSWORD = "230187Sa@"; 

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [isAuth, setIsAuth] = useState(false);

  // Komponen Dashboard sebenar (kita letak dalam ni supaya dia tak load selagi tak auth)
  const Dashboard = () => (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Bagirasa Admin Dashboard</h1>
      {/* Semua kod dashboard asal kau letak kat sini nanti */}
      <p>Dashboard content is here...</p>
    </div>
  );

  if (!isAuth) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-stone-50">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-stone-200">
          <h2 className="font-bold mb-4">Akses Admin</h2>
          <input 
            type="password" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border p-2 rounded w-full mb-4"
            placeholder="Masukkan password"
          />
          <button 
            onClick={() => {
              if (password === SECRET_PASSWORD) setIsAuth(true);
              else alert('Password salah!');
            }}
            className="bg-stone-900 text-white px-4 py-2 rounded w-full"
          >
            Masuk
          </button>
        </div>
      </div>
    );
  }

  return <Dashboard />;
}