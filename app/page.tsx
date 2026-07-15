'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase'; // Ubah laluan ini mengikut konfigurasi projek kau jika berbeza

interface SaltBread {
  id: string;
  name: string;
  price: number;
  available_stock: number;
}

interface ConfirmedBooking {
  id: string;
  customer_name: string;
  phone: string;
  pickup_time: string;
  items: Array<{ name: string; quantity: number; price: number }>;
  total_price: number;
}

export default function BookingPage() {
  const [breads, setBreads] = useState<SaltBread[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [pickupTime, setPickupTime] = useState("");
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedBooking, setConfirmedBooking] = useState<ConfirmedBooking | null>(null);

  const fetchMenu = useCallback(async () => {
    try {
      setLoadingMenu(true);
      const { data: menuData, error: fetchError } = await supabase
        .from('salt_breads')
        .select('id, name, price, available_stock')
        .order('name', { ascending: true });

      if (fetchError) {
        console.error("fetchMenu failed:", fetchError);
        setError("Unable to load menu. Please refresh and try again.");
        
        const isShopOpen = () => {
          const now = new Date();
          const hour = now.getHours();
          // Contoh: Kedai tutup kalau dah pukul 8 malam (20:00) ke atas
          // Kau boleh tukar 20 kepada waktu pilihan kau
          return hour < 22; 
        };
        return;
      }

      if (menuData) {
        setBreads(menuData);
      }
    } catch (err) {
      console.error("Unexpected error in fetchMenu:", err);
      setError("An unexpected error occurred.");
    } finally {
      setLoadingMenu(false);
    }
  }, []);

  useEffect(() => {
    fetchMenu();
  }, [fetchMenu]);

  // Menggunakan nama roti sebagai key state
  const updateQuantity = (name: string, delta: number, maxStock: number) => {
    setQuantities(prev => {
      const current = prev[name] || 0;
      const next = current + delta;
      if (next < 0) return prev;
      if (next > maxStock) return prev;
      return { ...prev, [name]: next };
    });
  };

  // Kira total berdasarkan padanan nama roti
  const calculateTotal = () => {
    return Object.entries(quantities).reduce((total, [name, qty]) => {
      const item = breads.find(b => b.name === name);
      return total + (item ? item.price * qty : 0);
    }, 0);
  };

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName || !phone || !pickupTime || calculateTotal() === 0) return;

    setSubmitting(true);
    setError(null);

    // Dapatkan data item dengan memadankan nama roti ke ID asal pangkalan data
    const itemsOrdered = Object.entries(quantities)
      .filter(([_, qty]) => qty > 0)
      .map(([name, qty]) => {
        const item = breads.find(b => b.name === name)!;
        return {
          id: item.id,
          name: item.name,
          quantity: qty,
          price: item.price
        };
      });

    try {
      // TUKAR TEKS "02:30 PM DROP" KEPADA FORMAT TIMESTAMPTZ YANG SAH
      // Ekstrak waktu (cth: "02:30 PM") daripada string pilihan
      const timePart = pickupTime.replace(" DROP", ""); // Jadi "02:30 PM" atau "3:30 PM"
      const [time, modifier] = timePart.split(" "); // ["02:30", "PM"]
      let [hoursStr, minutesStr] = time.split(":");
      let hours = parseInt(hoursStr, 10);
      const minutes = parseInt(minutesStr, 10);

      if (modifier === "PM" && hours < 12) {
        hours += 12;
      }
      if (modifier === "AM" && hours === 12) {
        hours = 0;
      }

      // Bina objek tarikh untuk hari ini dengan waktu yang dipilih
      const pickupDateTime = new Date();
      pickupDateTime.setHours(hours, minutes, 0, 0);

      // 1. Masukkan tempahan baru ke dalam table 'bookings'
      const { data: bookingData, error: bookingError } = await supabase
        .from('bookings')
        .insert({
          customer_name: customerName,
          phone: phone, 
          pickup_time: pickupDateTime.toISOString(), // Hantar format ISO String yang sah (cth: 2026-07-16T14:30:00.000Z)
          total_price: calculateTotal(),
          items: itemsOrdered
        })
        .select()
        .single();

      if (bookingError) throw bookingError;

      // 2. Tolak stok roti dalam table 'salt_breads' untuk setiap item yang ditempah
      for (const item of itemsOrdered) {
        const currentBread = breads.find(b => b.id === item.id);
        if (currentBread) {
          const newStock = Math.max(0, currentBread.available_stock - item.quantity);
          const { error: updateError } = await supabase
            .from('salt_breads')
            .update({ available_stock: newStock })
            .eq('id', item.id);

          if (updateError) throw updateError;
        }
      }

      const sendWhatsApp = (name: string, total: number) => {
      const phone = "60148564742"; // Ganti dengan nombor WhatsApp kau (format antarabangsa)
      const message = `Hai Amir, ada tempahan baru!%0A%0ANama: ${name}%0ATotal: RM${total.toFixed(2)}%0A%0ASila semak dashboard untuk butiran lanjut.`;
      window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
    };

      setConfirmedBooking({
        id: bookingData.id,
        customer_name: customerName,
        phone: phone,
        pickup_time: pickupTime,
        items: itemsOrdered,
        total_price: calculateTotal()
      });

      // 1. Reset state asal
        setQuantities({});
        setCustomerName("");
        setPhone("");
        setPickupTime("");

        // 2. Bagi masa sikit, lepas tu scroll ke atas secara smooth (supaya dia nampak resit kat modal)
        window.scrollTo({ top: 0, behavior: 'smooth' });

        // 3. Optional: Kalau nak tambah "Toast" (notifikasi kecil kat atas skrin),
        // kau boleh buat state 'showToast' (tapi ni nanti dulu kalau nak).
      
        // Panggil fungsi WhatsApp di sini
        sendWhatsApp(customerName, calculateTotal());
    
        // Reset borang selepas berjaya
        setQuantities({});
        setCustomerName("");
        setPhone("");
        setPickupTime("");
        fetchMenu(); // Segarkan stok terkini

    } catch (err: any) {
      console.error("Booking failed:", err);
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const totalItemsCount = Object.values(quantities).reduce((acc, curr) => acc + curr, 0);

  return (
    <div className="min-h-screen bg-stone-900 py-12 px-4 sm:px-6 lg:px-8 flex flex-col items-center justify-start overflow-y-auto font-sans">
      <div className="max-w-xl w-full space-y-8 bg-[#faf8f5] rounded-3xl p-8 sm:p-10 shadow-2xl text-stone-800 border border-stone-200">
        
        {/* HEADER SECTION */}
        <div className="text-center space-y-3 pb-6 border-b border-stone-200">
          <h1 className="text-4xl sm:text-5xl font-serif text-stone-900 tracking-tight leading-none">
            Crafted Fresh, Worth the Wait.
          </h1>
          <p className="text-stone-500 text-sm sm:text-base font-normal max-w-md mx-auto pt-2">
            A premium viral salt bread (Sio Pan) baked with layers of high-grade churned butter, pristine mineral sea salt, and dynamic locking inventory to guarantee your batch is coming hot straight from our oven.
          </p>
        </div>

        {/* LIVE COUNTER DROP STATUS (FOCUSED ON ORIGINAL & CHOCOLATE) */}
        <div className="py-2">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-xs font-bold tracking-widest text-stone-400 uppercase">
              LIVE COUNTER DROP STATUS
            </h3>
            <div className="flex items-center space-x-2 text-xs text-stone-400 font-medium">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Synchronized</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {/* Box 1: Original Salt Bread Stock */}
            <div className="bg-stone-100 rounded-lg p-4 text-center border border-stone-200/60">
              <span className="block text-3xl font-serif text-stone-900">
                {breads.find(b => b.name === 'Original Salt Bread')?.available_stock ?? 20}
              </span>
              <span className="text-[10px] font-bold tracking-wider text-stone-400 uppercase block mt-1">
                Original
              </span>
            </div>

            {/* Box 2: Chocolate Salt Bread Stock */}
            <div className="bg-stone-100 rounded-lg p-4 text-center border border-stone-200/60">
              <span className="block text-3xl font-serif text-stone-900">
                {breads.find(b => b.name === 'Chocolate Salt Bread')?.available_stock ?? 0}
              </span>
              <span className="text-[10px] font-bold tracking-wider text-stone-400 uppercase block mt-1">
                Chocolate
              </span>
            </div>

            {/* Box 3: User's Booking Status */}
            <div className={`rounded-lg p-4 text-center border transition-all duration-300 ${
              totalItemsCount > 0 
                ? 'bg-stone-900 border-stone-950 text-white shadow-sm' 
                : 'bg-stone-100 border-stone-200/60 text-stone-900'
            }`}>
              <span className="block text-3xl font-serif">
                {totalItemsCount > 0 ? totalItemsCount : '-'}
              </span>
              <span className={`text-[10px] font-bold tracking-wider uppercase block mt-1 ${
                totalItemsCount > 0 ? 'text-stone-300' : 'text-stone-400'
              }`}>
                {totalItemsCount > 0 ? 'Secured' : 'Not owned yet'}
              </span>
            </div>
          </div>
        </div>

        {/* HERO IMAGE SECTION */}
        <div className="relative w-full h-52 sm:h-64 rounded-2xl overflow-hidden border border-stone-200/40 shadow-sm my-2 bg-stone-100">
          <img 
            src="/images/salt-bread-hero.jpeg"
            alt="Bagirasa Salt Bread Fresh Drop"
            className="w-full h-full object-cover transition-transform duration-700 hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent pointer-events-none"></div>
        </div>

        {/* MENU LIST SECTION */}
        <div className="space-y-6 pt-4">
          <div className="flex justify-between items-baseline border-b border-stone-200 pb-2">
            <h2 className="text-2xl font-serif text-stone-900">Select Your Bake Batch</h2>
            <span className="text-[10px] font-bold tracking-wider text-stone-400 uppercase">Immediate 5-Min Locking Enabled</span>
          </div>

          {loadingMenu ? (
            <div className="space-y-4 py-6">
              {[1, 2].map((n) => (
                <div key={n} className="animate-pulse space-y-2">
                  <div className="h-6 bg-stone-200 rounded w-1/3"></div>
                  <div className="h-4 bg-stone-200 rounded w-full"></div>
                  <div className="h-8 bg-stone-200 rounded w-1/4"></div>
                </div>
              ))}
            </div>
          ) : breads.length === 0 ? (
            <p className="text-center py-8 text-stone-400 font-medium">No items available right now.</p>
          ) : (
            <div className="space-y-8">
              {breads.map((bread) => {
              const qty = quantities[bread.name] || 0;
              const isSoldOut = bread.available_stock <= 0;

              return (
                <div key={bread.id} className={`space-y-3 pb-6 border-b border-stone-100 last:border-0 last:pb-0 transition-opacity duration-300 ${isSoldOut ? 'opacity-60' : 'opacity-100'}`}>
                  
                  {/* NAMA & HARGA */}
                  <div className="flex justify-between items-center">
                    <h3 className="text-xl font-serif text-stone-900 font-normal">
                      {bread.name}
                    </h3>
                    <span className="text-xl font-serif text-stone-900 font-normal">
                      RM {bread.price.toFixed(2)}
                    </span>
                  </div>
                  
                  <p className="text-stone-400 text-xs font-normal leading-relaxed">
                    {bread.name === 'Original Salt Bread' && 'Our signature golden roll: crispy exterior, buttery pillowy center, sprinkled with coarse Maldon sea salt.'}
                    {bread.name === 'Garlic Butter Salt Bread' && 'Infused with premium garlic herb butter and topped with grey Guérande sea salt. Rich, earthy, and aromatic.'}
                    {bread.name === 'Chocolate Salt Bread' && 'Stuffed with 70% dark Belgian chocolate lava and finished with delicate fleur de sel. Sweet-savory perfection.'}
                    {!['Original Salt Bread', 'Garlic Butter Salt Bread', 'Chocolate Salt Bread'].includes(bread.name) && 'Freshly baked premium artisan salt bread roll.'}
                  </p>

                  {/* STATUS STOK */}
                  <div className="inline-block bg-stone-100 px-2 py-0.5 rounded text-[10px] font-semibold text-stone-500 uppercase tracking-wider border border-stone-200/40">
                    {isSoldOut ? "Sold Out" : `${bread.available_stock} Available`}
                  </div>

                  {/* QUANTITY CONTROLS */}
                  <div className="flex justify-between items-center pt-2 border-t border-stone-100">
                    <span className="text-[10px] font-bold tracking-widest text-stone-400 uppercase">Quantity:</span>
                    <div className="flex items-center space-x-4">
                      <button
                        type="button"
                        onClick={() => updateQuantity(bread.name, -1, bread.available_stock)}
                        disabled={qty === 0 || isSoldOut}
                        className="h-8 w-8 rounded-full border border-stone-300 flex items-center justify-center text-stone-600 hover:bg-stone-100 disabled:opacity-30 transition-all"
                      >
                        -
                      </button>
                      
                      <span className="w-6 text-center font-bold text-stone-900 text-sm">
                        {isSoldOut ? "0" : qty}
                      </span>

                      <button
                        type="button"
                        onClick={() => updateQuantity(bread.name, 1, bread.available_stock)}
                        disabled={isSoldOut || qty >= bread.available_stock}
                        className={`h-8 w-8 rounded-full border flex items-center justify-center transition-all ${
                          isSoldOut 
                            ? "border-stone-200 text-stone-300 cursor-not-allowed" 
                            : "border-stone-900 text-stone-900 hover:bg-stone-900 hover:text-white"
                        }`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          )}
        </div>

        {/* BOOKING FORM SECTION */}
        <form onSubmit={handleBooking} className="space-y-6 pt-6 border-t border-stone-200">
          <div className="space-y-1">
            <h2 className="text-2xl font-serif text-stone-900">Reserve Your Drop Batch</h2>
            <p className="text-stone-400 text-xs">Submit pickup credentials below to lock-in your fresh bread batch.</p>
          </div>

          {/* SELECTED ITEMS QUEUE SUMMARY */}
          <div className="bg-stone-100/60 rounded-xl p-5 border border-stone-200/60">
            <div className="flex justify-between items-center text-xs font-bold tracking-widest text-stone-400 uppercase border-b border-stone-200/80 pb-3 mb-4">
              <span>Selected Drop Items</span>
              <span className="bg-stone-200/80 text-stone-700 px-2.5 py-1 rounded-full text-[10px] font-bold">
                {totalItemsCount} {totalItemsCount === 1 ? 'Roll' : 'Rolls'}
              </span>
            </div>
            
            {totalItemsCount === 0 ? (
              <p className="text-xs text-stone-400 text-center py-4 font-normal">
                Your queue is currently empty. Adjust quantities above to secure live inventory slots.
              </p>
            ) : (
              <div className="space-y-3 px-1">
                {/* Memadankan nama dari state 'quantities' */}
                {Object.entries(quantities).map(([name, qty]) => {
                  if (qty === 0) return null;
                  const item = breads.find(b => b.name === name);
                  if (!item) return null;
                  return (
                    <div key={item.id} className="flex justify-between items-center font-serif text-base text-stone-900 font-medium">
                      <span>{item.name}</span>
                      <span>{qty}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold tracking-widest text-stone-400 uppercase mb-1">
                Full Name
              </label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Ahmad Albab"
                className="w-full bg-transparent border-b border-stone-300 py-2 text-stone-900 focus:outline-none focus:border-stone-900 placeholder-stone-300 text-sm transition-colors"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold tracking-widest text-stone-400 uppercase mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0123456789"
                className="w-full bg-transparent border-b border-stone-300 py-2 text-stone-900 focus:outline-none focus:border-stone-900 placeholder-stone-300 text-sm transition-colors"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold tracking-widest text-stone-400 uppercase mb-2">
                Pickup Fresh Bake Session
              </label>
              <div className="grid grid-cols-2 gap-2">
                {["02:30 PM DROP", "3:30 PM DROP", "8:30 PM DROP", "9:30 PM DROP"].map((time) => (
                  <button
                    key={time}
                    type="button"
                    onClick={() => setPickupTime(time)}
                    className={`py-2 px-3 border rounded-lg text-xs font-semibold tracking-wider transition-all duration-200 ${
                      pickupTime === time
                        ? "border-stone-900 bg-stone-900 text-white"
                        : "border-stone-200 bg-white text-stone-500 hover:border-stone-400"
                    }`}
                  >
                    {time}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* TOTAL & SUBMIT */}
          <div className="pt-4 border-t border-stone-200 flex justify-between items-center">
            <div className="space-y-0.5">
              <span className="block text-[10px] font-bold tracking-widest text-stone-400 uppercase">Secured Total</span>
              <span className="block text-3xl font-serif text-stone-900 leading-none">
                RM {calculateTotal().toFixed(2)}
              </span>
            </div>
            <button
              type="submit"
              disabled={submitting || totalItemsCount === 0 || !customerName || !phone || !pickupTime}
              className="bg-stone-900 hover:bg-stone-800 text-white px-8 py-3.5 rounded-xl text-xs font-bold tracking-widest uppercase transition-all shadow-lg hover:shadow-xl disabled:opacity-50 flex items-center justify-center min-w-[160px]"
            >
              {submitting ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Securing...</span>
                </div>
              ) : (
                "Confirm Booking"
              )}
            </button>
          </div>
        </form>
      </div>

      {/* CONFIRMED BOOKING MODAL */}
      {confirmedBooking && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#faf8f5] rounded-3xl p-8 max-w-md w-full shadow-2xl border border-stone-200 text-stone-800 space-y-6">
            <div className="text-center space-y-2">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-stone-950 text-white text-2xl font-serif mb-2">
                ✓
              </div>
              <h2 className="text-3xl font-serif text-stone-900">Booking Secured</h2>
              <p className="text-xs text-stone-400">Please present this receipt when picking up your order.</p>
            </div>

            <div className="border-t border-b border-stone-200 py-4 space-y-3">
              <div className="flex justify-between text-xs">
                <span className="font-bold text-stone-400 uppercase tracking-widest">Customer</span>
                <span className="font-semibold text-stone-900">{confirmedBooking.customer_name}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="font-bold text-stone-400 uppercase tracking-widest">Session</span>
                <span className="font-semibold text-stone-900">{confirmedBooking.pickup_time}</span>
              </div>
              <div className="border-t border-stone-100 pt-3 space-y-2">
                {confirmedBooking.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-xs text-stone-600">
                    <span>{item.name} x {item.quantity}</span>
                    <span>RM {(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-stone-400 uppercase tracking-widest">Total Paid</span>
              <span className="text-2xl font-serif text-stone-900">RM {confirmedBooking.total_price.toFixed(2)}</span>
            </div>

            <button
              onClick={() => setConfirmedBooking(null)}
              className="w-full bg-stone-900 hover:bg-stone-800 text-white py-3 rounded-xl text-xs font-bold tracking-widest uppercase transition-all"
            >
              Close Receipt
            </button>
          </div>
        </div>
      )}
    </div>
  );
}