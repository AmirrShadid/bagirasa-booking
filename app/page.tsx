'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

// ... (interface tetap sama)

export default function BookingPage() {
  const [breads, setBreads] = useState<SaltBread[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [pickupTime, setPickupTime] = useState(""); // Contoh: "3:30 PM"
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState<ConfirmedBooking | null>(null);

  // Fungsi untuk hantar WhatsApp
  const sendWhatsApp = (name: string, total: number, items: any[], slot: string) => {
    const phoneNumber = "60148564742"; // Tukar kepada no telefon kau
    const itemsList = items.map(i => `${i.quantity}x ${i.name}`).join('%0A');
    const message = `*TEMPAHAN BARU BAGIRASA*%0A%0A` +
                    `Nama: ${name}%0A` +
                    `Slot Masa: ${slot}%0A%0A` +
                    `Order:%0A${itemsList}%0A%0A` +
                    `Total: RM${total.toFixed(2)}%0A` +
                    `Sila hantar bukti pembayaran ke QR DuitNow ini ya. Terima kasih!`;
    window.open(`https://wa.me/${phoneNumber}?text=${message}`, '_blank');
  };

  // ... (fetchMenu tetap sama)

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName || !phone || !pickupTime || calculateTotal() === 0) return;

    setSubmitting(true);
    
    const itemsOrdered = Object.entries(quantities)
      .filter(([_, qty]) => qty > 0)
      .map(([name, qty]) => {
        const item = breads.find(b => b.name === name)!;
        return { id: item.id, name: item.name, quantity: qty, price: item.price };
      });

    try {
      // Masukkan ke Supabase
      const { data: bookingData, error: bookingError } = await supabase
        .from('bookings')
        .insert({
          customer_name: customerName,
          phone: phone,
          pickup_time: pickupTime, // Simpan slot masa
          total_price: calculateTotal(),
          items: itemsOrdered,
          status: 'pending'
        })
        .select()
        .single();

      if (bookingError) throw bookingError;

      // Hantar WhatsApp
      sendWhatsApp(customerName, calculateTotal(), itemsOrdered, pickupTime);

      setConfirmedBooking({
        id: bookingData.id,
        customer_name: customerName,
        phone: phone,
        pickup_time: pickupTime,
        items: itemsOrdered,
        total_price: calculateTotal()
      });

      // Reset Form
      setQuantities({});
      setCustomerName("");
      setPhone("");
      setPickupTime("");
    } catch (err: any) {
      alert("Gagal menempah: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-900 py-12 px-4 font-sans">
      <div className="max-w-xl w-full mx-auto bg-[#faf8f5] rounded-3xl p-8 shadow-2xl">
        
        {/* Slot Selection Buttons */}
        <div className="mb-8">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-3">
            Pilih Slot (Limit 7 Original & 7 Choc setiap slot)
          </label>
          <div className="grid grid-cols-2 gap-3">
            {["3:30 PM", "8:30 PM"].map((time) => (
              <button
                key={time}
                type="button"
                onClick={() => setPickupTime(time)}
                className={`py-3 rounded-xl text-sm font-bold border ${
                  pickupTime === time 
                  ? 'bg-stone-900 text-white' 
                  : 'bg-white border-stone-200 text-stone-600'
                }`}
              >
                {time}
              </button>
            ))}
          </div>
        </div>

        {/* ... (Baki form & kod asal kau letak bawah sini) ... */}
        
        {/* Pastikan Butang Submit panggil handleBooking */}
        <button 
          onClick={handleBooking}
          disabled={submitting || !pickupTime}
          className="w-full bg-stone-900 text-white py-4 rounded-xl font-bold uppercase"
        >
          {submitting ? "Processing..." : "Confirm & Pay via WhatsApp"}
        </button>

      </div>
    </div>
  );
}