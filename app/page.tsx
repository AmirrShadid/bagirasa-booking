'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

// Roti yang dikawal ketat mengikut slot masa (Contoh: 4 ketul per slot untuk Original, 7 untuk Choc)
const SLOT_LIMITED_BREADS = ['Original Salt Bread', 'Chocolate Salt Bread'];
const SLOTS = ['3:30 PM', '8:30 PM'];

interface SaltBread {
  id: number;
  name: string;
  price: number;
  available_stock: number;
}

interface SlotStock {
  id: string;
  bread_id: number;
  slot: string;
  max_stock: number;
  available_stock: number;
}

interface ConfirmedBooking {
  id: number;
  customer_name: string;
  phone: string;
  pickup_time: string;
  items: Array<{ name: string; quantity: number; price: number }>;
  total_price: number;
}

export default function BookingPage() {
  const [breads, setBreads] = useState<SaltBread[]>([]);
  const [slotStocks, setSlotStocks] = useState<SlotStock[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [pickupTime, setPickupTime] = useState(""); 
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedBooking, setConfirmedBooking] = useState<ConfirmedBooking | null>(null);

  const isSlotLimited = (name: string) => SLOT_LIMITED_BREADS.includes(name);

  const slotLabelToTimestamp = (slotLabel: string): string => {
    const [time, modifier] = slotLabel.split(" ");
    const [hoursStr, minutesStr] = time.split(":");
    let hours = parseInt(hoursStr, 10);
    const minutes = parseInt(minutesStr, 10);

    if (modifier === "PM" && hours < 12) hours += 12;
    if (modifier === "AM" && hours === 12) hours = 0;

    const dt = new Date();
    dt.setHours(hours, minutes, 0, 0);
    return dt.toISOString();
  };

  const fetchMenu = useCallback(async () => {
    try {
      setLoadingMenu(true);
      setError(null);

      const { data: menuData, error: menuError } = await supabase
        .from('salt_breads')
        .select('id, name, price, available_stock')
        .order('name', { ascending: true });

      if (menuError) throw menuError;

      const { data: slotData, error: slotError } = await supabase
        .from('bread_slot_stock')
        .select('id, bread_id, slot, max_stock, available_stock');

      if (slotError) throw slotError;

      setBreads(menuData || []);
      setSlotStocks(slotData || []);
    } catch (err) {
      console.error("fetchMenu failed:", err);
      setError("Gagal memuatkan menu. Sila muat semula halaman.");
    } finally {
      setLoadingMenu(false);
    }
  }, []);

  useEffect(() => {
    fetchMenu();
  }, [fetchMenu]);

  const getAvailableForBread = (bread: SaltBread): number => {
    if (!isSlotLimited(bread.name)) {
      return bread.available_stock;
    }
    if (!pickupTime) return 0; 
    const row = slotStocks.find(
      (s) => s.bread_id === bread.id && s.slot === pickupTime
    );
    return row?.available_stock ?? 0;
  };

  const getCombinedSlotTotal = (breadName: string): number => {
    const bread = breads.find((b) => b.name === breadName);
    if (!bread) return 0;
    if (isSlotLimited(breadName)) {
      return slotStocks
        .filter((s) => s.bread_id === bread.id)
        .reduce((sum, s) => sum + s.available_stock, 0);
    }
    return bread.available_stock;
  };

  const updateQuantity = (bread: SaltBread, delta: number) => {
    const maxStock = getAvailableForBread(bread);
    setQuantities((prev) => {
      const current = prev[bread.name] || 0;
      const next = current + delta;
      if (next < 0) return prev;
      if (next > maxStock) return prev;
      return { ...prev, [bread.name]: next };
    });
  };

  const handlePickupTimeChange = (time: string) => {
    setPickupTime(time);
    setQuantities((prev) => {
      const next = { ...prev };
      for (const name of SLOT_LIMITED_BREADS) {
        delete next[name];
      }
      return next;
    });
  };

  const calculateTotal = () => {
    return Object.entries(quantities).reduce((total, [name, qty]) => {
      const item = breads.find((b) => b.name === name);
      return total + (item ? item.price * qty : 0);
    }, 0);
  };

  const totalItemsCount = Object.values(quantities).reduce((acc, curr) => acc + curr, 0);

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName || !phone || !pickupTime || calculateTotal() === 0) return;

    setSubmitting(true);
    setError(null);

    const itemsOrdered = Object.entries(quantities)
      .filter(([_, qty]) => qty > 0)
      .map(([name, qty]) => {
        const item = breads.find((b) => b.name === name)!;
        return { id: item.id, name: item.name, quantity: qty, price: item.price };
      });

    const succeeded: Array<{ id: number; name: string; quantity: number }> = [];

    try {
      for (const item of itemsOrdered) {
        let ok = false;

        if (isSlotLimited(item.name)) {
          const { data, error: rpcError } = await supabase.rpc('decrement_slot_stock', {
            p_bread_id: item.id,
            p_slot: pickupTime,
            p_qty: item.quantity,
          });
          if (rpcError) throw rpcError;
          ok = data === true;
        } else {
          const { data, error: rpcError } = await supabase.rpc('decrement_bread_stock', {
            p_bread_id: item.id,
            p_qty: item.quantity,
          });
          if (rpcError) throw rpcError;
          ok = data === true;
        }

        if (!ok) {
          throw new Error(
            `Maaf, stok "${item.name}" untuk slot ${pickupTime} dah habis. Sila kurangkan kuantiti atau pilih slot lain.`
          );
        }

        succeeded.push({ id: item.id, name: item.name, quantity: item.quantity });
      }

      const { data: bookingData, error: bookingError } = await supabase
        .from('bookings')
        .insert({
          customer_name: customerName,
          phone: phone,
          pickup_time: slotLabelToTimestamp(pickupTime),
          total_price: calculateTotal(),
          items: itemsOrdered,
          status: 'pending',
        })
        .select()
        .single();

      if (bookingError) throw bookingError;

      const sendWhatsApp = (name: string, total: number, items: typeof itemsOrdered, slot: string) => {
        const waPhone = "60148564742"; 
        const itemsList = items.map((i) => `${i.quantity}x ${i.name}`).join('%0A');
        const message =
          `*TEMPAHAN BARU BAGIRASA*%0A%0A` +
          `Nama: ${name}%0ASlot: ${slot}%0A%0A` +
          `Order:%0A${itemsList}%0A%0A` +
          `Total: RM${total.toFixed(2)}`;
        window.open(`https://wa.me/${waPhone}?text=${message}`, '_blank');
      };
      sendWhatsApp(customerName, calculateTotal(), itemsOrdered, pickupTime);

      setConfirmedBooking({
        id: bookingData.id,
        customer_name: customerName,
        phone: phone,
        pickup_time: pickupTime,
        items: itemsOrdered,
        total_price: calculateTotal(),
      });

      setQuantities({});
      setCustomerName("");
      setPhone("");
      setPickupTime("");
      window.scrollTo({ top: 0, behavior: 'smooth' });

      await fetchMenu();
    } catch (err: any) {
      console.error("Booking failed:", err);
      setError(err.message || "Sesuatu tidak kena. Sila cuba lagi.");

      for (const item of succeeded) {
        if (isSlotLimited(item.name)) {
          await supabase.rpc('decrement_slot_stock', {
            p_bread_id: item.id,
            p_slot: pickupTime,
            p_qty: -item.quantity, 
          });
        } else {
          const { data } = await supabase
            .from('salt_breads')
            .select('available_stock')
            .eq('id', item.id)
            .single();
          if (data) {
            await supabase
              .from('salt_breads')
              .update({ available_stock: data.available_stock + item.quantity })
              .eq('id', item.id);
          }
        }
      }
      await fetchMenu();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-900 py-12 px-4 sm:px-6 lg:px-8 flex flex-col items-center justify-start overflow-y-auto font-sans">
      <div className="max-w-xl w-full space-y-8 bg-[#faf8f5] rounded-3xl p-8 sm:p-10 shadow-2xl text-stone-800 border border-stone-200">

        <div className="text-center space-y-3 pb-6 border-b border-stone-200">
          <h1 className="text-4xl sm:text-5xl font-serif text-stone-900 tracking-tight leading-none">
            Bagirasa Salt Bread
          </h1>
          <p className="text-stone-500 text-sm sm:text-base font-normal max-w-md mx-auto pt-2">
            Pilih slot masa pengambilan anda. Dibakar segar khusus untuk batch hari ini.
          </p>
        </div>

        {/* PILIH SLOT */}
        <div className="pt-2">
          <label className="block text-[10px] font-bold tracking-widest text-stone-400 uppercase mb-2">
            Pilih Slot Pickup (3:30 PM atau 8:30 PM)
          </label>
          <div className="grid grid-cols-2 gap-3">
            {SLOTS.map((time) => (
              <button
                key={time}
                type="button"
                onClick={() => handlePickupTimeChange(time)}
                className={`py-3 rounded-xl text-sm font-bold border transition-all ${
                  pickupTime === time
                    ? 'bg-stone-900 text-white border-stone-900'
                    : 'bg-white border-stone-200 text-stone-600 hover:border-stone-400'
                }`}
              >
                {time}
              </button>
            ))}
          </div>
          {!pickupTime && (
            <p className="text-[11px] text-stone-400 mt-2">
              * Sila pilih slot masa dahulu untuk melihat baki stok yang tersedia.
            </p>
          )}
        </div>

        {/* LIVE COUNTER */}
        <div className="py-2">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-xs font-bold tracking-widest text-stone-400 uppercase">
              Live Stock Status (Total Keseluruhan)
            </h3>
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-stone-100 rounded-lg p-3 text-center border border-stone-200/60">
              <span className="block text-2xl font-serif text-stone-900">{getCombinedSlotTotal('Original Salt Bread')}</span>
              <span className="text-[10px] font-bold text-stone-400 uppercase block mt-1">Original</span>
            </div>
            <div className="bg-stone-100 rounded-lg p-3 text-center border border-stone-200/60">
              <span className="block text-2xl font-serif text-stone-900">{getCombinedSlotTotal('Chocolate Salt Bread')}</span>
              <span className="text-[10px] font-bold text-stone-400 uppercase block mt-1">Choc</span>
            </div>
            <div className="bg-stone-100 rounded-lg p-3 text-center border border-stone-200/60">
              <span className="block text-2xl font-serif text-stone-900">{getCombinedSlotTotal('Korean Cream Cheese')}</span>
              <span className="text-[10px] font-bold text-stone-400 uppercase block mt-1">Cream Cheese</span>
            </div>
            <div className="bg-stone-100 rounded-lg p-3 text-center border border-stone-200/60">
              <span className="block text-2xl font-serif text-stone-900">{getCombinedSlotTotal('Garlic')}</span>
              <span className="text-[10px] font-bold text-stone-400 uppercase block mt-1">Garlic</span>
            </div>
          </div>
        </div>

        {/* MENU LIST */}
        <div className="space-y-6 pt-4">
          <h2 className="text-2xl font-serif text-stone-900 border-b border-stone-200 pb-2">Menu Pilihan</h2>

          {loadingMenu ? (
            <p className="text-center py-6 text-stone-400">Memuatkan menu...</p>
          ) : breads.length === 0 ? (
            <p className="text-center py-8 text-stone-400">Tiada menu tersedia buat masa ini.</p>
          ) : (
            <div className="space-y-8">
              {breads.map((bread) => {
                const qty = quantities[bread.name] || 0;
                const limited = isSlotLimited(bread.name);
                const availableStock = getAvailableForBread(bread);
                const needsSlotFirst = limited && !pickupTime;
                const isSoldOut = !needsSlotFirst && availableStock <= 0;

                return (
                  <div key={bread.id} className={`space-y-3 pb-6 border-b border-stone-100 last:border-0 transition-opacity ${isSoldOut ? 'opacity-60' : 'opacity-100'}`}>
                    <div className="flex justify-between items-center">
                      <h3 className="text-xl font-serif text-stone-900">{bread.name}</h3>
                      <span className="text-xl font-serif text-stone-900">RM {bread.price.toFixed(2)}</span>
                    </div>

                    <div className="inline-block bg-stone-100 px-2 py-0.5 rounded text-[10px] font-semibold text-stone-500 uppercase tracking-wider border border-stone-200/40">
                      {needsSlotFirst
                        ? "Pilih slot dahulu"
                        : isSoldOut
                        ? "Sold Out"
                        : `${availableStock} Unit Tersedia${limited ? ` (${pickupTime})` : ''}`}
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t border-stone-100">
                      <span className="text-[10px] font-bold tracking-widest text-stone-400 uppercase">Kuantiti:</span>
                      <div className="flex items-center space-x-4">
                        <button
                          type="button"
                          onClick={() => updateQuantity(bread, -1)}
                          disabled={qty === 0 || isSoldOut || needsSlotFirst}
                          className="h-8 w-8 rounded-full border border-stone-300 flex items-center justify-center text-stone-600 hover:bg-stone-100 disabled:opacity-30"
                        >
                          -
                        </button>
                        <span className="w-6 text-center font-bold text-stone-900 text-sm">
                          {needsSlotFirst || isSoldOut ? "0" : qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(bread, 1)}
                          disabled={isSoldOut || needsSlotFirst || qty >= availableStock}
                          className={`h-8 w-8 rounded-full border flex items-center justify-center transition-all ${
                            isSoldOut || needsSlotFirst
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

        {/* BOOKING FORM */}
        <form onSubmit={handleBooking} className="space-y-6 pt-6 border-t border-stone-200">
          <h2 className="text-2xl font-serif text-stone-900">Pengesahan Tempahan</h2>

          <div className="bg-stone-100/60 rounded-xl p-5 border border-stone-200/60">
            <div className="flex justify-between items-center text-xs font-bold tracking-widest text-stone-400 uppercase border-b border-stone-200/80 pb-3 mb-4">
              <span>Item Dipilih</span>
              <span className="bg-stone-200 text-stone-700 px-2.5 py-1 rounded-full text-[10px] font-bold">
                {totalItemsCount} Unit
              </span>
            </div>

            {totalItemsCount === 0 ? (
              <p className="text-xs text-stone-400 text-center py-4">Sila pilih slot dan kuantiti di atas.</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(quantities).map(([name, qty]) => {
                  if (qty === 0) return null;
                  const item = breads.find((b) => b.name === name);
                  if (!item) return null;
                  return (
                    <div key={item.id} className="flex justify-between text-base font-serif text-stone-900">
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
              <label className="block text-[10px] font-bold tracking-widest text-stone-400 uppercase mb-1">Nama Penuh</label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="cth: Amir"
                className="w-full bg-transparent border-b border-stone-300 py-2 text-stone-900 focus:outline-none focus:border-stone-900 text-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold tracking-widest text-stone-400 uppercase mb-1">Nombor Telefon</label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="cth: 0123456789"
                className="w-full bg-transparent border-b border-stone-300 py-2 text-stone-900 focus:outline-none focus:border-stone-900 text-sm"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>
          )}

          <div className="pt-4 border-t border-stone-200 flex justify-between items-center">
            <div>
              <span className="block text-[10px] font-bold tracking-widest text-stone-400 uppercase">Jumlah Harga</span>
              <span className="block text-3xl font-serif text-stone-900">RM {calculateTotal().toFixed(2)}</span>
            </div>
            <button
              type="submit"
              disabled={submitting || totalItemsCount === 0 || !customerName || !phone || !pickupTime}
              className="bg-stone-900 hover:bg-stone-800 text-white px-6 py-3.5 rounded-xl text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50"
            >
              {submitting ? "Memproses..." : "Hantar & WhatsApp"}
            </button>
          </div>
        </form>

      </div>

      {confirmedBooking && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#faf8f5] rounded-3xl p-8 max-w-md w-full shadow-2xl border border-stone-200 text-stone-800 space-y-6">
            <div className="text-center space-y-2">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-stone-950 text-white text-2xl font-serif mb-2">✓</div>
              <h2 className="text-3xl font-serif text-stone-900">Tempahan Berjaya!</h2>
              <p className="text-xs text-stone-400">Sila semak mesej WhatsApp yang terbuka secara automatik.</p>
            </div>
            <button
              onClick={() => setConfirmedBooking(null)}
              className="w-full bg-stone-900 hover:bg-stone-800 text-white py-3 rounded-xl text-xs font-bold tracking-widest uppercase"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}