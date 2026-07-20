'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

// TUKAR KEPADA FALSE BILA DAH SIAP UPDATE
const IS_MAINTENANCE = true; 

export default function BookingPage() {
  // MAINTENANCE MODE UI
  if (IS_MAINTENANCE) {
    return (
      <div className="min-h-screen bg-stone-900 flex items-center justify-center p-6 text-center font-sans">
        <div className="bg-[#faf8f5] rounded-3xl p-10 max-w-sm w-full border border-stone-200 shadow-2xl">
          <h1 className="text-3xl font-serif text-stone-900 mb-4">Under Maintenance</h1>
          <p className="text-stone-500 mb-8 text-sm leading-relaxed">
            Bagirasa sedang dalam proses naik taraf untuk memberikan pengalaman tempahan yang lebih premium buat anda.
          </p>
          <a 
            href="https://wa.me/60148564742" 
            className="block w-full bg-stone-900 text-white py-3 rounded-xl text-xs font-bold tracking-widest uppercase hover:bg-stone-800 transition-all shadow-lg"
          >
            Hubungi WhatsApp
          </a>
        </div>
      </div>
    );
  }

  // --- KOD ASAL ANDA ---
  const [breads, setBreads] = useState<SaltBread[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [pickupTime, setPickupTime] = useState("");
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedBooking, setConfirmedBooking] = useState<ConfirmedBooking | null>(null);

  // ... sambungan kod asal anda ke bawah ...
  // (Pastikan anda simpan semula keseluruhan fail selepas menampal kod ini)