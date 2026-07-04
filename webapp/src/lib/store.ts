import { useSyncExternalStore } from "react";

/**
 * Persistent app state (localStorage) — the phone owns its data:
 * profile, addresses, booking history, promo usage, preferences.
 * Survives restarts; works logged-in or guest.
 */

export type Address = { name: string; label: string; lat: number; lng: number };

export type BookingStatus = "confirmed" | "enroute" | "washing" | "done" | "cancelled";
export type BookingRec = {
  key: string; // local key (creation timestamp)
  id: string | null; // supabase row id once the insert lands
  washerId: string;
  washerName: string;
  initials: string;
  color: string;
  service: string;
  price: number;
  fee: number;
  total: number;
  promo: string | null;
  date: string; // iso yyyy-mm-dd
  slot: string;
  address: string;
  lat: number | null;
  lng: number | null;
  status: BookingStatus;
  createdAt: string;
};

export type NotifPrefs = { track: boolean; promo: boolean; reminders: boolean };
export type Profile = { name: string; phone: string; email: string; city: string };

type StoreData = {
  profile: Profile;
  addresses: Address[];
  history: BookingRec[];
  activeKey: string | null;
  promoUsed: boolean;
  notif: NotifPrefs;
};

const KEY = "akw_store_v1";
const DEF: StoreData = {
  profile: { name: "", phone: "", email: "", city: "Casablanca" },
  addresses: [],
  history: [],
  activeKey: null,
  promoUsed: false,
  notif: { track: true, promo: true, reminders: true },
};

function load(): StoreData {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEF, ...JSON.parse(raw) } : { ...DEF };
  } catch {
    return { ...DEF };
  }
}

let data: StoreData = load();
const subs = new Set<() => void>();
function emit() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage full/blocked — state still lives in memory */
  }
  subs.forEach((f) => f());
}

export function getStore(): StoreData {
  return data;
}
export function setStore(patch: Partial<StoreData>) {
  data = { ...data, ...patch };
  emit();
}
export function useStore(): StoreData {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => data
  );
}

/* ── booking helpers ── */
export function addBooking(b: BookingRec) {
  setStore({
    history: [b, ...data.history],
    activeKey: b.key,
    promoUsed: data.promoUsed || Boolean(b.promo),
  });
}
export function updateBooking(key: string, patch: Partial<BookingRec>) {
  setStore({ history: data.history.map((h) => (h.key === key ? { ...h, ...patch } : h)) });
}
export function getActiveBooking(d: StoreData = data): BookingRec | null {
  const b = d.history.find((h) => h.key === d.activeKey);
  return b && b.status !== "done" && b.status !== "cancelled" ? b : null;
}
export function initialsOf(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "IN"
  );
}
