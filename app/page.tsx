"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  supabase,
  type BookingItem,
  type ConfirmedBooking,
  type SaltBread,
} from "@/lib/supabase";

const SHOP_WHATSAPP = "60123456789";

const PICKUP_TIMES = [
  "10:00 AM",
  "11:00 AM",
  "12:00 PM",
  "1:00 PM",
  "2:00 PM",
  "3:00 PM",
  "4:00 PM",
  "5:00 PM",
  "6:00 PM",
  "7:00 PM",
  "8:00 PM",
];

function formatPrice(amount: number) {
  return `RM ${amount.toFixed(2)}`;
}

function buildWhatsAppReceipt(booking: ConfirmedBooking) {
  const lines = [
    "Bagirasa — Booking Receipt",
    "",
    `Name: ${booking.customerName}`,
    `WhatsApp: +60${booking.phone}`,
    `Pickup: ${booking.pickupTime}`,
    "",
    "Order:",
    ...booking.items.map(
      (item) =>
        `- ${item.name} x${item.quantity} — ${formatPrice(item.price * item.quantity)}`,
    ),
    "",
    `Total: ${formatPrice(booking.total)}`,
    "",
    "Thank you for your order!",
  ];

  return lines.join("\n");
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
  const [confirmedBooking, setConfirmedBooking] =
    useState<ConfirmedBooking | null>(null);

  const fetchMenu = useCallback(async () => {
    setLoadingMenu(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from("salt_breads")
      .select("id, name, price, stock")
      .order("name");

    if (fetchError) {
      setError("Unable to load menu. Please refresh and try again.");
      setBreads([]);
    } else {
      setBreads(data ?? []);
    }

    setLoadingMenu(false);
  }, []);

  useEffect(() => {
    fetchMenu();
  }, [fetchMenu]);

  const cartItems = useMemo(() => {
    return breads
      .filter((bread) => (quantities[bread.id] ?? 0) > 0)
      .map((bread) => ({
        bread_id: bread.id,
        name: bread.name,
        quantity: quantities[bread.id],
        price: bread.price,
      }));
  }, [breads, quantities]);

  const total = useMemo(
    () =>
      cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cartItems],
  );

  const hasItems = cartItems.length > 0;

  function adjustQuantity(bread: SaltBread, delta: number) {
    if (bread.stock === 0 && delta > 0) return;

    setQuantities((prev) => {
      const current = prev[bread.id] ?? 0;
      const next = Math.max(0, Math.min(bread.stock, current + delta));
      return { ...prev, [bread.id]: next };
    });
  }

  async function handleConfirmBooking() {
    setError(null);

    if (!customerName.trim()) {
      setError("Please enter your name.");
      return;
    }

    if (!phone.trim() || phone.trim().length < 8) {
      setError("Please enter a valid WhatsApp number.");
      return;
    }

    if (!pickupTime) {
      setError("Please select a pickup time.");
      return;
    }

    if (!hasItems) {
      setError("Please add at least one item to your order.");
      return;
    }

    setSubmitting(true);

    try {
      const selectedIds = cartItems.map((item) => item.bread_id);
      const { data: freshBreads, error: stockError } = await supabase
        .from("salt_breads")
        .select("id, name, price, stock")
        .in("id", selectedIds);

      if (stockError || !freshBreads) {
        throw new Error("Unable to verify stock. Please try again.");
      }

      const stockMap = new Map(freshBreads.map((bread) => [bread.id, bread]));

      for (const item of cartItems) {
        const fresh = stockMap.get(item.bread_id);
        if (!fresh || fresh.stock < item.quantity) {
          throw new Error(
            `${item.name} no longer has enough stock. Please adjust your order.`,
          );
        }
      }

      for (const item of cartItems) {
        const fresh = stockMap.get(item.bread_id)!;
        const newStock = fresh.stock - item.quantity;

        const { error: updateError } = await supabase
          .from("salt_breads")
          .update({ stock: newStock })
          .eq("id", item.bread_id);

        if (updateError) {
          throw new Error("Failed to update stock. Please try again.");
        }
      }

      const bookingPayload = {
        customer_name: customerName.trim(),
        whatsapp_phone: `+60${phone.trim()}`,
        pickup_time: pickupTime,
        items: cartItems satisfies BookingItem[],
        total_amount: total,
      };

      const { error: insertError } = await supabase
        .from("bookings")
        .insert(bookingPayload);

      if (insertError) {
        throw new Error("Failed to save booking. Please try again.");
      }

      setConfirmedBooking({
        customerName: customerName.trim(),
        phone: phone.trim(),
        pickupTime,
        items: cartItems,
        total,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      await fetchMenu();
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmedBooking) {
    const whatsappUrl = `https://wa.me/${SHOP_WHATSAPP}?text=${encodeURIComponent(buildWhatsAppReceipt(confirmedBooking))}`;

    return (
      <main className="min-h-full bg-[#f7f4ef] px-4 py-10 sm:px-6">
        <div className="mx-auto w-full max-w-lg">
          <div className="rounded-3xl border border-stone-200/80 bg-white p-8 shadow-sm">
            <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
              <svg
                className="h-8 w-8 text-emerald-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>

            <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
              Booking Confirmed
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-stone-500">
              Your order is reserved. Pick up at your selected time.
            </p>

            <div className="mt-8 space-y-4 rounded-2xl bg-stone-50 p-5">
              <div className="flex justify-between text-sm">
                <span className="text-stone-500">Name</span>
                <span className="font-medium text-stone-900">
                  {confirmedBooking.customerName}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-stone-500">WhatsApp</span>
                <span className="font-medium text-stone-900">
                  +60{confirmedBooking.phone}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-stone-500">Pickup</span>
                <span className="font-medium text-stone-900">
                  {confirmedBooking.pickupTime}
                </span>
              </div>

              <div className="border-t border-stone-200 pt-4">
                <p className="mb-3 text-xs font-medium uppercase tracking-widest text-stone-400">
                  Order Summary
                </p>
                <ul className="space-y-2">
                  {confirmedBooking.items.map((item) => (
                    <li
                      key={item.bread_id}
                      className="flex justify-between text-sm"
                    >
                      <span className="text-stone-700">
                        {item.name}{" "}
                        <span className="text-stone-400">x{item.quantity}</span>
                      </span>
                      <span className="font-medium text-stone-900">
                        {formatPrice(item.price * item.quantity)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex justify-between border-t border-stone-200 pt-4">
                <span className="font-semibold text-stone-900">Total</span>
                <span className="font-semibold text-stone-900">
                  {formatPrice(confirmedBooking.total)}
                </span>
              </div>
            </div>

            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-6 py-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden
              >
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              Share Receipt to WhatsApp
            </a>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-full bg-[#f7f4ef] px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-lg">
        <header className="mb-10 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-stone-400">
            Salt Bread
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-stone-900">
            Bagirasa
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-stone-500">
            Reserve your favourites for pickup. Fresh batches, limited daily
            stock.
          </p>
        </header>

        <section className="mb-8">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-stone-400">
            Today&apos;s Menu
          </h2>

          {loadingMenu ? (
            <div className="space-y-3">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="h-24 animate-pulse rounded-2xl bg-white/70"
                />
              ))}
            </div>
          ) : breads.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 p-8 text-center text-sm text-stone-500">
              No items available right now.
            </div>
          ) : (
            <ul className="space-y-3">
              {breads.map((bread) => {
                const qty = quantities[bread.id] ?? 0;
                const soldOut = bread.stock === 0;

                return (
                  <li
                    key={bread.id}
                    className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-stone-900">
                            {bread.name}
                          </h3>
                          {soldOut && (
                            <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-500">
                              Sold Out
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm font-medium text-stone-700">
                          {formatPrice(bread.price)}
                        </p>
                        <p className="mt-0.5 text-xs text-stone-400">
                          {soldOut
                            ? "Restocking soon"
                            : `${bread.stock} left in stock`}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => adjustQuantity(bread, -1)}
                          disabled={qty === 0}
                          aria-label={`Decrease ${bread.name} quantity`}
                          className="flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 text-stone-600 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          −
                        </button>
                        <span className="w-6 text-center text-sm font-semibold text-stone-900">
                          {qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => adjustQuantity(bread, 1)}
                          disabled={soldOut || qty >= bread.stock}
                          aria-label={`Increase ${bread.name} quantity`}
                          className="flex h-9 w-9 items-center justify-center rounded-full border border-stone-900 bg-stone-900 text-white transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-stone-100 disabled:text-stone-300"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="mb-8 rounded-2xl border border-stone-200/80 bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-sm font-semibold uppercase tracking-widest text-stone-400">
            Your Details
          </h2>

          <div className="space-y-4">
            <div>
              <label
                htmlFor="customer-name"
                className="mb-1.5 block text-sm font-medium text-stone-700"
              >
                Customer Name
              </label>
              <input
                id="customer-name"
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Your full name"
                className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-900 outline-none transition-colors placeholder:text-stone-400 focus:border-stone-400 focus:bg-white"
              />
            </div>

            <div>
              <label
                htmlFor="whatsapp-phone"
                className="mb-1.5 block text-sm font-medium text-stone-700"
              >
                WhatsApp Phone Number
              </label>
              <div className="flex overflow-hidden rounded-xl border border-stone-200 bg-stone-50 focus-within:border-stone-400 focus-within:bg-white">
                <span className="flex items-center border-r border-stone-200 px-4 text-sm font-medium text-stone-500">
                  +60
                </span>
                <input
                  id="whatsapp-phone"
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) =>
                    setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))
                  }
                  placeholder="12 345 6789"
                  className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm text-stone-900 outline-none placeholder:text-stone-400"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="pickup-time"
                className="mb-1.5 block text-sm font-medium text-stone-700"
              >
                Pickup Time
              </label>
              <select
                id="pickup-time"
                value={pickupTime}
                onChange={(e) => setPickupTime(e.target.value)}
                className="w-full appearance-none rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-900 outline-none transition-colors focus:border-stone-400 focus:bg-white"
              >
                <option value="">Select a time</option>
                {PICKUP_TIMES.map((time) => (
                  <option key={time} value={time}>
                    {time}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {hasItems && (
          <section className="mb-6 rounded-2xl border border-stone-200/80 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-stone-400">
              Order Summary
            </h2>
            <ul className="space-y-2">
              {cartItems.map((item) => (
                <li
                  key={item.bread_id}
                  className="flex justify-between text-sm"
                >
                  <span className="text-stone-600">
                    {item.name}{" "}
                    <span className="text-stone-400">x{item.quantity}</span>
                  </span>
                  <span className="font-medium text-stone-900">
                    {formatPrice(item.price * item.quantity)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-between border-t border-stone-100 pt-4">
              <span className="font-semibold text-stone-900">Total</span>
              <span className="font-semibold text-stone-900">
                {formatPrice(total)}
              </span>
            </div>
          </section>
        )}

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleConfirmBooking}
          disabled={submitting || loadingMenu || !hasItems}
          className="w-full rounded-2xl bg-stone-900 px-6 py-4 text-sm font-semibold text-white transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        >
          {submitting ? "Confirming..." : "Confirm Booking"}
        </button>
      </div>
    </main>
  );
}
