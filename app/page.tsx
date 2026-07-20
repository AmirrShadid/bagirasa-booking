'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase'; // Ubah laluan ini mengikut konfigurasi projek kau jika berbeza

// Nama roti yang kena limit ikut SLOT (7 unit / slot).
// Roti lain (cth Garlic Butter) guna stock biasa (available_stock), tak ikut slot.
const SLOT_LIMITED_BREADS = ['Original Salt Bread', 'Chocolate Salt Bread'];
const SLOTS = ['3:30 PM', '8:30 PM'];

interface SaltBread {
  id: number; // integer/bigint dari salt_breads.id (bukan uuid)
  name: string;
  price: number;
  available_stock: number; // dipakai untuk roti yang TIDAK ikut slot
}

interface SlotStock {
  id: string; // primary key bread_slot_stock.id (uuid, ok kekal string)
  bread_id: number; // padan dengan salt_breads.id (integer/bigint)
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
  const [pickupTime, setPickupTime] = useState(""); // "3:30 PM" atau "8:30 PM"
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedBooking, setConfirmedBooking] = useState<ConfirmedBooking | null>(null);

  const isSlotLimited = (name: string) => SLOT_LIMITED_BREADS.includes(name);

  // Tukar label slot ("3:30 PM") kepada timestamp yang sah untuk column timestamptz.
  // Guna tarikh HARI INI + waktu yang dipilih.
  const slotLabelToTimestamp = (slotLabel: string): string => {
    const [time, modifier] = slotLabel.split(" "); // "3:30", "PM"
    const [hoursStr, minutesStr] = time.split(":");
    let hours = parseInt(hoursStr, 10);
    const minutes = parseInt(minutesStr, 10);

    if (modifier === "PM" && hours < 12) hours += 12;
    if (modifier === "AM" && hours === 12) hours = 0;

    const dt = new Date();
    dt.setHours(hours, minutes, 0, 0);
    return dt.toISOString();
  };

  // ---------------------------------------------------------
  // FETCH MENU + STOCK IKUT SLOT
  // ---------------------------------------------------------
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
      setError("Unable to load menu. Please refresh and try again.");
    } finally {
      setLoadingMenu(false);
    }
  }, []);

  useEffect(() => {
    fetchMenu();
  }, [fetchMenu]);

  // ---------------------------------------------------------
  // HELPERS: STOCK
  // ---------------------------------------------------------

  // Stock yang available untuk quantity picker (bergantung slot yang dipilih)
  const getAvailableForBread = (bread: SaltBread): number => {
    if (!isSlotLimited(bread.name)) {
      return bread.available_stock;
    }
    if (!pickupTime) return 0; // kena pilih slot dulu untuk roti yang limited
    const row = slotStocks.find(
      (s) => s.bread_id === bread.id && s.slot === pickupTime
    );
    return row?.available_stock ?? 0;
  };

  // Untuk LIVE VIEW: jumlah stock merentasi SEMUA slot (cth 7+7=14)
  const getCombinedSlotTotal = (breadName: string): number => {
    const bread = breads.find((b) => b.name === breadName);
    if (!bread) return 0;
    return slotStocks
      .filter((s) => s.bread_id === bread.id)
      .reduce((sum, s) => sum + s.available_stock, 0);
  };

  // ---------------------------------------------------------
  // QUANTITY CONTROLS
  // ---------------------------------------------------------
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

  // Bila customer tukar slot, reset quantity roti yang limited (sebab stock lain slot)
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

  // ---------------------------------------------------------
  // SUBMIT BOOKING
  // ---------------------------------------------------------
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

    // Simpan senarai item yang dah berjaya decrement, untuk rollback kalau ada kegagalan
    const succeeded: Array<{ id: number; name: string; quantity: number }> = [];

    try {
      // 1. Decrement stock SATU PERSATU secara atomic (RPC), sebelum insert booking.
      //    Ini elak dua customer "curi" unit terakhir yang sama serentak.
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
            `Maaf, stok "${item.name}" untuk slot ${pickupTime} tidak mencukupi. Sila kurangkan kuantiti atau pilih slot lain.`
          );
        }

        succeeded.push({ id: item.id, name: item.name, quantity: item.quantity });
      }

      // 2. Insert booking (hanya lepas semua stock berjaya di-decrement)
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

      // 3. WhatsApp notify
      const sendWhatsApp = (name: string, total: number, items: typeof itemsOrdered, slot: string) => {
        const waPhone = "60148564742"; // Ganti dengan nombor WhatsApp kau
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

      // 4. Reset form
      setQuantities({});
      setCustomerName("");
      setPhone("");
      setPickupTime("");
      window.scrollTo({ top: 0, behavior: 'smooth' });

      // 5. Segarkan stock terkini dari server
      await fetchMenu();
    } catch (err: any) {
      console.error("Booking failed:", err);
      setError(err.message || "Something went wrong. Please try again.");

      // ROLLBACK: kembalikan stock item yang sempat di-decrement sebelum kegagalan
      for (const item of succeeded) {
        if (isSlotLimited(item.name)) {
          await supabase.rpc('increment_slot_stock', {
            p_bread_id: item.id,
            p_slot: pickupTime,
            p_qty: item.quantity,
          });
        } else {
          await supabase
            .from('salt_breads')
            .select('available_stock')
            .eq('id', item.id)
            .single()
            .then(async ({ data }) => {
              if (data) {
                await supabase
                  .from('salt_breads')
                  .update({ available_stock: data.available_stock + item.quantity })
                  .eq('id', item.id);
              }
            });
        }
      }
      await fetchMenu();
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------
  return (
    <div className="min-h-screen bg-stone-900 py-12 px-4 sm:px-6 lg:px-8 flex flex-col items-center justify-start overflow-y-auto font-sans">
      <div className="max-w-xl w-full space-y-8 bg-[#faf8f5] rounded-3xl p-8 sm:p-10 shadow-2xl text-stone-800 border border-stone-200">

        {/* HEADER */}
        <div className="text-center space-y-3 pb-6 border-b border-stone-200">
          <h1 className="text-4xl sm:text-5xl font-serif text-stone-900 tracking-tight leading-none">
            Crafted Fresh, Worth the Wait.
          </h1>
          <p className="text-stone-500 text-sm sm:text-base font-normal max-w-md mx-auto pt-2">
            A premium viral salt bread (Shio Pan) baked fresh, with dynamic locking inventory to guarantee your batch.
          </p>
        </div>

        {/* PILIH SLOT DULU — kena pilih sebelum boleh tambah quantity roti limited */}
        <div className="pt-2">
          <label className="block text-[10px] font-bold tracking-widest text-stone-400 uppercase mb-2">
            Pilih Slot Pickup (Had 7 Original & 7 Choc setiap slot)
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
              * Sila pilih slot dahulu untuk melihat baki stok Original & Choc bagi slot tersebut.
            </p>
          )}
        </div>

        {/* LIVE COUNTER — JUMLAH GABUNGAN KEDUA-DUA SLOT (14 total) */}
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
            <div className="bg-stone-100 rounded-lg p-4 text-center border border-stone-200/60">
              <span className="block text-3xl font-serif text-stone-900">
                {getCombinedSlotTotal('Original Salt Bread')}
              </span>
              <span className="text-[10px] font-bold tracking-wider text-stone-400 uppercase block mt-1">
                Original
              </span>
            </div>

            <div className="bg-stone-100 rounded-lg p-4 text-center border border-stone-200/60">
              <span className="block text-3xl font-serif text-stone-900">
                {getCombinedSlotTotal('Chocolate Salt Bread')}
              </span>
              <span className="text-[10px] font-bold tracking-wider text-stone-400 uppercase block mt-1">
                Chocolate
              </span>
            </div>

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

        {/* MENU LIST */}
        <div className="space-y-6 pt-4">
          <div className="flex justify-between items-baseline border-b border-stone-200 pb-2">
            <h2 className="text-2xl font-serif text-stone-900">Select Your Bake Batch</h2>
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
                const limited = isSlotLimited(bread.name);
                const availableStock = getAvailableForBread(bread);
                const needsSlotFirst = limited && !pickupTime;
                const isSoldOut = !needsSlotFirst && availableStock <= 0;

                return (
                  <div key={bread.id} className={`space-y-3 pb-6 border-b border-stone-100 last:border-0 last:pb-0 transition-opacity duration-300 ${isSoldOut ? 'opacity-60' : 'opacity-100'}`}>

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
                      {bread.name === 'Chocolate Salt Bread' && 'Stuffed with Callebaut chocolate and finished with delicate fleur de sel. Sweet-savory perfection.'}
                      {!['Original Salt Bread', 'Chocolate Salt Bread'].includes(bread.name) && 'Freshly baked premium artisan salt bread roll.'}
                    </p>

                    {/* STATUS STOK */}
                    <div className="inline-block bg-stone-100 px-2 py-0.5 rounded text-[10px] font-semibold text-stone-500 uppercase tracking-wider border border-stone-200/40">
                      {needsSlotFirst
                        ? "Pilih slot dahulu"
                        : isSoldOut
                          ? "Sold Out"
                          : `${availableStock} Available${limited ? ` (slot ${pickupTime})` : ''}`}
                    </div>

                    {/* QUANTITY CONTROLS */}
                    <div className="flex justify-between items-center pt-2 border-t border-stone-100">
                      <span className="text-[10px] font-bold tracking-widest text-stone-400 uppercase">Quantity:</span>
                      <div className="flex items-center space-x-4">
                        <button
                          type="button"
                          onClick={() => updateQuantity(bread, -1)}
                          disabled={qty === 0 || isSoldOut || needsSlotFirst}
                          className="h-8 w-8 rounded-full border border-stone-300 flex items-center justify-center text-stone-600 hover:bg-stone-100 disabled:opacity-30 transition-all"
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
          <div className="space-y-1">
            <h2 className="text-2xl font-serif text-stone-900">Reserve Your Drop Batch</h2>
            <p className="text-stone-400 text-xs">Submit pickup credentials below to lock-in your fresh bread batch.</p>
          </div>

          <div className="bg-stone-100/60 rounded-xl p-5 border border-stone-200/60">
            <div className="flex justify-between items-center text-xs font-bold tracking-widest text-stone-400 uppercase border-b border-stone-200/80 pb-3 mb-4">
              <span>Selected Drop Items</span>
              <span className="bg-stone-200/80 text-stone-700 px-2.5 py-1 rounded-full text-[10px] font-bold">
                {totalItemsCount} {totalItemsCount === 1 ? 'Roll' : 'Rolls'}
              </span>
            </div>

            {totalItemsCount === 0 ? (
              <p className="text-xs text-stone-400 text-center py-4 font-normal">
                Your queue is currently empty. Pick a slot & adjust quantities above.
              </p>
            ) : (
              <div className="space-y-3 px-1">
                {Object.entries(quantities).map(([name, qty]) => {
                  if (qty === 0) return null;
                  const item = breads.find((b) => b.name === name);
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
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
              {error}
            </p>
          )}

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