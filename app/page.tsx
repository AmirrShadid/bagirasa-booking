'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

// Breads managed by time slots (Original, Chocolate, & Korean Cream Cheese)
const SLOT_LIMITED_BREADS = [
  'Original Salt Bread', 
  'Chocolate Salt Bread', 
  'Korean Cream Cheese'
];
const SLOTS = ['4:00 PM', '8:30 PM'];

interface SaltBread {
  id: number;
  name: string;
  price: number;
  available_stock: number;
  description?: string;
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
    if (modifier === "AM" === true && hours === 12) hours = 0;

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
        .order('id', { ascending: true });

      if (menuError) throw menuError;

      const { data: slotData, error: slotError } = await supabase
        .from('bread_slot_stock')
        .select('id, bread_id, slot, max_stock, available_stock');

      if (slotError) throw slotError;

      const descriptionsMap: Record<string, string> = {
        'Original Salt Bread': 'Classic French butter wrapped in soft dough, topped with flaky sea salt.',
        'Chocolate Salt Bread': 'Rich dark chocolate filling with a sweet and salty crust finish.',
        'Korean Cream Cheese': 'Stuffed with a rich, velvety cream cheese filling, featuring a crispy crust and a touch of pretzel salt.',
        'Garlic': 'Piping hot buttery garlic spread infused with herbs and melted cheese goodness.',
        'Crab Rangoon': 'Crispy cheesy crab filling wrapped in our signature salt bread.'
      };

      const enrichedBreads = (menuData || []).map((b: any) => ({
        ...b,
        description: descriptionsMap[String(b.name)] || 'Freshly baked artisan salt bread.'
      }));

      setBreads(enrichedBreads);
      setSlotStocks(slotData || []);
    } catch (err) {
      console.error("fetchMenu failed:", err);
      setError("Failed to load menu. Please check your Supabase connection.");
    } finally {
      setLoadingMenu(false);
    }
  }, []);

  useEffect(() => {
    fetchMenu();
  }, [fetchMenu]);

  const getAvailableForBread = (bread: SaltBread): number => {
    const breadName = String(bread.name);
    if (!isSlotLimited(breadName)) {
      return bread.available_stock;
    }
    if (!pickupTime) return 0; 
    
    // Pembersihan ruang kosong (trim) semasa membandingkan slot supaya padan dengan database
    const row = slotStocks.find(
      (s) => s.bread_id === bread.id && s.slot.trim() === pickupTime.trim()
    );
    return row?.available_stock ?? 0;
  };

  const getCombinedSlotTotal = (breadName: string): number => {
    const bread = breads.find((b) => String(b.name) === breadName);
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
    const breadName = String(bread.name);
    setQuantities((prev) => {
      const current = prev[breadName] || 0;
      const next = current + delta;
      if (next < 0) return prev;
      if (next > maxStock) return prev;
      return { ...prev, [breadName]: next };
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
      const item = breads.find((b) => String(b.name) === name);
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
        const item = breads.find((b) => String(b.name) === name)!;
        return { id: item.id, name: String(item.name), quantity: qty, price: item.price };
      });

    const succeeded: Array<{ id: number; name: string; quantity: number }> = [];

    try {
      for (const item of itemsOrdered) {
        let ok = false;

        if (isSlotLimited(item.name)) {
          const { data, error: rpcError } = await supabase.rpc('decrement_slot_stock', {
            p_bread_id: item.id,
            p_slot: pickupTime.trim(),
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
            `Sorry, stock for "${item.name}" at slot ${pickupTime} is sold out. Please reduce quantity or choose another slot.`
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
          `*NEW BAGIRASA ORDER*%0A%0A` +
          `Name: ${name}%0ASlot: ${slot} (Thursday, 23 July 2026)%0A%0A` +
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
      setError(err.message || "Something went wrong. Please try again.");

      for (const item of succeeded) {
        if (isSlotLimited(item.name)) {
          await supabase.rpc('decrement_slot_stock', {
            p_bread_id: item.id,
            p_slot: pickupTime.trim(),
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
      <div className="max-w-xl w-full space-y-8 bg-[#faf8f5] rounded-3xl p-6 sm:p-10 shadow-2xl text-stone-800 border border-stone-200">

        {/* HERO IMAGE */}
        <div className="relative w-full h-52 sm:h-60 rounded-2xl overflow-hidden shadow-md bg-stone-200">
          <img
            src="/images/salt-bread-hero.jpeg"
            alt="Bagirasa Salt Bread"
            className="w-full h-full object-cover brightness-95"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent flex flex-col justify-end p-6 text-white">
            <span className="text-[10px] font-bold tracking-widest uppercase text-amber-200">Craft Fresh • Daily Batch</span>
            <h1 className="text-3xl sm:text-4xl font-serif tracking-tight">Bagirasa Salt Bread</h1>
          </div>
        </div>

        {/* HEADER & SUB TEXT */}
        <div className="text-center space-y-2 pb-2">
          <p className="text-stone-500 text-xs sm:text-sm font-normal max-w-md mx-auto">
            Crispy outside, fluffy inside with melted butter. Freshly baked for your pickup on <strong>Thursday, 23 July 2026</strong>.
          </p>
        </div>

        {/* PICKUP SLOT SELECTION */}
        <div className="pt-2 bg-stone-100/70 p-4 rounded-2xl border border-stone-200/60">
          <label className="block text-[11px] font-bold tracking-widest text-stone-700 uppercase mb-2 text-center">
            Select Pickup Slot (Thursday, 23 July 2026)
          </label>
          <div className="grid grid-cols-2 gap-3">
            {SLOTS.map((time: string) => (
              <button
                key={time}
                type="button"
                onClick={() => handlePickupTimeChange(time)}
                className={`py-3 rounded-xl text-sm font-bold border transition-all ${
                  pickupTime === time
                    ? 'bg-stone-900 text-white border-stone-900 shadow-sm'
                    : 'bg-white border-stone-200 text-stone-700 hover:border-stone-400'
                }`}
              >
                {time}
              </button>
            ))}
          </div>
          {!pickupTime && (
            <p className="text-[11px] text-amber-700 font-medium mt-2 text-center">
              * Please select a pickup slot above first to unlock menu items & stock availability.
            </p>
          )}
        </div>

        {/* LIVE COUNTER */}
        <div className="py-1">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-xs font-bold tracking-widest text-stone-400 uppercase">
              Live Stock Status
            </h3>
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            {breads.map((bread) => {
              const nameStr = String(bread.name);
              let displayName = nameStr;
              let isTwoLine = false;

              if (nameStr === 'Original Salt Bread') {
                displayName = 'ORIGINAL';
              } else if (nameStr === 'Chocolate Salt Bread') {
                displayName = 'CHOCOLATE';
              } else if (nameStr === 'Korean Cream Cheese') {
                displayName = 'KOREAN CREAM\nCHEESE';
                isTwoLine = true;
              }

              return (
                <div key={bread.id} className="bg-stone-100 rounded-xl p-3.5 text-center border border-stone-200/60 shadow-xs w-[calc(33.333%-0.5rem)] min-w-[130px]">
                  <span className="block text-2xl font-serif text-stone-900">{getCombinedSlotTotal(nameStr)}</span>
                  <span className={`text-[11px] font-bold text-stone-600 uppercase block mt-1 tracking-wide ${isTwoLine ? 'whitespace-pre-line leading-tight' : 'truncate'}`}>
                    {displayName}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* MENU LIST */}
        <div className="space-y-6 pt-4">
          <h3 className="text-2xl font-serif text-stone-900 border-b border-stone-200 pb-2">Which one's hitting the spot today?</h3>

          {loadingMenu ? (
            <p className="text-center py-6 text-stone-400">Loading menu...</p>
          ) : breads.length === 0 ? (
            <p className="text-center py-8 text-stone-400">No menu found in database.</p>
          ) : (
            <div className="space-y-6">
              {breads.map((bread) => {
                const breadName = String(bread.name);
                const qty = quantities[breadName] || 0;
                const limited = isSlotLimited(breadName);
                const availableStock = getAvailableForBread(bread);
                const needsSlotFirst = limited && !pickupTime;
                const isSoldOut = !needsSlotFirst && availableStock <= 0;

                return (
                  <div key={bread.id} className={`space-y-2 pb-6 border-b border-stone-100 last:border-0 transition-opacity ${isSoldOut ? 'opacity-50' : 'opacity-100'}`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="text-lg font-serif text-stone-900">{breadName}</h4>
                        <p className="text-xs text-stone-500 max-w-xs mt-0.5">{bread.description}</p>
                      </div>
                      <span className="text-lg font-serif text-stone-900 whitespace-nowrap ml-4">RM {bread.price.toFixed(2)}</span>
                    </div>

                    <div className="inline-block bg-stone-100 px-2 py-0.5 rounded text-[10px] font-semibold text-stone-500 uppercase tracking-wider border border-stone-200/40">
                      {needsSlotFirst
                        ? "Select slot first"
                        : isSoldOut
                        ? "Sold Out"
                        : `${availableStock} Units Available${limited ? ` (${pickupTime})` : ''}`}
                    </div>

                    <div className="flex justify-between items-center pt-2">
                      <span className="text-[10px] font-bold tracking-widest text-stone-400 uppercase">Quantity:</span>
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
          <h3 className="text-2xl font-serif text-stone-900">Order Confirmation</h3>

          <div className="bg-stone-100/60 rounded-xl p-5 border border-stone-200/60">
            <div className="flex justify-between items-center text-xs font-bold tracking-widest text-stone-400 uppercase border-b border-stone-200/80 pb-3 mb-4">
              <span>Selected Items</span>
              <span className="bg-stone-200 text-stone-700 px-2.5 py-1 rounded-full text-[10px] font-bold">
                {totalItemsCount} Units
              </span>
            </div>

            {totalItemsCount === 0 ? (
              <p className="text-xs text-stone-400 text-center py-4">Please select a pickup slot and quantities above.</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(quantities).map(([name, qty]) => {
                  if (qty === 0) return null;
                  const item = breads.find((b) => String(b.name) === name);
                  if (!item) return null;
                  return (
                    <div key={item.id} className="flex justify-between text-base font-serif text-stone-900">
                      <span>{String(item.name)}</span>
                      <span>{qty}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold tracking-widest text-stone-400 uppercase mb-1">Full Name</label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g: Ahmad Albab"
                className="w-full bg-transparent border-b border-stone-300 py-2 text-stone-900 focus:outline-none focus:border-stone-900 text-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold tracking-widest text-stone-400 uppercase mb-1">Phone Number (Wwhatsapp)</label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g: 0123456789"
                className="w-full bg-transparent border-b border-stone-300 py-2 text-stone-900 focus:outline-none focus:border-stone-900 text-sm"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>
          )}

          <div className="pt-4 border-t border-stone-200 flex justify-between items-center">
            <div>
              <span className="block text-[10px] font-bold tracking-widest text-stone-400 uppercase">Total Price</span>
              <span className="block text-3xl font-serif text-stone-900">RM {calculateTotal().toFixed(2)}</span>
            </div>
            <button
              type="submit"
              disabled={submitting || totalItemsCount === 0 || !customerName || !phone || !pickupTime}
              className="bg-stone-900 hover:bg-stone-800 text-white px-6 py-3.5 rounded-xl text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 shadow-md"
            >
              {submitting ? "Processing..." : "Submit & WhatsApp"}
            </button>
          </div>
        </form>

      </div>

      {confirmedBooking && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#faf8f5] rounded-3xl p-8 max-w-md w-full shadow-2xl border border-stone-200 text-stone-800 space-y-6">
            <div className="text-center space-y-2">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-stone-950 text-white text-2xl font-serif mb-2">✓</div>
              <h3 className="text-3xl font-serif text-stone-900">Booking Successful!</h3>
              <p className="text-xs text-stone-400">Please check your WhatsApp window that has automatically opened to confirm your order with the us.</p>
            </div>
            <button
              onClick={() => setConfirmedBooking(null)}
              className="w-full bg-stone-900 hover:bg-stone-800 text-white py-3 rounded-xl text-xs font-bold tracking-widest uppercase"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}