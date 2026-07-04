import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Washer, Service } from "../lib/types";
import { supabase } from "../lib/supabase";
import {
  useStore, setStore, addBooking, updateBooking, getActiveBooking, initialsOf,
  type BookingRec, type Address, type Profile,
} from "../lib/store";
import { useSession, signIn, signUp, signOut } from "../lib/auth";
import { MobileMap, type MapWasher } from "./MobileMap";
import { MobileTrackMap } from "./MobileTrackMap";
import { LocationPicker, type PickedPos } from "./LocationPicker";

/* ============================================================
   Autokhidma WASH — mobile app (fully functional, standalone).
   Guest-first: home opens directly, login is optional (real
   Supabase email auth). Bookings, offers and live tracking all
   flow through Supabase; profile/addresses/history persist on
   the device. No dead buttons.
   ============================================================ */

type Screen =
  | "splash" | "home" | "map" | "market" | "booking"
  | "confirm" | "tracking" | "account" | "pro" | "login"
  | "request" | "offers";

type WasherLite = Pick<
  Washer,
  "id" | "initials" | "color" | "name" | "rating" | "reviews_count" | "zone" |
  "eta_minutes" | "distance_km" | "base_price" | "available_now" | "bio" | "is_super"
> & { lat: number | null; lng: number | null; phone?: string | null };

const DEMO_WASHERS: WasherLite[] = [
  { id: "d1", initials: "YB", color: "#1A4ED8", name: "Youssef B.", rating: 4.9, reviews_count: 214, zone: "Maârif", eta_minutes: 8, distance_km: 1.2, base_price: 60, available_now: true, bio: "Lavage soigné, finitions premium. 3 ans d'expérience.", is_super: true, lat: 33.589, lng: -7.633 },
  { id: "d2", initials: "SR", color: "#06B6A6", name: "Salma R.", rating: 4.8, reviews_count: 156, zone: "Gauthier", eta_minutes: 12, distance_km: 2.1, base_price: 80, available_now: true, bio: "Spécialiste intérieur + cire. Produits écologiques.", is_super: false, lat: 33.594, lng: -7.631 },
  { id: "d3", initials: "KT", color: "#7C3AED", name: "Karim T.", rating: 5.0, reviews_count: 98, zone: "Bourgogne", eta_minutes: 15, distance_km: 3.0, base_price: 100, available_now: false, bio: "Detailing complet, voitures de luxe.", is_super: true, lat: 33.585, lng: -7.640 },
  { id: "d4", initials: "IF", color: "#E2A93A", name: "Imane F.", rating: 4.7, reviews_count: 73, zone: "Ain Diab", eta_minutes: 10, distance_km: 1.8, base_price: 70, available_now: true, bio: "Rapide et efficace, idéal avant le boulot.", is_super: false, lat: 33.606, lng: -7.665 },
  { id: "d5", initials: "MA", color: "#0B7A6D", name: "Mehdi A.", rating: 4.9, reviews_count: 187, zone: "CIL", eta_minutes: 18, distance_km: 3.6, base_price: 90, available_now: true, bio: "Lustrage et protection céramique disponibles.", is_super: false, lat: 33.578, lng: -7.645 },
];

type Formule = { id: string; name: string; desc: string; price: number; icon: string; bg: string };
const DEMO_FORMULES: Formule[] = [
  { id: "express", name: "Express", desc: "Extérieur rapide · 30 min", price: 60, icon: "⚡", bg: "#FDF1DC" },
  { id: "standard", name: "Standard", desc: "Le plus choisi · 1h", price: 100, icon: "💧", bg: "#E8EEFF" },
  { id: "premium", name: "Premium", desc: "Intérieur + cire · 2h", price: 220, icon: "🛡️", bg: "#F1EBFB" },
];

const SLOTS = ["09:00", "10:30", "12:00", "14:30", "16:00", "18:00"];
const DOW = ["DIM", "LUN", "MAR", "MER", "JEU", "VEN", "SAM"];
const SERVICE_FEE = 8;
const DEFAULT_DEST: [number, number] = [33.5889, -7.6331];
const SUPPORT_EMAIL = "elmoussaifmail@gmail.com";

const isDemoId = (id: string) => /^d\d$/.test(id);

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const la1 = (a[0] * Math.PI) / 180;
  const la2 = (b[0] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(la1) * Math.cos(la2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Screen depth → direction of the slide transition (Glovo-like).
const DEPTH: Record<Screen, number> = {
  splash: 0, home: 1, market: 1, account: 1, tracking: 1,
  map: 2, request: 2, pro: 2, login: 2, booking: 3, offers: 3, confirm: 4,
};

export function WashMobile({ washers, services }: { washers: Washer[]; services: Service[] }) {
  const [screen, setScreen] = useState<Screen>("splash");
  const store = useStore();
  const session = useSession();
  const active = getActiveBooking(store);

  const go = (next: Screen) => {
    setScreen((cur) => {
      const d = (DEPTH[next] ?? 1) - (DEPTH[cur] ?? 1);
      document.body.classList.toggle("nav-back", d < 0);
      document.body.classList.toggle("nav-fade", d === 0);
      return next;
    });
  };

  const list: WasherLite[] = washers.length ? (washers as unknown as WasherLite[]) : DEMO_WASHERS;
  const formules: Formule[] = services.length
    ? services.map((s) => ({ id: s.id, name: s.name, desc: s.description || s.duration, price: s.price, icon: s.id === "express" ? "⚡" : s.id === "premium" ? "🛡️" : "💧", bg: s.id === "express" ? "#FDF1DC" : s.id === "premium" ? "#F1EBFB" : "#E8EEFF" }))
    : DEMO_FORMULES;

  // booking selections
  const [sel, setSel] = useState<WasherLite | null>(null);
  const [formuleId, setFormuleId] = useState(formules[1]?.id ?? formules[0]?.id);
  const [dateIdx, setDateIdx] = useState(0);
  const [slot, setSlot] = useState(SLOTS[2]);
  const [clientPos, setClientPos] = useState<PickedPos | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // inDrive-style request: client proposes a price, washers bid back
  const [proposedPrice, setProposedPrice] = useState<number>(0);
  const [requestId, setRequestId] = useState<string | null>(null);

  const dates = useMemo(() => {
    const out: { dow: string; day: number; iso: string }[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      out.push({ dow: i === 0 ? "AUJ" : DOW[d.getDay()], day: d.getDate(), iso: d.toISOString().slice(0, 10) });
    }
    return out;
  }, []);

  const formule = formules.find((f) => f.id === formuleId) ?? formules[0];
  const promoOn = !store.promoUsed; // AUTO20: −20% on the first booking, applied automatically
  const basePrice = formule?.price ?? 0;
  const price = promoOn ? Math.round(basePrice * 0.8) : basePrice;
  const total = price + SERVICE_FEE;

  useEffect(() => {
    if (screen !== "splash") return;
    const t = setTimeout(() => setScreen("home"), 1900);
    return () => clearTimeout(t);
  }, [screen]);

  const openBooking = (w: WasherLite) => { setSel(w); go("booking"); };

  /* ── live tracking: poll the booked washer's real position ── */
  const [livePos, setLivePos] = useState<[number, number] | null>(null);
  const [liveEta, setLiveEta] = useState<number | null>(null);
  const [liveKm, setLiveKm] = useState<number | null>(null);
  const [washerPhone, setWasherPhone] = useState<string | null>(null);
  useEffect(() => {
    if (screen !== "tracking" || !active || isDemoId(active.washerId)) {
      setLivePos(null); setLiveEta(null); setLiveKm(null);
      return;
    }
    const dest: [number, number] = active.lat != null && active.lng != null ? [active.lat, active.lng] : DEFAULT_DEST;
    let stop = false;
    const tick = async () => {
      const { data } = await supabase.from("washers").select("lat,lng,phone").eq("id", active.washerId).single();
      if (stop || !data) return;
      if (data.phone) setWasherPhone(String(data.phone));
      if (data.lat != null && data.lng != null) {
        const pos: [number, number] = [data.lat, data.lng];
        setLivePos(pos);
        const km = haversineKm(pos, dest);
        setLiveKm(km);
        setLiveEta(Math.max(1, Math.round((km / 18) * 60))); // ~18 km/h city driving
        if (km < 0.06 && active.status === "confirmed") {
          updateBooking(active.key, { status: "washing" }); // he arrived → wash starts
        }
      }
    };
    tick();
    const iv = setInterval(tick, 2500);
    return () => { stop = true; clearInterval(iv); };
  }, [screen, active?.key, active?.washerId, active?.status, active?.lat, active?.lng]);

  /* ── booking: optimistic local record + real Supabase insert ── */
  function confirmBooking() {
    if (!sel) return;
    const rec: BookingRec = {
      key: String(Date.now()), id: null,
      washerId: sel.id, washerName: sel.name, initials: sel.initials, color: sel.color,
      service: formule?.name ?? "", price, fee: SERVICE_FEE, total,
      promo: promoOn ? "AUTO20" : null,
      date: dates[dateIdx]?.iso ?? "", slot,
      address: clientPos?.label ?? "Casablanca (position à préciser)",
      lat: clientPos?.lat ?? null, lng: clientPos?.lng ?? null,
      status: "confirmed", createdAt: new Date().toISOString(),
    };
    addBooking(rec);
    if (!isDemoId(sel.id)) {
      supabase
        .from("bookings")
        .insert({
          user_id: session?.user.id ?? null,
          washer_id: sel.id, service_id: formuleId,
          address: rec.address, lat: rec.lat, lng: rec.lng,
          scheduled_date: rec.date, scheduled_time: slot,
          price, service_fee: SERVICE_FEE, total,
          status: "confirmed", notes: promoOn ? "PROMO AUTO20 −20%" : null,
        })
        .select("id").single()
        .then(({ data }) => { if (data?.id) updateBooking(rec.key, { id: data.id }); });
    }
    go("confirm");
  }

  /* ── inDrive request: navigate instantly, capture the request id ── */
  function launchRequest(p: number) {
    setProposedPrice(p);
    setRequestId(null);
    supabase
      .from("wash_requests")
      .insert({
        user_id: session?.user.id ?? null,
        service_id: formuleId,
        address: clientPos?.label ?? "Maârif, Casablanca",
        lat: clientPos?.lat ?? null, lng: clientPos?.lng ?? null,
        proposed_price: Math.round(p),
      })
      .select("id").single()
      .then(({ data }) => { if (data?.id) setRequestId(data.id); });
    go("offers");
  }

  /* ── accepting an offer books it for real ── */
  function acceptOffer(w: WasherLite, agreed: number) {
    setSel(w);
    const now = new Date();
    const rec: BookingRec = {
      key: String(Date.now()), id: null,
      washerId: w.id, washerName: w.name, initials: w.initials, color: w.color,
      service: formule?.name ?? "", price: agreed, fee: 0, total: agreed, promo: null,
      date: now.toISOString().slice(0, 10),
      slot: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
      address: clientPos?.label ?? "Maârif, Casablanca",
      lat: clientPos?.lat ?? null, lng: clientPos?.lng ?? null,
      status: "confirmed", createdAt: now.toISOString(),
    };
    addBooking(rec);
    if (!isDemoId(w.id)) {
      supabase
        .from("bookings")
        .insert({
          user_id: session?.user.id ?? null,
          washer_id: w.id, service_id: formuleId,
          address: rec.address, lat: rec.lat, lng: rec.lng,
          scheduled_date: rec.date, scheduled_time: rec.slot,
          price: agreed, service_fee: 0, total: agreed,
          status: "confirmed", notes: `Prix négocié (Commande à ton prix)`,
        })
        .select("id").single()
        .then(({ data }) => { if (data?.id) updateBooking(rec.key, { id: data.id }); });
    }
    go("tracking");
  }

  function finishWash() {
    if (!active) return;
    updateBooking(active.key, { status: "done" });
    if (active.id) {
      supabase.from("bookings").update({ status: "completed" }).eq("id", active.id).then(() => {});
    }
    go("home");
  }

  const mapWashers: MapWasher[] = list.map((w) => ({
    id: w.id, name: w.name, initials: w.initials, color: w.color, rating: w.rating,
    zone: w.zone, base_price: w.base_price, available_now: w.available_now, eta_minutes: w.eta_minutes, lat: w.lat, lng: w.lng,
  }));

  const profileName = store.profile.name || (session?.user.user_metadata?.name as string | undefined) || "";

  return (
    <>
      {screen === "splash" && <Splash />}
      {screen === "home" && <HomeHero list={list} go={go} onPick={openBooking} avatarInits={profileName ? initialsOf(profileName) : null} promoOn={promoOn} />}
      {screen === "map" && <MobileMap washers={mapWashers} onBack={() => go("home")} onPick={(mw) => { const w = list.find((x) => x.id === mw.id); if (w) openBooking(w); }} />}
      {screen === "market" && <Market list={list} go={go} onPick={openBooking} />}
      {screen === "booking" && sel && (
        <Booking sel={sel} formules={formules} formuleId={formuleId} setFormuleId={setFormuleId} dates={dates} dateIdx={dateIdx} setDateIdx={setDateIdx} slot={slot} setSlot={setSlot} price={price} basePrice={basePrice} promoOn={promoOn} total={total} clientPos={clientPos} onPickLocation={() => setPickerOpen(true)} onBack={() => go("market")} onConfirm={confirmBooking} savedAddresses={store.addresses} onPickSaved={(a) => setClientPos({ lat: a.lat, lng: a.lng, label: a.label })} />
      )}
      {screen === "confirm" && sel && active && <Confirm sel={sel} formuleName={active.service} slotLabel={`${active.date === dates[0]?.iso ? "AUJ" : active.date} ${active.slot}`} total={active.total} promoOn={Boolean(active.promo)} onTrack={() => go("tracking")} onHome={() => go("home")} />}
      {screen === "tracking" && (active ? (
        <Tracking
          booking={active}
          livePos={livePos}
          etaMin={liveEta ?? undefined}
          distKm={liveKm ?? undefined}
          phone={washerPhone}
          onDone={finishWash}
          onBack={() => go("home")}
        />
      ) : <TrackingEmpty go={go} />)}
      {screen === "account" && (
        <Account
          go={go}
          store={store}
          sessionEmail={session?.user.email ?? null}
          sessionName={(session?.user.user_metadata?.name as string | undefined) ?? null}
          isLogged={Boolean(session)}
          active={active}
          onLogout={async () => { await signOut(); }}
        />
      )}
      {screen === "request" && (
        <RequestWash formules={formules} formuleId={formuleId} setFormuleId={setFormuleId} clientPos={clientPos} onPickLocation={() => setPickerOpen(true)} onBack={() => go("home")} onLaunch={launchRequest} />
      )}
      {screen === "offers" && (
        <Offers list={list} formule={formule} requestId={requestId} proposedPrice={proposedPrice} setProposedPrice={setProposedPrice} posLabel={clientPos?.label ?? "Maârif, Casablanca"} onAccept={acceptOffer} onCancel={() => go("home")} />
      )}
      {screen === "pro" && <ProLanding onBack={() => go("home")} profile={store.profile} />}
      {screen === "login" && <Login onContinue={() => go("home")} />}
      {pickerOpen && <LocationPicker initial={clientPos} onConfirm={(p) => { setClientPos(p); setPickerOpen(false); }} onCancel={() => setPickerOpen(false)} />}
      {(screen === "home" || screen === "market" || screen === "account") && <BottomTab screen={screen} go={go} />}
    </>
  );
}

/* ===================== SPLASH ===================== */
function Splash() {
  return (
    <div style={S.splash}>
      <div style={{ ...S.orb, ...S.orbA }} />
      <div style={{ ...S.orb, ...S.orbB }} />
      {/* Starts at the native splash's slightly-larger logo scale and settles
          into place — so icon → native splash → here reads as ONE movement. */}
      <div style={{ animation: "m_splashSettle .9s cubic-bezier(.3,1.18,.44,1) both" }}>
        <div style={S.splashLogo}><Drop size={58} stroke="#fff" sw={1.9} /></div>
      </div>
      <div style={{ marginTop: 26, textAlign: "center", animation: "m_fadeUp .7s .25s cubic-bezier(.22,1,.36,1) both" }}>
        <div style={{ fontWeight: 800, fontSize: 26, letterSpacing: "-.02em", color: "#fff" }}>AUTOKHIDMA <span style={S.gradWash}>wash</span></div>
        <div className="mono" style={S.splashTag}>Ta voiture brille · sans bouger</div>
      </div>
      <div style={S.splashBar}><div style={S.splashBarFill} /></div>
      <div className="mono" style={S.splashLoad}>CHARGEMENT…</div>
    </div>
  );
}

/* ===================== HOME : HÉROS ===================== */
function HomeHero({ list, go, onPick, avatarInits, promoOn }: { list: WasherLite[]; go: (s: Screen) => void; onPick: (w: WasherLite) => void; avatarInits: string | null; promoOn: boolean }) {
  const available = list.filter((w) => w.available_now).length;
  const liveCount = available || list.length;
  return (
    <div className="scrl" style={S.heroWrap}>
      <div style={S.hero}>
        <div style={{ ...S.heroOrb, top: 40, left: -30, width: 170, height: 170, background: "radial-gradient(circle,rgba(6,182,166,.5),transparent 70%)", animation: "m_orb 8s ease-in-out infinite" }} />
        <div style={{ ...S.heroOrb, bottom: 30, right: -30, width: 150, height: 150, background: "radial-gradient(circle,rgba(127,212,245,.45),transparent 70%)", animation: "m_orb 10s ease-in-out infinite reverse" }} />
        <div style={S.heroInner}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
            <div style={{ fontWeight: 800, fontSize: 17, color: "#fff", letterSpacing: "-.01em" }}>AUTOKHIDMA <span style={S.gradWash}>wash</span></div>
            <div onClick={() => go("account")} className="tap" style={S.avatarSm}>
              {avatarInits ?? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M5 21c0-4 3.5-6 7-6s7 2 7 6" /></svg>
              )}
            </div>
          </div>
          <div style={S.liveBadge}><span style={S.liveDotWrap}><span style={S.liveDot} /></span><span style={{ color: "#fff", fontSize: 11.5, fontWeight: 600 }}>{liveCount} laveurs disponibles</span></div>
          <div style={S.heroTitle}>Ta voiture brille,<br /><span style={S.gradWash}>sans bouger</span> de chez toi.</div>
          <div onClick={() => go("map")} className="tap" style={S.heroSearch}><Search size={18} stroke="#8A94AE" /><span style={{ color: "#8A94AE", fontSize: 14, fontWeight: 500 }}>Où es-tu ? quartier, ville, adresse…</span></div>
        </div>
      </div>
      <div style={S.heroBubbles}>
        <HeroBubble label="Express" delay={0.05} float={0} grad="linear-gradient(150deg,#16D6C4,#0B7A6D)" shadow="rgba(11,122,109,.45)" icon="bolt" onClick={() => go("market")} />
        <HeroBubble label="Standard" delay={0.12} float={0.4} grad="linear-gradient(150deg,#3A78FF,#0B3D91)" shadow="rgba(11,61,145,.45)" icon="drop" onClick={() => go("market")} />
        <HeroBubble label="Premium" delay={0.19} float={0.8} grad="linear-gradient(150deg,#6D6BF2,#3B2EAE)" shadow="rgba(59,46,174,.45)" icon="shield" sparkle onClick={() => go("market")} />
        <HeroBubble label="Laveurs" delay={0.26} float={1.2} grad="linear-gradient(150deg,#52C6EC,#1A6B96)" shadow="rgba(26,107,150,.45)" icon="user" onClick={() => go("market")} />
      </div>
      <div style={{ padding: "22px 18px 0" }}>
        {/* inDrive-style: order at YOUR price */}
        <div onClick={() => go("request")} className="tap" style={S.bidCta}>
          <div style={{ position: "absolute", right: -24, top: -24, width: 130, height: 130, borderRadius: "50%", background: "rgba(255,255,255,.12)" }} />
          <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 13 }}>
            <div style={{ width: 46, height: 46, borderRadius: 14, background: "rgba(255,255,255,.18)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
              <img src="/carwash-truck.png" alt="" style={{ width: 34, height: 34, objectFit: "contain" }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 16.5, color: "#fff", letterSpacing: "-.02em" }}>Commande à ton prix</div>
              <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.85)", marginTop: 2 }}>Propose un prix, les laveurs répondent en direct</div>
            </div>
            <span style={{ color: "#fff", fontSize: 22, fontWeight: 800 }}>›</span>
          </div>
        </div>

        <div onClick={() => go("market")} className="tap" style={{ ...S.promo, marginTop: 14 }}>
          <div style={S.promoBlob} />
          <div className="mono" style={S.promoCode}>{promoOn ? "CODE AUTO20 · ACTIF" : "CODE AUTO20 · UTILISÉ ✓"}</div>
          <div style={S.promoTitle}>−20% sur ton 1<sup>er</sup> lavage</div>
          <div style={{ position: "relative", fontSize: 13, opacity: 0.85, marginTop: 2 }}>{promoOn ? "Appliqué automatiquement à ta 1re réservation." : "Déjà profité — merci ! D'autres offres arrivent."}</div>
        </div>
        <div style={{ ...S.h2, margin: "22px 0 12px" }}>Nos laveurs vérifiés</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          {list.map((w, i) => <WasherRow key={w.id} w={w} i={i} onClick={() => onPick(w)} />)}
        </div>
      </div>
    </div>
  );
}

/* ===================== MARKETPLACE ===================== */
function Market({ list, go, onPick }: { list: WasherLite[]; go: (s: Screen) => void; onPick: (w: WasherLite) => void }) {
  const [filter, setFilter] = useState("Tous");
  const [q, setQ] = useState("");
  const chips = ["Tous", "Dispo maintenant", "★ Top notés", "Prix bas"];
  let shown = [...list];
  if (filter === "★ Top notés") shown.sort((a, b) => b.rating - a.rating);
  if (filter === "Prix bas") shown.sort((a, b) => a.base_price - b.base_price);
  if (filter === "Dispo maintenant") shown = shown.filter((w) => w.available_now);
  if (q.trim()) {
    const needle = q.trim().toLowerCase();
    shown = shown.filter((w) => w.name.toLowerCase().includes(needle) || w.zone.toLowerCase().includes(needle));
  }
  return (
    <div className="scrl" style={S.scr}>
      <div style={S.marketHead}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 13 }}>
          <BackBtn onClick={() => go("home")} />
          <div><div style={{ fontWeight: 800, fontSize: 19, color: "#0A1735", letterSpacing: "-.02em" }}>Réserve ton lavage</div><div style={{ fontSize: 12, color: "#5B6784" }}>Compare {list.length} laveurs vérifiés</div></div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 9, background: "#F6F7FB", border: "1px solid #E7EAF2", borderRadius: 14, padding: "11px 14px" }}>
          <Search size={17} stroke="#8A94AE" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Laveur, quartier…" style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontFamily: "inherit", fontSize: 13.5, color: "#0A1735" }} />
          {q && <span onClick={() => setQ("")} className="tap" style={{ color: "#8A94AE", fontWeight: 700, fontSize: 15 }}>✕</span>}
        </div>
        <div className="scrl" style={{ display: "flex", gap: 8, overflowX: "auto", margin: "13px -18px 0", padding: "0 18px" }}>
          {chips.map((c) => (
            <span key={c} onClick={() => setFilter(c)} className="tap" style={{ flex: "none", background: filter === c ? "#0B3D91" : "#fff", color: filter === c ? "#fff" : "#1B2B54", border: filter === c ? "none" : "1px solid #E7EAF2", fontSize: 12, fontWeight: 700, padding: "8px 14px", borderRadius: 999 }}>{c}</span>
          ))}
        </div>
      </div>
      <div style={{ padding: "16px 18px 0" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
          {shown.map((w, i) => <MarketCard key={w.id} w={w} i={i} onClick={() => onPick(w)} />)}
          {!shown.length && (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "#8A94AE", fontSize: 13.5, fontWeight: 600 }}>Aucun laveur ne correspond — essaie un autre filtre.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function MarketCard({ w, onClick, i = 0 }: { w: WasherLite; onClick: () => void; i?: number }) {
  return (
    <div onClick={onClick} className="tap" style={{ background: "#fff", border: "1px solid #E7EAF2", borderRadius: 20, padding: 16, boxShadow: "0 4px 14px rgba(10,23,53,.05)", animation: `m_fadeUp .5s ${0.06 + i * 0.06}s var(--ease-out, cubic-bezier(.22,1,.36,1)) both` }}>
      <div style={{ display: "flex", gap: 13 }}>
        <div style={{ ...S.mAvatar, background: w.color }}>{w.initials}<span style={S.wBadge}><Check size={10} stroke="#fff" sw={3.5} /></span></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><div style={{ fontWeight: 700, fontSize: 15.5, color: "#0A1735" }}>{w.name}</div><div style={{ fontSize: 12.5, color: "#F5B544", fontWeight: 700 }}>★ <span style={{ color: "#1B2B54" }}>{w.rating}</span> <span style={{ color: "#8A94AE", fontWeight: 500 }}>({w.reviews_count})</span></div></div>
          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            {w.is_super && <span style={{ ...S.tag, color: "#0B3D91", background: "#E8EEFF" }}>Top laveur</span>}
            <span style={{ ...S.tag, color: "#046B62", background: "#E6FAF6" }}>Vérifié</span>
          </div>
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: "#5B6784", marginTop: 11, lineHeight: 1.45 }}>{w.bio}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 13, marginTop: 11, fontSize: 11.5, color: "#8A94AE", fontWeight: 600 }}><span>📍 {w.zone}</span><span>{w.distance_km} km</span><span>⏱ {w.eta_minutes} min</span></div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 13, paddingTop: 13, borderTop: "1px solid #EEF1F7" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: w.available_now ? "#06B6A6" : "#8A94AE" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "currentColor" }} />{w.available_now ? "Disponible" : "Occupé"}</span>
        <span style={{ fontSize: 11, color: "#8A94AE", fontWeight: 600 }}>DÈS <span className="mono" style={{ fontSize: 15, color: "#0A1735", fontWeight: 500 }}>{w.base_price} MAD</span></span>
      </div>
    </div>
  );
}

/* ===================== BOOKING ===================== */
function Booking({ sel, formules, formuleId, setFormuleId, dates, dateIdx, setDateIdx, slot, setSlot, price, basePrice, promoOn, total, clientPos, onPickLocation, onBack, onConfirm, savedAddresses, onPickSaved }: {
  sel: WasherLite; formules: Formule[]; formuleId: string; setFormuleId: (s: string) => void;
  dates: { dow: string; day: number; iso: string }[]; dateIdx: number; setDateIdx: (i: number) => void;
  slot: string; setSlot: (s: string) => void; price: number; basePrice: number; promoOn: boolean; total: number;
  clientPos: PickedPos | null; onPickLocation: () => void; onBack: () => void; onConfirm: () => void;
  savedAddresses: Address[]; onPickSaved: (a: Address) => void;
}) {
  return (
    <>
      <div className="scrl" style={{ ...S.scr, paddingBottom: 130 }}>
        <div style={{ ...S.marketHead, display: "flex", alignItems: "center", gap: 12 }}>
          <BackBtn onClick={onBack} />
          <div><div style={{ fontWeight: 800, fontSize: 18, color: "#0A1735", letterSpacing: "-.02em" }}>Réservation</div><div style={{ fontSize: 12, color: "#5B6784" }}>Avec {sel.name}</div></div>
        </div>
        <div style={{ padding: "16px 18px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 13, background: "#fff", border: "1px solid #E7EAF2", borderRadius: 18, padding: 14, boxShadow: "0 4px 14px rgba(10,23,53,.05)" }}>
            <div style={{ width: 50, height: 50, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 17, flex: "none", background: sel.color }}>{sel.initials}</div>
            <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 15, color: "#0A1735" }}>{sel.name}</div><div style={{ fontSize: 12, color: "#5B6784" }}>★ {sel.rating} ({sel.reviews_count}) · {sel.zone} · ⏱ {sel.eta_minutes} min</div></div>
          </div>

          <div style={S.bookH}>Choisis ta formule</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {formules.map((f) => {
              const on = f.id === formuleId;
              return (
                <div key={f.id} onClick={() => setFormuleId(f.id)} className="tap" style={{ display: "flex", alignItems: "center", gap: 13, background: "#fff", border: `2px solid ${on ? "#1A4ED8" : "#E7EAF2"}`, borderRadius: 16, padding: "13px 15px" }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: f.bg, display: "flex", alignItems: "center", justifyContent: "center", flex: "none", fontSize: 19 }}>{f.icon}</div>
                  <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 14.5, color: "#0A1735" }}>{f.name}</div><div style={{ fontSize: 12, color: "#5B6784" }}>{f.desc}</div></div>
                  <div className="mono" style={{ fontSize: 14, color: "#0A1735", fontWeight: 500 }}>{f.price} MAD</div>
                  <div style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${on ? "#1A4ED8" : "#E7EAF2"}`, display: "flex", alignItems: "center", justifyContent: "center", flex: "none", background: on ? "#1A4ED8" : "#fff" }}>{on && <Check size={11} stroke="#fff" sw={3.5} />}</div>
                </div>
              );
            })}
          </div>

          <div style={S.bookH}>Quand ?</div>
          <div className="scrl" style={{ display: "flex", gap: 9, overflowX: "auto", margin: "0 -18px", padding: "0 18px 2px" }}>
            {dates.map((d, i) => {
              const on = i === dateIdx;
              return (
                <div key={d.iso} onClick={() => setDateIdx(i)} className="tap" style={{ flex: "none", width: 62, textAlign: "center", background: on ? "#0B3D91" : "#fff", border: `1.5px solid ${on ? "#0B3D91" : "#E7EAF2"}`, borderRadius: 14, padding: "11px 0" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: on ? "rgba(255,255,255,.7)" : "#8A94AE", textTransform: "uppercase" }}>{d.dow}</div>
                  <div style={{ fontSize: 19, fontWeight: 800, color: on ? "#fff" : "#0A1735", marginTop: 2 }}>{d.day}</div>
                </div>
              );
            })}
          </div>

          <div style={S.bookH}>Créneau</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 9 }}>
            {SLOTS.map((t) => {
              const on = t === slot;
              return <div key={t} onClick={() => setSlot(t)} className="tap" style={{ textAlign: "center", background: on ? "#E8EEFF" : "#fff", border: `1.5px solid ${on ? "#1A4ED8" : "#E7EAF2"}`, borderRadius: 12, padding: "11px 0", fontSize: 13, fontWeight: 700, color: on ? "#0B3D91" : "#1B2B54" }}>{t}</div>;
            })}
          </div>

          <div style={S.bookH}>Adresse &amp; paiement</div>
          {savedAddresses.length > 0 && (
            <div className="scrl" style={{ display: "flex", gap: 8, overflowX: "auto", margin: "0 -18px 10px", padding: "0 18px" }}>
              {savedAddresses.map((a) => (
                <span key={a.name + a.label} onClick={() => onPickSaved(a)} className="tap" style={{ flex: "none", background: clientPos?.label === a.label ? "#E8EEFF" : "#fff", border: `1.5px solid ${clientPos?.label === a.label ? "#1A4ED8" : "#E7EAF2"}`, color: "#0B3D91", fontSize: 12, fontWeight: 700, padding: "8px 13px", borderRadius: 999 }}>{a.name === "Domicile" ? "🏠" : a.name === "Bureau" ? "🏢" : "📍"} {a.name}</span>
              ))}
            </div>
          )}
          <div style={{ background: "#fff", border: "1px solid #E7EAF2", borderRadius: 16, overflow: "hidden" }}>
            <div onClick={onPickLocation} className="tap" style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 15px", borderBottom: "1px solid #EEF1F7" }}><div style={{ width: 36, height: 36, borderRadius: 11, background: clientPos ? "#E6FAF6" : "#E8EEFF", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><Pin size={18} stroke={clientPos ? "#046B62" : "#0B3D91"} /></div><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 13.5, color: "#0A1735", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{clientPos ? clientPos.label : "Choisir ma position"}</div><div style={{ fontSize: 11.5, color: clientPos ? "#046B62" : "#5B6784" }}>{clientPos ? "Position confirmée sur la carte ✓" : "GPS ou point sur la carte"}</div></div><span style={{ color: "#8A94AE" }}>›</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 15px" }}><div style={{ width: 36, height: 36, borderRadius: 11, background: "#E6FAF6", display: "flex", alignItems: "center", justifyContent: "center", flex: "none", fontSize: 16 }}>💵</div><div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 13.5, color: "#0A1735" }}>Espèces à la fin du lavage</div><div style={{ fontSize: 11.5, color: "#5B6784" }}>Paiement carte bientôt disponible</div></div><Check size={16} stroke="#06B6A6" sw={3} /></div>
          </div>
        </div>
      </div>
      <div style={S.cta}>
        {promoOn && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
            <span style={{ fontSize: 12, color: "#046B62", fontWeight: 700 }}>🎁 Code AUTO20 appliqué (−20%)</span>
            <span className="mono" style={{ fontSize: 12, color: "#8A94AE", textDecoration: "line-through" }}>{basePrice + SERVICE_FEE} MAD</span>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}><span style={{ fontSize: 13, color: "#5B6784", fontWeight: 600 }}>Total ({price} + {SERVICE_FEE} MAD service)</span><span className="mono" style={{ fontSize: 18, fontWeight: 500, color: "#0A1735" }}>{total} MAD</span></div>
        <button onClick={onConfirm} className="tap" style={S.ctaBtn}>Confirmer la réservation</button>
      </div>
    </>
  );
}

/* ===================== CONFIRM ===================== */
function Confirm({ sel, formuleName, slotLabel, total, promoOn, onTrack, onHome }: { sel: WasherLite; formuleName: string; slotLabel: string; total: number; promoOn: boolean; onTrack: () => void; onHome: () => void }) {
  return (
    <div style={S.confirm}>
      <div style={{ position: "absolute", top: "10%", left: -40, width: 160, height: 160, borderRadius: "50%", background: "radial-gradient(circle,rgba(6,182,166,.4),transparent 70%)", filter: "blur(16px)", animation: "m_orb 8s ease-in-out infinite" }} />
      <div style={{ position: "relative", width: 104, height: 104, animation: "m_splashPop .7s cubic-bezier(.22,1,.36,1) both" }}>
        <span style={{ position: "absolute", inset: -10, borderRadius: "50%", background: "rgba(6,182,166,.3)", animation: "m_pulseRing 2s infinite" }} />
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "linear-gradient(135deg,#16D6C4,#06B6A6)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 18px 40px rgba(6,182,166,.5)" }}>
          <svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="m5 13 4 4L19 7" style={{ strokeDasharray: 30, strokeDashoffset: 30, animation: "m_drawCheck .5s .35s forwards ease-out" }} /></svg>
        </div>
      </div>
      <div style={{ textAlign: "center", marginTop: 24, animation: "m_fadeUp .6s .3s both" }}>
        <div style={{ color: "#fff", fontWeight: 800, fontSize: 24, letterSpacing: "-.02em" }}>Réservation confirmée 🎉</div>
        <div style={{ color: "rgba(255,255,255,.6)", fontSize: 13.5, marginTop: 6 }}>{sel.name} arrive dans ~{sel.eta_minutes} min</div>
      </div>
      <div style={{ width: "100%", maxWidth: 320, background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 18, padding: 16, marginTop: 24, animation: "m_fadeUp .6s .42s both" }}>
        <Recap k="Formule" v={formuleName} />
        <Recap k="Créneau" v={slotLabel} top />
        {promoOn && <Recap k="Promo" v="AUTO20 · −20% ✓" top />}
        <Recap k="Total" v={`${total} MAD`} top accent />
      </div>
      <button onClick={onTrack} className="tap" style={{ width: "100%", maxWidth: 320, marginTop: 22, border: "none", background: "#fff", color: "#0B3D91", fontFamily: "inherit", fontWeight: 800, fontSize: 15.5, padding: 15, borderRadius: 15, animation: "m_fadeUp .6s .5s both" }}>Suivre mon laveur en direct →</button>
      <button onClick={onHome} style={{ marginTop: 12, background: "none", border: "none", color: "rgba(255,255,255,.6)", fontFamily: "inherit", fontWeight: 700, fontSize: 13, animation: "m_fadeUp .6s .56s both" }}>Retour à l&apos;accueil</button>
    </div>
  );
}
function Recap({ k, v, top, accent }: { k: string; v: string; top?: boolean; accent?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13, borderTop: top ? "1px solid rgba(255,255,255,.08)" : "none" }}>
      <span style={{ color: "rgba(255,255,255,.55)" }}>{k}</span>
      <span className={accent ? "mono" : ""} style={{ color: accent ? "#7FD4F5" : "#fff", fontWeight: 800 }}>{v}</span>
    </div>
  );
}

/* ===================== TRACKING (live positions from Supabase) ===================== */
function Tracking({ booking, livePos, etaMin, distKm, phone, onDone, onBack }: {
  booking: BookingRec; livePos: [number, number] | null; etaMin?: number; distKm?: number;
  phone: string | null; onDone: () => void; onBack: () => void;
}) {
  const dest: [number, number] = booking.lat != null && booking.lng != null ? [booking.lat, booking.lng] : DEFAULT_DEST;
  const washing = booking.status === "washing";
  const eta = etaMin ?? 8;
  const km = distKm != null ? (distKm < 1 ? `${Math.round(distKm * 1000)} m` : `${distKm.toFixed(1)} km`) : null;
  const waLink = phone ? `https://wa.me/${phone.replace(/[^0-9]/g, "")}` : null;
  return (
    <div style={{ position: "relative", width: "100vw", height: "100dvh", overflow: "hidden", background: "#E9EDF3" }}>
      <MobileTrackMap accent="#1A4ED8" dest={dest} washerPos={livePos ?? undefined} />
      <button onClick={onBack} className="tap" style={{ position: "absolute", top: "calc(env(safe-area-inset-top,0px) + 12px)", left: 14, zIndex: 10, ...mapBtn }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0A1735" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg></button>
      <div style={{ position: "absolute", top: "calc(env(safe-area-inset-top,0px) + 12px)", right: 14, zIndex: 10, display: "flex", alignItems: "center", gap: 7, background: "#fff", padding: "9px 13px", borderRadius: 14, boxShadow: "0 6px 18px rgba(10,23,53,.16)" }}><span style={S.liveDotWrap}><span style={S.liveDot} /></span><span style={{ fontSize: 12.5, fontWeight: 700, color: "#0A1735" }}>{washing ? "Lavage en cours" : livePos ? "En route · position live" : "En route"}</span></div>

      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 9, background: "#fff", borderRadius: "26px 26px 0 0", boxShadow: "0 -8px 28px rgba(10,23,53,.12)", padding: "12px 0 calc(env(safe-area-inset-bottom,0px) + 18px)", animation: "m_rise .55s var(--spring, cubic-bezier(.3,1.36,.44,1)) both" }}>
        <div style={{ width: 40, height: 4, background: "#E7EAF2", borderRadius: 999, margin: "2px auto 14px" }} />
        <div style={{ padding: "0 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ position: "relative", width: 88, height: 88, flex: "none" }}>
              <svg width="88" height="88" viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" fill="none" stroke="#EEF1F7" strokeWidth={11} /><circle cx="60" cy="60" r="52" fill="none" stroke="#06B6A6" strokeWidth={11} strokeLinecap="round" strokeDasharray="326.7" strokeDashoffset={washing ? 20 : 118} transform="rotate(-90 60 60)" style={{ "--circ": "326.7", animation: "m_ringFill 1.4s cubic-bezier(.22,1,.36,1) both" } as CSSProperties} /></svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>{washing ? <span style={{ fontSize: 26 }}>🧽</span> : (<><span style={{ fontSize: 24, fontWeight: 800, color: "#0A1735", lineHeight: 1 }}>{eta}</span><span style={{ fontSize: 10, color: "#5B6784", fontWeight: 700 }}>min</span></>)}</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 17, color: "#0A1735", letterSpacing: "-.02em" }}>{washing ? "Lavage en cours ✨" : "Ton laveur arrive"}</div>
              <div style={{ fontSize: 13, color: "#5B6784", marginTop: 3 }}>
                {washing ? `${booking.washerName} s'occupe de ta voiture.` : km ? `${booking.washerName} est à ${km}. Prépare ta voiture 🚗` : `${booking.washerName} est en route. Prépare ta voiture 🚗`}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", margin: "18px 0 4px" }}>
            <TLStep label="Accepté" done first />
            <TLStep label="En route" done={washing} active={!washing} />
            <TLStep label="Lavage" active={washing} />
            <TLStep label="Terminé" last />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#F6F7FB", border: "1px solid #EEF1F7", borderRadius: 16, padding: 12, marginTop: 14 }}>
            <div style={{ width: 46, height: 46, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 15, flex: "none", background: booking.color }}>{booking.initials}</div>
            <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 14, color: "#0A1735" }}>{booking.washerName}</div><div style={{ fontSize: 12, color: "#5B6784" }}>{booking.service} · {booking.total} MAD</div></div>
            {phone && (
              <>
                <button onClick={() => { window.open(`tel:${phone}`, "_self"); }} className="tap" style={{ width: 42, height: 42, borderRadius: 13, background: "#fff", border: "1px solid #E7EAF2", display: "flex", alignItems: "center", justifyContent: "center" }} aria-label="Appeler"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#0B3D91" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M8 10a8 8 0 0 0 6 6l2-2 4 1v4a17 17 0 0 1-15-15h4l1 4-2 2Z" /></svg></button>
                {waLink && <button onClick={() => { window.open(waLink, "_blank"); }} className="tap" style={{ width: 42, height: 42, borderRadius: 13, background: "#0B3D91", border: "none", display: "flex", alignItems: "center", justifyContent: "center" }} aria-label="WhatsApp"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8 8 0 0 1-11 7.3L3 21l1.7-6A8 8 0 1 1 21 11.5Z" /></svg></button>}
              </>
            )}
          </div>
          {washing && (
            <button onClick={onDone} className="tap" style={{ width: "100%", marginTop: 12, border: "none", background: "linear-gradient(120deg,#06B6A6,#0B7A6D)", color: "#fff", fontFamily: "inherit", fontWeight: 800, fontSize: 14.5, padding: 14, borderRadius: 14 }}>Lavage terminé ✓ (confirmer)</button>
          )}
        </div>
      </div>
    </div>
  );
}
function TLStep({ label, done, active, first, last }: { label: string; done?: boolean; active?: boolean; first?: boolean; last?: boolean }) {
  const filled = done || active;
  return (
    <div style={{ flex: 1, textAlign: "center", position: "relative" }}>
      <div style={{ width: 26, height: 26, borderRadius: "50%", background: filled ? "#06B6A6" : "#E7EAF2", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", border: active ? "3px solid #B5EFE8" : "none", boxShadow: active ? "0 0 0 4px rgba(6,182,166,.18)" : "none" }}>{done && <Check size={13} stroke="#fff" sw={3.5} />}</div>
      {!last && <div style={{ position: "absolute", top: 13, left: "50%", right: "-50%", height: 3, background: done ? "#06B6A6" : active ? "linear-gradient(90deg,#06B6A6,#E7EAF2)" : "#E7EAF2" }} />}
      <div style={{ fontSize: 10.5, fontWeight: filled ? 700 : 600, color: filled ? "#0A1735" : "#8A94AE", marginTop: 6 }}>{label}</div>
    </div>
  );
}

function TrackingEmpty({ go }: { go: (s: Screen) => void }) {
  return (
    <div style={{ position: "relative", width: "100vw", height: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 30, background: "#F6F7FB", textAlign: "center" }}>
      <div style={{ width: 84, height: 84, borderRadius: 24, background: "#E8EEFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 38 }}>🚿</div>
      <div style={{ fontWeight: 800, fontSize: 20, color: "#0A1735", marginTop: 18 }}>Aucun lavage en cours</div>
      <div style={{ fontSize: 13.5, color: "#5B6784", marginTop: 6, maxWidth: 260 }}>Réserve un laveur et tu pourras suivre son arrivée en direct ici.</div>
      <button onClick={() => go("market")} className="tap" style={{ marginTop: 22, border: "none", background: "linear-gradient(120deg,#0B3D91,#1A4ED8)", color: "#fff", fontFamily: "inherit", fontWeight: 800, fontSize: 15, padding: "14px 24px", borderRadius: 14, boxShadow: "0 10px 24px rgba(11,61,145,.3)" }}>Réserver un laveur</button>
      <button onClick={() => go("home")} className="tap" style={{ marginTop: 12, background: "none", border: "none", color: "#5B6784", fontFamily: "inherit", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Retour à l&apos;accueil</button>
    </div>
  );
}

/* ===================== ACCOUNT (all real) ===================== */
function Account({ go, store, sessionEmail, sessionName, isLogged, active, onLogout }: {
  go: (s: Screen) => void; store: ReturnType<typeof useStore>;
  sessionEmail: string | null; sessionName: string | null; isLogged: boolean;
  active: BookingRec | null; onLogout: () => Promise<void>;
}) {
  const [detail, setDetail] = useState<string | null>(null);
  const name = store.profile.name || sessionName || "";
  const displayName = name || "Invité";
  const inits = name ? initialsOf(name) : "🙂";
  const doneCount = store.history.filter((h) => h.status === "done").length;
  const spent = store.history.filter((h) => h.status === "done").reduce((s, h) => s + h.total, 0);
  const statut = doneCount >= 8 ? "Gold" : doneCount >= 4 ? "Silver" : "Bronze";
  const menu = [
    { icon: "🧾", label: "Mes lavages", bg: "#E8EEFF" },
    { icon: "📍", label: "Mes adresses", bg: "#E6FAF6" },
    { icon: "💳", label: "Paiement", bg: "#FDF1DC" },
    { icon: "🎁", label: "Parrainage & crédits", bg: "#F1EBFB" },
    { icon: "🔔", label: "Notifications", bg: "#E8EEFF" },
    { icon: "⚙️", label: "Paramètres", bg: "#EEF1F7" },
  ];
  return (
    <>
      <div className="scrl" style={S.scr}>
        <div style={{ background: "radial-gradient(500px 320px at 80% 0%,#1B3E8F,#0A1735 70%)", borderRadius: "0 0 28px 28px", padding: "calc(env(safe-area-inset-top,0px) + 30px) 20px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 62, height: 62, borderRadius: "50%", background: "linear-gradient(135deg,#1A4ED8,#06B6A6)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 22, flex: "none" }}>{inits}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: "#fff", fontWeight: 800, fontSize: 19 }}>{displayName}</div>
              <div style={{ color: "rgba(255,255,255,.6)", fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{store.profile.phone || sessionEmail || "Complète ton profil"}</div>
            </div>
            <span onClick={() => setDetail("edit-profile")} className="tap" style={{ color: "#fff", fontSize: 11, fontWeight: 700, background: "rgba(255,255,255,.15)", padding: "5px 10px", borderRadius: 999, cursor: "pointer" }}>Modifier</span>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <Stat v={String(doneCount)} l="lavages" c="#7FD4F5" />
            <Stat v={String(spent)} l="MAD dépensés" c="#fff" mono />
            <Stat v={statut} l="statut" c="#F5B544" />
          </div>
        </div>
        <div style={{ padding: "18px 18px 0" }}>
          {active && (
            <div onClick={() => go("tracking")} className="tap" style={{ display: "flex", alignItems: "center", gap: 13, background: "linear-gradient(120deg,#0B3D91,#1A4ED8)", borderRadius: 18, padding: 15, boxShadow: "0 10px 24px rgba(11,61,145,.28)", marginBottom: 18 }}>
              <div style={{ width: 42, height: 42, borderRadius: "50%", background: "rgba(255,255,255,.18)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><span style={S.liveDotWrap}><span style={{ ...S.liveDot, background: "#7FD4F5" }} /></span></div>
              <div style={{ flex: 1 }}><div style={{ color: "#fff", fontWeight: 700, fontSize: 14.5 }}>Lavage en cours</div><div style={{ color: "rgba(255,255,255,.7)", fontSize: 12 }}>{active.washerName} · {active.service} · {active.slot}</div></div>
              <span style={{ color: "#fff", fontSize: 20 }}>›</span>
            </div>
          )}
          <div style={{ background: "#fff", border: "1px solid #E7EAF2", borderRadius: 18, overflow: "hidden" }}>
            {menu.map((m, i) => (
              <div key={m.label} onClick={() => setDetail(m.label)} className="tap" style={{ display: "flex", alignItems: "center", gap: 13, padding: 15, borderBottom: i < menu.length - 1 ? "1px solid #EEF1F7" : "none" }}><div style={{ width: 36, height: 36, borderRadius: 11, background: m.bg, display: "flex", alignItems: "center", justifyContent: "center", flex: "none", fontSize: 17 }}>{m.icon}</div><span style={{ flex: 1, fontWeight: 700, fontSize: 14, color: "#0A1735" }}>{m.label}</span><span style={{ color: "#C2CADB", fontSize: 18 }}>›</span></div>
            ))}
          </div>
          <div onClick={() => go("pro")} className="tap" style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 13, background: "#0A1735", borderRadius: 18, padding: 16 }}><div style={{ width: 42, height: 42, borderRadius: 12, background: "rgba(127,212,245,.16)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none", fontSize: 20 }}>💼</div><div style={{ flex: 1 }}><div style={{ color: "#fff", fontWeight: 700, fontSize: 14.5 }}>Devenir laveur partenaire</div><div style={{ color: "rgba(255,255,255,.6)", fontSize: 12 }}>Gagne jusqu&apos;à 6 000 MAD/mois</div></div><span style={{ color: "#7FD4F5", fontSize: 20 }}>›</span></div>
          {isLogged ? (
            <button onClick={() => { onLogout(); }} className="tap" style={{ width: "100%", marginTop: 14, background: "#fff", border: "1px solid #F3D2D2", color: "#D14343", fontFamily: "inherit", fontWeight: 700, fontSize: 14, padding: 14, borderRadius: 15 }}>Se déconnecter</button>
          ) : (
            <button onClick={() => go("login")} className="tap" style={{ width: "100%", marginTop: 14, background: "#fff", border: "1.5px solid #1A4ED8", color: "#0B3D91", fontFamily: "inherit", fontWeight: 800, fontSize: 14, padding: 14, borderRadius: 15 }}>Se connecter ou créer un compte</button>
          )}
        </div>
      </div>
      {detail === "edit-profile" && <EditProfile profile={{ ...store.profile, name, email: store.profile.email || sessionEmail || "" }} isLogged={isLogged} onSave={(p) => { setStore({ profile: p }); if (isLogged) supabase.auth.updateUser({ data: { name: p.name } }).then(() => {}); setDetail(null); }} onBack={() => setDetail(null)} />}
      {detail === "Mes lavages" && <WashHistory history={store.history} onBack={() => setDetail(null)} />}
      {detail === "Mes adresses" && <Addresses onBack={() => setDetail(null)} />}
      {detail === "Paiement" && <Payment onBack={() => setDetail(null)} />}
      {detail === "Parrainage & crédits" && <Referral name={name} onBack={() => setDetail(null)} />}
      {detail === "Notifications" && <Notifs onBack={() => setDetail(null)} />}
      {detail === "Paramètres" && <Settings onBack={() => setDetail(null)} />}
    </>
  );
}
function Stat({ v, l, c, mono }: { v: string; l: string; c: string; mono?: boolean }) {
  return (
    <div style={{ flex: 1, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 14, padding: 12, textAlign: "center" }}>
      <div className={mono ? "mono" : ""} style={{ color: c, fontWeight: 800, fontSize: 18 }}>{v}</div>
      <div style={{ color: "rgba(255,255,255,.6)", fontSize: 10.5 }}>{l}</div>
    </div>
  );
}

/* ── account sub-screens (real data) ── */
function SubScreen({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div className="scrl" style={{ position: "fixed", inset: 0, zIndex: 40, overflowY: "auto", background: "#F6F7FB", animation: "m_modalIn .38s var(--spring-soft, cubic-bezier(.26,1.14,.4,1)) both", paddingBottom: 40 }}>
      <div style={{ ...S.marketHead, display: "flex", alignItems: "center", gap: 12 }}>
        <BackBtn onClick={onBack} />
        <div style={{ fontWeight: 800, fontSize: 18, color: "#0A1735", letterSpacing: "-.02em" }}>{title}</div>
      </div>
      <div style={{ padding: "16px 18px 0" }}>{children}</div>
    </div>
  );
}

function WashHistory({ history, onBack }: { history: BookingRec[]; onBack: () => void }) {
  const statusFr: Record<string, [string, string, string]> = {
    confirmed: ["Confirmé", "#0B3D91", "#E8EEFF"],
    enroute: ["En route", "#8A5A00", "#FDF1DC"],
    washing: ["En cours", "#046B62", "#E6FAF6"],
    done: ["Terminé", "#046B62", "#E6FAF6"],
    cancelled: ["Annulé", "#D14343", "#FDECEC"],
  };
  return (
    <SubScreen title="Mes lavages" onBack={onBack}>
      {history.length === 0 ? (
        <div style={{ textAlign: "center", padding: "50px 20px" }}>
          <div style={{ fontSize: 40 }}>🧾</div>
          <div style={{ fontWeight: 800, fontSize: 17, color: "#0A1735", marginTop: 12 }}>Pas encore de lavage</div>
          <div style={{ fontSize: 13, color: "#5B6784", marginTop: 6 }}>Ta première réservation apparaîtra ici.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          {history.map((h) => {
            const [lbl, fg, bg] = statusFr[h.status] ?? statusFr.confirmed;
            return (
              <div key={h.key} style={{ background: "#fff", border: "1px solid #E7EAF2", borderRadius: 16, padding: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 42, height: 42, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 14, flex: "none", background: h.color }}>{h.initials}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#0A1735" }}>{h.service} · {h.washerName}</div>
                    <div style={{ fontSize: 12, color: "#5B6784", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.date} · {h.slot} · {h.address}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="mono" style={{ fontSize: 13.5, color: "#0A1735", fontWeight: 500 }}>{h.total} MAD</div>
                    <span style={{ fontSize: 10, fontWeight: 800, color: fg, background: bg, padding: "3px 8px", borderRadius: 999 }}>{lbl}</span>
                  </div>
                </div>
                {h.promo && <div style={{ fontSize: 11, color: "#046B62", fontWeight: 700, marginTop: 8 }}>🎁 Code {h.promo} appliqué (−20%)</div>}
              </div>
            );
          })}
        </div>
      )}
    </SubScreen>
  );
}

function Addresses({ onBack }: { onBack: () => void }) {
  const store = useStore();
  const [picking, setPicking] = useState(false);
  const [namePick, setNamePick] = useState("Domicile");
  const remove = (a: Address) => setStore({ addresses: store.addresses.filter((x) => !(x.name === a.name && x.label === a.label)) });
  return (
    <SubScreen title="Mes adresses" onBack={onBack}>
      {store.addresses.length === 0 && (
        <div style={{ textAlign: "center", padding: "30px 20px 20px", color: "#5B6784", fontSize: 13.5 }}>
          <div style={{ fontSize: 38 }}>📍</div>
          <div style={{ fontWeight: 800, fontSize: 16, color: "#0A1735", marginTop: 10 }}>Aucune adresse enregistrée</div>
          <div style={{ marginTop: 5 }}>Ajoute ton domicile ou ton bureau pour réserver en 2 secondes.</div>
        </div>
      )}
      {store.addresses.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #E7EAF2", borderRadius: 16, overflow: "hidden", marginBottom: 14 }}>
          {store.addresses.map((a, i) => (
            <div key={a.name + a.label} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 15px", borderBottom: i < store.addresses.length - 1 ? "1px solid #EEF1F7" : "none" }}>
              <div style={{ width: 36, height: 36, borderRadius: 11, background: "#E6FAF6", display: "flex", alignItems: "center", justifyContent: "center", flex: "none", fontSize: 16 }}>{a.name === "Domicile" ? "🏠" : a.name === "Bureau" ? "🏢" : "📍"}</div>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 13.5, color: "#0A1735" }}>{a.name}</div><div style={{ fontSize: 12, color: "#5B6784", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.label}</div></div>
              <span onClick={() => remove(a)} className="tap" style={{ color: "#D14343", fontWeight: 800, fontSize: 15, padding: 6 }}>✕</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {["Domicile", "Bureau", "Autre"].map((n) => (
          <span key={n} onClick={() => setNamePick(n)} className="tap" style={{ flex: 1, textAlign: "center", background: namePick === n ? "#E8EEFF" : "#fff", border: `1.5px solid ${namePick === n ? "#1A4ED8" : "#E7EAF2"}`, color: namePick === n ? "#0B3D91" : "#5B6784", fontSize: 12.5, fontWeight: 700, padding: "9px 0", borderRadius: 12 }}>{n === "Domicile" ? "🏠" : n === "Bureau" ? "🏢" : "📍"} {n}</span>
        ))}
      </div>
      <button onClick={() => setPicking(true)} className="tap" style={{ width: "100%", border: "none", background: "linear-gradient(120deg,#0B3D91,#1A4ED8)", color: "#fff", fontFamily: "inherit", fontWeight: 800, fontSize: 14.5, padding: 14, borderRadius: 14, boxShadow: "0 10px 24px rgba(11,61,145,.3)" }}>Ajouter « {namePick} » sur la carte</button>
      {picking && (
        <LocationPicker
          initial={null}
          onConfirm={(p) => {
            setStore({ addresses: [...store.addresses.filter((x) => x.name !== namePick || namePick === "Autre"), { name: namePick, label: p.label, lat: p.lat, lng: p.lng }] });
            setPicking(false);
          }}
          onCancel={() => setPicking(false)}
        />
      )}
    </SubScreen>
  );
}

function Payment({ onBack }: { onBack: () => void }) {
  return (
    <SubScreen title="Paiement" onBack={onBack}>
      <div style={{ background: "#fff", border: "1px solid #E7EAF2", borderRadius: 16, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "15px" }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: "#E6FAF6", display: "flex", alignItems: "center", justifyContent: "center", flex: "none", fontSize: 17 }}>💵</div>
          <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 14, color: "#0A1735" }}>Espèces</div><div style={{ fontSize: 12, color: "#5B6784" }}>Paye le laveur à la fin du lavage</div></div>
          <span style={{ fontSize: 10.5, fontWeight: 800, color: "#046B62", background: "#E6FAF6", padding: "4px 9px", borderRadius: 999 }}>PAR DÉFAUT ✓</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "15px", borderTop: "1px solid #EEF1F7", opacity: 0.55 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: "#FDF1DC", display: "flex", alignItems: "center", justifyContent: "center", flex: "none", fontSize: 17 }}>💳</div>
          <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 14, color: "#0A1735" }}>Carte bancaire</div><div style={{ fontSize: 12, color: "#5B6784" }}>CMI / Visa / Mastercard</div></div>
          <span style={{ fontSize: 10.5, fontWeight: 800, color: "#8A5A00", background: "#FDF1DC", padding: "4px 9px", borderRadius: 999 }}>BIENTÔT</span>
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: "#5B6784", marginTop: 12, lineHeight: 1.5 }}>Aucune donnée bancaire n&apos;est stockée dans l&apos;app. Le paiement en espèces se fait directement avec ton laveur.</div>
    </SubScreen>
  );
}

function Referral({ name, onBack }: { name: string; onBack: () => void }) {
  const code = (name ? name.split(/\s+/)[0].toUpperCase().replace(/[^A-Z]/g, "").slice(0, 10) : "AUTOWASH") + "20";
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const text = `🚿 Autokhidma Wash — ton lavage à domicile à Casablanca. Utilise mon code ${code} pour −20% sur ton 1er lavage !`;
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
    } catch { /* user closed the sheet */ }
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ }
  };
  return (
    <SubScreen title="Parrainage & crédits" onBack={onBack}>
      <div style={{ background: "linear-gradient(120deg,#0B3D91,#06B6A6)", borderRadius: 20, padding: 22, color: "#fff", textAlign: "center" }}>
        <div style={{ fontSize: 13, opacity: 0.85 }}>Ton code de parrainage</div>
        <div className="mono" style={{ fontSize: 30, fontWeight: 500, letterSpacing: ".08em", marginTop: 8 }}>{code}</div>
        <div style={{ fontSize: 12.5, opacity: 0.85, marginTop: 10, lineHeight: 1.5 }}>Partage ton code : ton ami reçoit −20% sur son 1er lavage.</div>
        <button onClick={share} className="tap" style={{ marginTop: 16, border: "none", background: "#fff", color: "#0B3D91", fontFamily: "inherit", fontWeight: 800, fontSize: 14, padding: "12px 22px", borderRadius: 13 }}>{copied ? "Copié ✓" : "Partager mon code"}</button>
      </div>
      <div style={{ background: "#fff", border: "1px solid #E7EAF2", borderRadius: 16, padding: 15, marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div><div style={{ fontWeight: 700, fontSize: 14, color: "#0A1735" }}>Crédit disponible</div><div style={{ fontSize: 12, color: "#5B6784" }}>Gagné via le parrainage</div></div>
        <div className="mono" style={{ fontSize: 18, color: "#0A1735", fontWeight: 500 }}>0 MAD</div>
      </div>
    </SubScreen>
  );
}

function Notifs({ onBack }: { onBack: () => void }) {
  const store = useStore();
  const rows: { key: keyof typeof store.notif; label: string; desc: string }[] = [
    { key: "track", label: "Suivi du laveur", desc: "Arrivée, début et fin du lavage" },
    { key: "promo", label: "Promotions & offres", desc: "Codes promo et bons plans" },
    { key: "reminders", label: "Rappels de RDV", desc: "Rappel avant ton créneau" },
  ];
  return (
    <SubScreen title="Notifications" onBack={onBack}>
      <div style={{ background: "#fff", border: "1px solid #E7EAF2", borderRadius: 16, overflow: "hidden" }}>
        {rows.map((r, i) => {
          const on = store.notif[r.key];
          return (
            <div key={r.key} onClick={() => setStore({ notif: { ...store.notif, [r.key]: !on } })} className="tap" style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 15px", borderBottom: i < rows.length - 1 ? "1px solid #EEF1F7" : "none" }}>
              <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 14, color: "#0A1735" }}>{r.label}</div><div style={{ fontSize: 12, color: "#5B6784" }}>{r.desc}</div></div>
              <div style={{ width: 46, height: 27, borderRadius: 999, background: on ? "#06B6A6" : "#E7EAF2", position: "relative", transition: "background .25s", flex: "none" }}>
                <span style={{ position: "absolute", top: 3, left: on ? 22 : 3, width: 21, height: 21, borderRadius: "50%", background: "#fff", boxShadow: "0 2px 6px rgba(10,23,53,.2)", transition: "left .25s var(--spring-soft, ease)" }} />
              </div>
            </div>
          );
        })}
      </div>
    </SubScreen>
  );
}

function Settings({ onBack }: { onBack: () => void }) {
  const [privacy, setPrivacy] = useState(false);
  const waSupport = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Aide — Autokhidma Wash")}`;
  return (
    <SubScreen title="Paramètres" onBack={onBack}>
      <div style={{ background: "#fff", border: "1px solid #E7EAF2", borderRadius: 16, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 15px", borderBottom: "1px solid #EEF1F7" }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#0A1735" }}>Langue</div>
          <span style={{ fontSize: 12.5, color: "#5B6784", fontWeight: 700 }}>🇫🇷 Français</span>
        </div>
        <div onClick={() => { window.open(waSupport, "_self"); }} className="tap" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 15px", borderBottom: "1px solid #EEF1F7" }}>
          <div><div style={{ fontWeight: 700, fontSize: 14, color: "#0A1735" }}>Aide & support</div><div style={{ fontSize: 12, color: "#5B6784" }}>Réponse sous 24h</div></div>
          <span style={{ color: "#C2CADB", fontSize: 18 }}>›</span>
        </div>
        <div onClick={() => setPrivacy(!privacy)} className="tap" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 15px", borderBottom: "1px solid #EEF1F7" }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#0A1735" }}>Confidentialité</div>
          <span style={{ color: "#C2CADB", fontSize: 18 }}>{privacy ? "▾" : "›"}</span>
        </div>
        {privacy && (
          <div style={{ padding: "0 15px 14px", fontSize: 12.5, color: "#5B6784", lineHeight: 1.55 }}>
            Tes données (profil, adresses, historique) sont stockées sur ton téléphone. Seules tes réservations sont envoyées à nos serveurs pour organiser le lavage. Ta position n&apos;est partagée qu&apos;avec le laveur que tu réserves. Aucune donnée n&apos;est vendue à des tiers.
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 15px" }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#0A1735" }}>À propos</div>
          <span className="mono" style={{ fontSize: 12, color: "#8A94AE" }}>Autokhidma Wash v2.0</span>
        </div>
      </div>
    </SubScreen>
  );
}

function EditProfile({ profile, isLogged, onSave, onBack }: { profile: Profile; isLogged: boolean; onSave: (p: Profile) => void; onBack: () => void }) {
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone);
  const [email, setEmail] = useState(profile.email);
  const [city, setCity] = useState(profile.city);
  return (
    <div className="scrl" style={{ position: "fixed", inset: 0, zIndex: 41, overflowY: "auto", background: "#F6F7FB", animation: "m_modalIn .38s var(--spring-soft, cubic-bezier(.26,1.14,.4,1)) both", paddingBottom: 40 }}>
      <div style={{ ...S.marketHead, display: "flex", alignItems: "center", gap: 12 }}>
        <BackBtn onClick={onBack} />
        <div style={{ fontWeight: 800, fontSize: 18, color: "#0A1735", letterSpacing: "-.02em" }}>Modifier le profil</div>
      </div>
      <div style={{ padding: "18px 18px 0" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <div style={{ position: "relative", width: 78, height: 78, borderRadius: "50%", background: "linear-gradient(135deg,#1A4ED8,#06B6A6)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 26 }}>{name.trim() ? initialsOf(name) : "?"}</div>
        </div>
        <Field label="Nom complet" value={name} onChange={setName} placeholder="Ton nom" />
        <Field label="Téléphone" value={phone} onChange={setPhone} placeholder="+212 6 …" />
        <Field label="Email" value={email} onChange={setEmail} placeholder="ton@email.com" />
        <Field label="Ville" value={city} onChange={setCity} />
        {isLogged && <div style={{ fontSize: 11.5, color: "#8A94AE", marginBottom: 12 }}>Ton nom est aussi mis à jour sur ton compte.</div>}
        <button onClick={() => onSave({ name: name.trim(), phone: phone.trim(), email: email.trim(), city: city.trim() })} className="tap" style={{ width: "100%", marginTop: 8, border: "none", background: "linear-gradient(120deg,#0B3D91,#1A4ED8)", color: "#fff", fontFamily: "inherit", fontWeight: 800, fontSize: 15.5, padding: 15, borderRadius: 15, boxShadow: "0 10px 24px rgba(11,61,145,.32)" }}>Enregistrer</button>
      </div>
    </div>
  );
}
function Field({ label, value, onChange, placeholder, type }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#8A94AE", marginBottom: 7 }}>{label}</div>
      <input type={type ?? "text"} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ width: "100%", border: "1px solid #E7EAF2", background: "#fff", borderRadius: 13, padding: "13px 15px", fontFamily: "inherit", fontSize: 14.5, color: "#0A1735", outline: "none" }} />
    </div>
  );
}

/* ===================== COMMANDE À TON PRIX (inDrive-style) ===================== */
function RequestWash({ formules, formuleId, setFormuleId, clientPos, onPickLocation, onBack, onLaunch }: {
  formules: Formule[]; formuleId: string; setFormuleId: (s: string) => void;
  clientPos: PickedPos | null; onPickLocation: () => void; onBack: () => void; onLaunch: (price: number) => void;
}) {
  const formule = formules.find((f) => f.id === formuleId) ?? formules[0];
  const [price, setPrice] = useState(formule?.price ?? 100);
  useEffect(() => { setPrice(formule?.price ?? 100); }, [formuleId, formule?.price]);
  const bump = (d: number) => setPrice((p) => Math.max(30, p + d));
  return (
    <>
      <div className="scrl" style={{ ...S.scr, paddingBottom: 130 }}>
        <div style={{ ...S.marketHead, display: "flex", alignItems: "center", gap: 12 }}>
          <BackBtn onClick={onBack} />
          <div><div style={{ fontWeight: 800, fontSize: 18, color: "#0A1735", letterSpacing: "-.02em" }}>Commande à ton prix</div><div style={{ fontSize: 12, color: "#5B6784" }}>Toi tu proposes, les laveurs répondent</div></div>
        </div>
        <div style={{ padding: "16px 18px 0" }}>
          <div style={S.bookH}>Ton service</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {formules.map((f) => {
              const on = f.id === formuleId;
              return (
                <div key={f.id} onClick={() => setFormuleId(f.id)} className="tap" style={{ display: "flex", alignItems: "center", gap: 13, background: "#fff", border: `2px solid ${on ? "#1A4ED8" : "#E7EAF2"}`, borderRadius: 16, padding: "13px 15px" }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: f.bg, display: "flex", alignItems: "center", justifyContent: "center", flex: "none", fontSize: 19 }}>{f.icon}</div>
                  <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 14.5, color: "#0A1735" }}>{f.name}</div><div style={{ fontSize: 12, color: "#5B6784" }}>{f.desc}</div></div>
                  <div className="mono" style={{ fontSize: 12.5, color: "#8A94AE" }}>réf. {f.price} MAD</div>
                </div>
              );
            })}
          </div>

          <div style={S.bookH}>Où ?</div>
          <div onClick={onPickLocation} className="tap" style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff", border: "1px solid #E7EAF2", borderRadius: 16, padding: "14px 15px" }}>
            <div style={{ width: 36, height: 36, borderRadius: 11, background: "#E8EEFF", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><Pin size={18} stroke="#0B3D91" /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: clientPos ? "#0A1735" : "#8A94AE" }}>{clientPos?.label ?? "Choisis ta position sur la carte"}</div>
              <div style={{ fontSize: 11.5, color: "#5B6784" }}>{clientPos ? "Le laveur viendra exactement ici" : "GPS ou repère sur la carte"}</div>
            </div>
            <span style={{ color: "#8A94AE" }}>›</span>
          </div>

          <div style={S.bookH}>Ton prix</div>
          <div style={{ background: "#fff", border: "1px solid #E7EAF2", borderRadius: 20, padding: "18px 16px", textAlign: "center" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18 }}>
              <button onClick={() => bump(-10)} className="tap" style={S.stepBtn}>−</button>
              <div>
                <span className="mono" style={{ fontSize: 38, fontWeight: 500, color: "#0A1735", letterSpacing: "-.02em" }}>{price}</span>
                <span className="mono" style={{ fontSize: 15, color: "#8A94AE", marginLeft: 6 }}>MAD</span>
              </div>
              <button onClick={() => bump(10)} className="tap" style={{ ...S.stepBtn, background: "#0B3D91", color: "#fff", border: "none" }}>+</button>
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 14 }}>
              {[formule.price - 20, formule.price, formule.price + 20].filter((p) => p >= 30).map((p) => (
                <span key={p} onClick={() => setPrice(p)} className="tap" style={{ fontSize: 12.5, fontWeight: 700, padding: "7px 13px", borderRadius: 999, border: `1.5px solid ${price === p ? "#1A4ED8" : "#E7EAF2"}`, background: price === p ? "#E8EEFF" : "#F6F7FB", color: price === p ? "#0B3D91" : "#5B6784" }}>{p} MAD</span>
              ))}
            </div>
            <div style={{ fontSize: 11.5, color: "#8A94AE", marginTop: 12 }}>Prix de référence {formule.name} : <b style={{ color: "#5B6784" }}>{formule.price} MAD</b> · un bon prix reçoit plus d&apos;offres</div>
          </div>
        </div>
      </div>
      <div style={S.cta}>
        <button onClick={() => onLaunch(price)} className="tap" style={S.ctaBtn}>Lancer la demande · {price} MAD</button>
      </div>
    </>
  );
}

/* ===================== OFFERS (real feed + demo fallback) ===================== */
type Offer = { w: WasherLite; price: number; note: string; real: boolean };

type RealOfferRow = {
  id: string; price: number; eta_minutes: number | null; status: string;
  washer: { id: string; name: string; initials: string; color: string; rating: number; zone: string; eta_minutes: number } | null;
};

function Offers({ list, formule, requestId, proposedPrice, setProposedPrice, posLabel, onAccept, onCancel }: {
  list: WasherLite[]; formule: Formule; requestId: string | null; proposedPrice: number; setProposedPrice: (n: number) => void;
  posLabel: string; onAccept: (w: WasherLite, price: number) => void; onCancel: () => void;
}) {
  const [realOffers, setRealOffers] = useState<Offer[]>([]);
  const [demoOffers, setDemoOffers] = useState<Offer[]>([]);
  const [refused, setRefused] = useState<string[]>([]);
  const pool = useMemo(() => list.filter((w) => w.available_now), [list]);
  const hasRealRef = useRef(false);

  // REAL: poll wash_offers for this request — offers sent by actual washers
  // (or by you, from the admin simulator) appear here live.
  useEffect(() => {
    if (!requestId) return;
    let stop = false;
    const tick = async () => {
      const { data } = await supabase
        .from("wash_offers")
        .select("id, price, eta_minutes, status, washer:washers(id, name, initials, color, rating, zone, eta_minutes)")
        .eq("request_id", requestId)
        .neq("status", "withdrawn");
      if (stop || !data) return;
      const mapped: Offer[] = (data as unknown as RealOfferRow[])
        .filter((r) => r.washer)
        .map((r) => {
          const base = list.find((w) => w.id === r.washer!.id);
          const w: WasherLite = base ?? {
            id: r.washer!.id, name: r.washer!.name, initials: r.washer!.initials, color: r.washer!.color,
            rating: r.washer!.rating, reviews_count: 0, zone: r.washer!.zone, eta_minutes: r.eta_minutes ?? r.washer!.eta_minutes,
            distance_km: 1, base_price: r.price, available_now: true, bio: "", is_super: false, lat: null, lng: null,
          };
          return { w, price: r.price, note: r.price <= proposedPrice ? "Accepte ton prix" : `Contre-offre`, real: true };
        });
      if (mapped.length) hasRealRef.current = true;
      setRealOffers(mapped);
    };
    tick();
    const iv = setInterval(tick, 2500);
    return () => { stop = true; clearInterval(iv); };
  }, [requestId, list, proposedPrice]);

  // DEMO fallback: if no real washer answered after a while, simulated
  // offers keep the flow alive (clearly part of the standard UX).
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const plan: { at: number; idx: number; delta: number }[] = [
      { at: 5000, idx: 0, delta: 0 },
      { at: 7500, idx: 1, delta: 10 },
      { at: 10000, idx: 2, delta: 20 },
    ];
    plan.forEach(({ at, idx, delta }) => {
      const w = pool[idx];
      if (!w) return;
      timers.push(setTimeout(() => {
        if (hasRealRef.current) return; // real offers arrived — no demo noise
        setDemoOffers((o) => (o.some((x) => x.w.id === w.id) ? o : [...o, { w, price: proposedPrice + delta, note: delta === 0 ? "Accepte ton prix" : `Contre-offre +${delta}`, real: false }]));
      }, at));
    });
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const offers = (realOffers.length ? realOffers : demoOffers).filter((o) => !refused.includes(o.w.id));

  const raise = () => {
    const next = proposedPrice + 10;
    setProposedPrice(next);
    if (requestId) {
      supabase.from("wash_requests").update({ proposed_price: next }).eq("id", requestId).then(() => {});
    }
    setDemoOffers((o) => o.map((x) => (x.note === "Accepte ton prix" ? { ...x, price: next } : x)));
  };

  return (
    <div className="scrl" style={{ ...S.scr, paddingBottom: 40 }}>
      <div style={{ ...S.marketHead, display: "flex", alignItems: "center", gap: 12 }}>
        <BackBtn onClick={onCancel} />
        <div style={{ flex: 1 }}><div style={{ fontWeight: 800, fontSize: 18, color: "#0A1735", letterSpacing: "-.02em" }}>Offres des laveurs</div><div style={{ fontSize: 12, color: "#5B6784" }}>{formule.name} · {posLabel}</div></div>
        <span className="mono" style={{ fontSize: 14, fontWeight: 500, color: "#0B3D91", background: "#E8EEFF", padding: "7px 11px", borderRadius: 11 }}>{proposedPrice} MAD</span>
      </div>
      <div style={{ padding: "16px 18px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9, background: "#fff", border: "1px dashed #C9D2E4", borderRadius: 14, padding: "12px 14px", marginBottom: 14 }}>
          <span style={S.liveDotWrap}><span style={S.liveDot} /></span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "#1B2B54" }}>{offers.length ? `${offers.length} offre(s) reçue(s) · d'autres arrivent…` : "Recherche de laveurs à proximité…"}</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {offers.map((o) => {
            const same = o.price <= proposedPrice;
            return (
              <div key={o.w.id} style={{ background: "#fff", border: `2px solid ${same ? "#06B6A6" : "#E7EAF2"}`, borderRadius: 18, padding: 15, boxShadow: "0 6px 18px rgba(10,23,53,.06)", animation: "m_popIn .5s cubic-bezier(.22,1,.36,1) both" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ position: "relative", width: 46, height: 46, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 15, flex: "none", background: o.w.color }}>{o.w.initials}<span style={S.wBadge}><Check size={9} stroke="#fff" sw={3.5} /></span></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14.5, color: "#0A1735" }}>{o.w.name}</div>
                    <div style={{ fontSize: 12, color: "#5B6784" }}>★ {o.w.rating} · {o.w.zone} · ⏱ {o.w.eta_minutes} min</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="mono" style={{ fontSize: 19, fontWeight: 500, color: same ? "#046B62" : "#0A1735" }}>{o.price} <span style={{ fontSize: 11 }}>MAD</span></div>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: same ? "#06B6A6" : "#E2A93A" }}>{o.note}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 9, marginTop: 13 }}>
                  <button onClick={() => setRefused((r) => [...r, o.w.id])} className="tap" style={{ flex: 1, background: "#F6F7FB", border: "1px solid #E7EAF2", color: "#5B6784", fontFamily: "inherit", fontWeight: 700, fontSize: 13.5, padding: 12, borderRadius: 13 }}>Refuser</button>
                  <button onClick={() => onAccept(o.w, o.price)} className="tap" style={{ flex: 2, background: same ? "linear-gradient(120deg,#06B6A6,#0B7A6D)" : "linear-gradient(120deg,#0B3D91,#1A4ED8)", border: "none", color: "#fff", fontFamily: "inherit", fontWeight: 800, fontSize: 13.5, padding: 12, borderRadius: 13 }}>Accepter · {o.price} MAD</button>
                </div>
              </div>
            );
          })}
        </div>

        <button onClick={raise} className="tap" style={{ width: "100%", marginTop: 16, background: "#fff", border: "1.5px solid #1A4ED8", color: "#0B3D91", fontFamily: "inherit", fontWeight: 800, fontSize: 14, padding: 13, borderRadius: 14 }}>Augmenter mon prix · +10 MAD</button>
        <button onClick={onCancel} className="tap" style={{ width: "100%", marginTop: 10, background: "none", border: "none", color: "#8A94AE", fontFamily: "inherit", fontWeight: 700, fontSize: 13, padding: 8 }}>Annuler la demande</button>
      </div>
    </div>
  );
}

/* ===================== DEVENIR LAVEUR (Pro landing + real application) ===================== */
const PRO_BENEFITS = [
  { icon: "💰", bg: "#FDF1DC", title: "Jusqu'à 6 000 MAD/mois", desc: "Tu gardes l'essentiel de chaque lavage." },
  { icon: "🕒", bg: "#E8EEFF", title: "Horaires 100% libres", desc: "Tu te connectes quand tu veux, où tu veux." },
  { icon: "⚡", bg: "#E6FAF6", title: "Paiement rapide", desc: "Versement chaque semaine, suivi en direct." },
  { icon: "📍", bg: "#F1EBFB", title: "Clients près de toi", desc: "On t'envoie les demandes de ton quartier." },
  { icon: "🛡️", bg: "#E8EEFF", title: "Assuré & accompagné", desc: "Assurance dégâts + support 7j/7." },
];
const PRO_REQS = [
  { title: "18 ans ou plus", desc: "Pièce d'identité (CIN) valide." },
  { title: "Smartphone", desc: "Android 8+ ou iPhone, avec data & GPS." },
  { title: "Moyen de déplacement", desc: "Scooter, voiture ou vélo pour te déplacer." },
  { title: "Matériel de lavage", desc: "Ton kit, ou commande le kit Autokhidma de départ." },
  { title: "Vérification", desc: "Casier vierge + court entretien de validation." },
];
function ProLanding({ onBack, profile }: { onBack: () => void; profile: Profile }) {
  const [applying, setApplying] = useState(false);
  return (
    <>
      <div className="scrl" style={{ ...S.scr, paddingBottom: 130 }}>
        <div style={{ position: "relative", background: "radial-gradient(560px 360px at 75% -4%,#1B3E8F,#0A1735 70%)", borderRadius: "0 0 30px 30px", padding: "calc(env(safe-area-inset-top,0px) + 24px) 22px 30px", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 30, right: -40, width: 170, height: 170, borderRadius: "50%", background: "radial-gradient(circle,rgba(6,182,166,.45),transparent 70%)", filter: "blur(10px)", animation: "m_orb 8s ease-in-out infinite" }} />
          <button onClick={onBack} className="tap" style={{ position: "relative", width: 40, height: 40, borderRadius: 13, background: "rgba(255,255,255,.12)", border: "none", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg></button>
          <div style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.16)", padding: "6px 12px", borderRadius: 999, margin: "18px 0 12px" }}><span style={{ fontSize: 13 }}>💧</span><span style={{ color: "#fff", fontSize: 11.5, fontWeight: 700 }}>Autokhidma Laveur · l&apos;app des pros</span></div>
          <div style={{ position: "relative", color: "#fff", fontWeight: 800, fontSize: 27, lineHeight: 1.13, letterSpacing: "-.03em" }}>Lave des voitures,<br /><span style={S.gradWash}>gagne ta liberté.</span></div>
          <div style={{ position: "relative", color: "rgba(255,255,255,.7)", fontSize: 13.5, marginTop: 9, lineHeight: 1.5, maxWidth: 300 }}>Rejoins les laveurs Autokhidma à Casablanca. Tu choisis tes horaires, on t&apos;apporte les clients.</div>
          <div style={{ position: "relative", display: "flex", gap: 22, marginTop: 20 }}>
            <div><div style={{ color: "#7FD4F5", fontWeight: 800, fontSize: 20 }}>6 000<span style={{ fontSize: 12, fontWeight: 600, opacity: 0.7 }}> MAD</span></div><div style={{ color: "rgba(255,255,255,.55)", fontSize: 11 }}>/ mois possible</div></div>
            <div><div style={{ color: "#fff", fontWeight: 800, fontSize: 20 }}>100%</div><div style={{ color: "rgba(255,255,255,.55)", fontSize: 11 }}>horaires libres</div></div>
            <div><div style={{ color: "#fff", fontWeight: 800, fontSize: 20 }}>7j/7</div><div style={{ color: "rgba(255,255,255,.55)", fontSize: 11 }}>paiement rapide</div></div>
          </div>
        </div>
        <div style={{ padding: "22px 18px 0" }}>
          <div style={{ ...S.h2, marginBottom: 13 }}>Pourquoi devenir laveur ?</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {PRO_BENEFITS.map((b) => (
              <div key={b.title} style={{ display: "flex", gap: 13, alignItems: "center", background: "#fff", border: "1px solid #E7EAF2", borderRadius: 16, padding: "14px 15px", boxShadow: "0 4px 14px rgba(10,23,53,.04)" }}>
                <div style={{ width: 42, height: 42, borderRadius: 13, background: b.bg, display: "flex", alignItems: "center", justifyContent: "center", flex: "none", fontSize: 20 }}>{b.icon}</div>
                <div><div style={{ fontWeight: 700, fontSize: 14.5, color: "#0A1735" }}>{b.title}</div><div style={{ fontSize: 12.5, color: "#5B6784", marginTop: 1 }}>{b.desc}</div></div>
              </div>
            ))}
          </div>
          <div style={{ ...S.h2, margin: "24px 0 13px" }}>Ce qu&apos;il te faut</div>
          <div style={{ background: "#fff", border: "1px solid #E7EAF2", borderRadius: 18, overflow: "hidden" }}>
            {PRO_REQS.map((r, i) => (
              <div key={r.title} style={{ display: "flex", gap: 12, alignItems: "center", padding: "14px 15px", borderBottom: i < PRO_REQS.length - 1 ? "1px solid #EEF1F7" : "none" }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#E6FAF6", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><Check size={13} stroke="#06B6A6" sw={3.2} /></div>
                <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 13.5, color: "#0A1735" }}>{r.title}</div><div style={{ fontSize: 12, color: "#5B6784" }}>{r.desc}</div></div>
              </div>
            ))}
          </div>
          <div style={{ ...S.h2, margin: "24px 0 13px" }}>Comment commencer</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[["01", "#E8EEFF", "#0B3D91", "Envoie ta candidature (2 min)"], ["02", "#E6FAF6", "#046B62", "Envoie tes documents (CIN, selfie)"], ["03", "#FDF1DC", "#8A5A00", "Validation sous 48h, puis tes 1ers lavages"]].map(([n, bg, fg, t]) => (
              <div key={n} style={{ display: "flex", gap: 13, alignItems: "center" }}><div className="mono" style={{ width: 34, height: 34, borderRadius: 11, background: bg, color: fg, fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flex: "none" }}>{n}</div><div style={{ fontSize: 13.5, color: "#1B2B54", fontWeight: 600 }}>{t}</div></div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ ...S.cta, paddingTop: 13 }}>
        <button onClick={() => setApplying(true)} className="tap" style={{ ...S.ctaBtn, background: "linear-gradient(120deg,#0B7A6D,#06B6A6)", boxShadow: "0 10px 24px rgba(6,182,166,.32)" }}>Envoyer ma candidature →</button>
      </div>
      {applying && <ProApply profile={profile} onClose={() => setApplying(false)} />}
    </>
  );
}

function ProApply({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone);
  const [city, setCity] = useState(profile.city || "Casablanca");
  const [transport, setTransport] = useState("Scooter");
  const send = () => {
    const subject = "Candidature laveur — Autokhidma Wash";
    const body = `Bonjour,\n\nJe veux devenir laveur partenaire Autokhidma.\n\nNom : ${name}\nTéléphone : ${phone}\nVille : ${city}\nDéplacement : ${transport}\n\nMerci !`;
    window.open(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, "_self");
  };
  const ok = name.trim().length >= 2 && phone.trim().length >= 9;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 45, background: "rgba(10,23,53,.5)", display: "flex", alignItems: "flex-end" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", background: "#fff", borderRadius: "24px 24px 0 0", padding: "14px 20px calc(env(safe-area-inset-bottom,0px) + 20px)", animation: "m_sheetUp .45s var(--spring, cubic-bezier(.3,1.36,.44,1)) both" }}>
        <div style={{ width: 40, height: 4, background: "#E7EAF2", borderRadius: 999, margin: "0 auto 16px" }} />
        <div style={{ fontWeight: 800, fontSize: 18, color: "#0A1735", marginBottom: 4 }}>Ta candidature laveur</div>
        <div style={{ fontSize: 12.5, color: "#5B6784", marginBottom: 16 }}>On te répond sous 48h pour l&apos;entretien.</div>
        <Field label="Nom complet" value={name} onChange={setName} placeholder="Ton nom" />
        <Field label="Téléphone" value={phone} onChange={setPhone} placeholder="+212 6 …" />
        <Field label="Ville" value={city} onChange={setCity} />
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#8A94AE", marginBottom: 7 }}>Déplacement</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          {["Scooter", "Voiture", "Vélo"].map((t) => (
            <span key={t} onClick={() => setTransport(t)} className="tap" style={{ flex: 1, textAlign: "center", background: transport === t ? "#E8EEFF" : "#F6F7FB", border: `1.5px solid ${transport === t ? "#1A4ED8" : "#E7EAF2"}`, color: transport === t ? "#0B3D91" : "#5B6784", fontSize: 12.5, fontWeight: 700, padding: "10px 0", borderRadius: 12 }}>{t}</span>
          ))}
        </div>
        <button onClick={send} disabled={!ok} className="tap" style={{ ...S.ctaBtn, background: ok ? "linear-gradient(120deg,#0B7A6D,#06B6A6)" : "#C2CADB", boxShadow: ok ? "0 10px 24px rgba(6,182,166,.32)" : "none" }}>Envoyer ma candidature ✉️</button>
      </div>
    </div>
  );
}

/* ===================== LOGIN (real Supabase email auth, optional) ===================== */
function Login({ onContinue }: { onContinue: () => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async () => {
    setErr(null); setInfo(null);
    if (!email.includes("@") || password.length < 6) {
      setErr("Email valide + mot de passe (6 caractères min).");
      return;
    }
    if (mode === "signup" && name.trim().length < 2) {
      setErr("Ton nom est requis pour créer le compte.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await signUp(email.trim(), password, name.trim());
        if (error) { setErr(error.message === "User already registered" ? "Un compte existe déjà avec cet email." : error.message); return; }
        setStore({ profile: { ...((): Profile => ({ name: name.trim(), phone: "", email: email.trim(), city: "Casablanca" }))() } });
        if (!data.session) { setInfo("Compte créé ✓ — vérifie ta boîte mail pour confirmer, puis connecte-toi."); setMode("login"); return; }
        onContinue();
      } else {
        const { error } = await signIn(email.trim(), password);
        if (error) { setErr(/confirm/i.test(error.message) ? "Confirme d'abord ton email (lien reçu par mail)." : "Email ou mot de passe incorrect."); return; }
        onContinue();
      }
    } finally {
      setBusy(false);
    }
  };

  const inputStyle: CSSProperties = { width: "100%", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 15, padding: "15px 16px", color: "#fff", fontFamily: "inherit", fontSize: 15, outline: "none", marginBottom: 11 };
  return (
    <div className="scrl" style={{ position: "fixed", inset: 0, zIndex: 28, background: "radial-gradient(600px 460px at 50% 12%,#16357F,#0A1735 68%)", display: "flex", flexDirection: "column", padding: "0 26px", overflowY: "auto", animation: "var(--scr-anim, m_slideInRight) var(--scr-dur, .42s) var(--spring-soft, cubic-bezier(.26,1.14,.4,1)) both" }}>
      <div style={{ position: "absolute", top: -50, right: -50, width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(circle,rgba(6,182,166,.4),transparent 70%)", filter: "blur(18px)", animation: "m_orb 8s ease-in-out infinite" }} />
      <div style={{ marginTop: "calc(env(safe-area-inset-top,0px) + 54px)", animation: "m_fadeUp .6s both" }}>
        <div style={{ width: 64, height: 64, borderRadius: 20, background: "linear-gradient(135deg,#1A4ED8,#06B6A6)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 16px 36px rgba(6,182,166,.45)" }}><Drop size={34} stroke="#fff" sw={1.9} /></div>
        <div style={{ color: "#fff", fontWeight: 800, fontSize: 26, letterSpacing: "-.02em", marginTop: 20, lineHeight: 1.15 }}>{mode === "login" ? "Content de te revoir 👋" : "Crée ton compte"}</div>
        <div style={{ color: "rgba(255,255,255,.6)", fontSize: 14, marginTop: 8 }}>{mode === "login" ? "Connecte-toi pour retrouver ton historique partout." : "Ton historique et tes adresses te suivront partout."}</div>
      </div>
      <div style={{ marginTop: 26, animation: "m_fadeUp .6s .12s both" }}>
        {mode === "signup" && <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom complet" style={inputStyle} autoComplete="name" />}
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ton@email.com" style={inputStyle} type="email" autoComplete="email" inputMode="email" autoCapitalize="none" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mot de passe" style={inputStyle} type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} />
        {err && <div style={{ color: "#FFB4B4", fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>{err}</div>}
        {info && <div style={{ color: "#7FD4F5", fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>{info}</div>}
        <button onClick={submit} disabled={busy} className="tap" style={{ width: "100%", marginTop: 4, border: "none", background: "#fff", color: "#0B3D91", fontFamily: "inherit", fontWeight: 800, fontSize: 15.5, padding: 16, borderRadius: 15, opacity: busy ? 0.6 : 1 }}>{busy ? "Un instant…" : mode === "login" ? "Se connecter →" : "Créer mon compte →"}</button>
        <button onClick={() => { setMode(mode === "login" ? "signup" : "login"); setErr(null); setInfo(null); }} className="tap" style={{ width: "100%", marginTop: 12, background: "none", border: "none", color: "#7FD4F5", fontFamily: "inherit", fontWeight: 700, fontSize: 13.5 }}>{mode === "login" ? "Pas de compte ? Crée-en un" : "Déjà un compte ? Connecte-toi"}</button>
        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "18px 0" }}><div style={{ flex: 1, height: 1, background: "rgba(255,255,255,.14)" }} /><span style={{ color: "rgba(255,255,255,.4)", fontSize: 12 }}>ou</span><div style={{ flex: 1, height: 1, background: "rgba(255,255,255,.14)" }} /></div>
        <button onClick={onContinue} className="tap" style={{ width: "100%", border: "1px solid rgba(255,255,255,.2)", background: "rgba(255,255,255,.06)", color: "#fff", fontFamily: "inherit", fontWeight: 700, fontSize: 14.5, padding: 15, borderRadius: 15 }}>Continuer sans compte</button>
      </div>
      <div style={{ marginTop: "auto", paddingTop: 20, marginBottom: "calc(env(safe-area-inset-bottom,0px) + 24px)", textAlign: "center", color: "rgba(255,255,255,.4)", fontSize: 11.5, animation: "m_fadeUp .6s .2s both" }}>En continuant, tu acceptes nos Conditions &amp; Confidentialité.</div>
    </div>
  );
}

/* ===================== BOTTOM TAB (Glovo-style sliding pill) ===================== */
function BottomTab({ screen, go }: { screen: Screen; go: (s: Screen) => void }) {
  const tabs: { key: Screen; label: string; icon: GlyphTab }[] = [
    { key: "home", label: "Accueil", icon: "home" },
    { key: "market", label: "Réserver", icon: "search" },
    { key: "tracking", label: "Suivi", icon: "track" },
    { key: "account", label: "Compte", icon: "user" },
  ];
  const idx = Math.max(0, tabs.findIndex((t) => t.key === screen));
  return (
    <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 20, background: "rgba(255,255,255,.94)", backdropFilter: "blur(14px)", borderTop: "1px solid #EEF1F7", padding: "8px 14px calc(env(safe-area-inset-bottom,0px) + 10px)" }}>
      <div style={{ position: "relative", display: "flex" }}>
        <div style={{ position: "absolute", top: -2, left: 0, width: "25%", height: "calc(100% + 4px)", transform: `translateX(${idx * 100}%)`, transition: "transform .45s var(--spring, cubic-bezier(.3,1.36,.44,1))", display: "flex", alignItems: "flex-start", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{ width: 52, height: 30, borderRadius: 999, background: "#E8EEFF" }} />
        </div>
        {tabs.map((t) => {
          const active = screen === t.key;
          return (
            <div key={t.key} onClick={() => go(t.key)} className="tap" style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, color: active ? "#0B3D91" : "#8A94AE", transition: "color .25s" }}>
              <span style={{ display: "flex", animation: active ? "m_tabPop .4s var(--spring, cubic-bezier(.3,1.36,.44,1))" : "none" }}><TabIcon icon={t.icon} /></span>
              <span style={{ fontSize: 10.5, fontWeight: 700 }}>{t.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
type GlyphTab = "home" | "search" | "track" | "user";
function TabIcon({ icon }: { icon: GlyphTab }) {
  const c = { width: 23, height: 23, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (icon) {
    case "home": return (<svg {...c}><path d="M3 11l9-8 9 8M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9" /></svg>);
    case "search": return (<svg {...c}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>);
    case "track": return (<svg {...c}><path d="M9 20l-5 2V6l5-2 6 2 5-2v16l-5 2-6-2Z" /><path d="M9 4v16M15 6v16" /></svg>);
    case "user": return (<svg {...c}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.5-6 8-6s8 2 8 6" /></svg>);
  }
}

/* ===================== shared pieces ===================== */
function HeroBubble({ label, delay, float, grad, shadow, icon, sparkle, onClick }: { label: string; delay: number; float: number; grad: string; shadow: string; icon: GlyphIcon; sparkle?: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} className="tap bub" style={{ flex: 1, textAlign: "center", animation: `m_popIn .55s ${delay}s cubic-bezier(.22,1,.36,1) both` }}>
      {/* the bubble rides the wave: rise + tilt, staggered per bubble */}
      <div data-bub-float style={{ position: "relative", width: 78, height: 78, margin: "0 auto", animation: `m_wave 3.4s ease-in-out ${float}s infinite` }}>
        {/* 3D sphere: gradient + top gloss + bottom inner shade */}
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: grad, boxShadow: `0 16px 28px ${shadow}, inset 0 3px 6px rgba(255,255,255,.5), inset 0 -8px 14px rgba(5,15,40,.28)` }} />
        <div style={{ position: "absolute", top: 8, left: 14, width: 30, height: 17, borderRadius: "50%", background: "rgba(255,255,255,.5)", filter: "blur(3px)", transform: "rotate(-18deg)" }} />
        <div style={{ position: "absolute", bottom: 11, right: 13, width: 14, height: 8, borderRadius: "50%", background: "rgba(255,255,255,.18)", filter: "blur(2px)" }} />
        {sparkle && <span style={{ position: "absolute", top: -4, right: 5, fontSize: 14 }}>✦</span>}
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><Glyph icon={icon} stroke="#fff" size={icon === "shield" || icon === "user" ? 31 : 32} /></div>
      </div>
      {/* water shadow under the bubble — breathes opposite to the wave */}
      <div style={{ width: 46, height: 9, margin: "5px auto 0", borderRadius: "50%", background: "radial-gradient(closest-side, rgba(10,23,53,.32), transparent 72%)", animation: `m_waveShadow 3.4s ease-in-out ${float}s infinite` }} />
      <div style={{ fontSize: 12, fontWeight: 800, color: "#0A1735", marginTop: 6, letterSpacing: "-.01em" }}>{label}</div>
    </div>
  );
}
function WasherRow({ w, onClick, i = 0 }: { w: WasherLite; onClick: () => void; i?: number }) {
  return (
    <div onClick={onClick} className="tap" style={{ ...S.wrow, animation: `m_fadeUp .5s ${0.08 + i * 0.06}s var(--ease-out, cubic-bezier(.22,1,.36,1)) both` }}>
      <div style={{ ...S.wrowAvatar, background: w.color }}>{w.initials}<span style={S.wBadge}><Check size={9} stroke="#fff" sw={3.5} /></span></div>
      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 14, color: "#0A1735" }}>{w.name}</div><div style={{ fontSize: 12, color: "#5B6784" }}>★ {w.rating} · {w.zone} · {w.eta_minutes} min</div></div>
      <div style={{ textAlign: "right" }}><div className="mono" style={{ fontSize: 12, color: "#0A1735", fontWeight: 500 }}>dès {w.base_price} MAD</div><div style={{ fontSize: 11, fontWeight: 700, color: w.available_now ? "#06B6A6" : "#8A94AE" }}>{w.available_now ? "Disponible" : "Occupé"}</div></div>
    </div>
  );
}
function BackBtn({ onClick }: { onClick: () => void }) {
  return <button onClick={onClick} className="tap" style={{ width: 40, height: 40, borderRadius: 13, background: "#F6F7FB", border: "1px solid #E7EAF2", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#0A1735" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg></button>;
}

/* ===================== icons ===================== */
type GlyphIcon = "bolt" | "drop" | "shield" | "user";
function Glyph({ icon, stroke, size }: { icon: GlyphIcon; stroke: string; size: number }) {
  const c = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke, strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (icon) {
    case "bolt": return (<svg {...c}><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" /></svg>);
    case "drop": return (<svg {...c}><path d="M12 2.5C12 2.5 6 9 6 13.2A6 6 0 0 0 18 13.2C18 9 12 2.5 12 2.5Z" /></svg>);
    case "shield": return (<svg {...c}><path d="M12 3l7 3v5c0 4.6-3 7-7 9-4-2-7-4.4-7-9V6l7-3Z" /><path d="m9 12 2 2 4-4" /></svg>);
    case "user": return (<svg {...c}><circle cx="12" cy="8" r="4" /><path d="M5 21c0-4 3.5-6 7-6s7 2 7 6" /></svg>);
  }
}
function Drop({ size, stroke, sw }: { size: number; stroke: string; sw: number }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.5C12 2.5 6 9 6 13.2A6 6 0 0 0 18 13.2C18 9 12 2.5 12 2.5Z" /><path d="M9.4 13.4a2.6 2.6 0 0 0 2.6 2.6" /></svg>);
}
function Pin({ size, stroke }: { size: number; stroke: string }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s7-6.4 7-12a7 7 0 0 0-14 0c0 5.6 7 12 7 12Z" /><circle cx="12" cy="9" r="2.4" /></svg>);
}
function Search({ size, stroke }: { size: number; stroke: string }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={2.2} strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>);
}
function Check({ size, stroke, sw }: { size: number; stroke: string; sw: number }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4 10-10" /></svg>);
}

/* ===================== styles ===================== */
const mapBtn: CSSProperties = { width: 44, height: 44, borderRadius: 14, background: "#fff", border: "none", boxShadow: "0 6px 18px rgba(10,23,53,.16)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" };
const S: Record<string, CSSProperties> = {
  splash: { position: "fixed", inset: 0, zIndex: 30, background: "radial-gradient(700px 500px at 50% 18%,#16357F 0%,#0A1735 60%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  orb: { position: "absolute", borderRadius: "50%", filter: "blur(22px)" },
  orbA: { top: -60, left: -50, width: 240, height: 240, background: "radial-gradient(circle,rgba(6,182,166,.55),transparent 70%)", animation: "m_orb 7s ease-in-out infinite" },
  orbB: { bottom: -40, right: -60, width: 260, height: 260, background: "radial-gradient(circle,rgba(127,212,245,.4),transparent 70%)", animation: "m_orb 9s ease-in-out infinite reverse" },
  splashLogo: { position: "relative", width: 108, height: 108, borderRadius: 30, background: "linear-gradient(135deg,#1A4ED8,#06B6A6)", boxShadow: "0 24px 50px -12px rgba(6,182,166,.6)", display: "flex", alignItems: "center", justifyContent: "center" },
  gradWash: { background: "linear-gradient(120deg,#7FD4F5,#06B6A6)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" },
  splashTag: { marginTop: 6, fontSize: 11, letterSpacing: ".12em", color: "rgba(255,255,255,.55)", textTransform: "uppercase" },
  splashBar: { position: "absolute", bottom: 64, width: 160, height: 4, background: "rgba(255,255,255,.12)", borderRadius: 999, overflow: "hidden" },
  splashBarFill: { position: "absolute", top: 0, left: 0, height: "100%", width: "38%", background: "linear-gradient(90deg,#1A4ED8,#06B6A6)", borderRadius: 999, animation: "m_sweep 1.2s cubic-bezier(.5,0,.5,1) infinite" },
  splashLoad: { position: "absolute", bottom: 40, fontSize: 11, color: "rgba(255,255,255,.45)", letterSpacing: ".1em" },

  heroWrap: { position: "relative", minHeight: "100dvh", overflowY: "auto", animation: "var(--scr-anim, m_slideInRight) var(--scr-dur, .42s) var(--spring-soft, cubic-bezier(.26,1.14,.4,1)) both", background: "#F6F7FB", paddingBottom: "calc(env(safe-area-inset-bottom,0px) + 88px)" },
  hero: { position: "relative", background: "radial-gradient(600px 380px at 70% 0%,#1B3E8F,#0A1735 70%)", overflow: "hidden", borderRadius: "0 0 30px 30px" },
  heroOrb: { position: "absolute", borderRadius: "50%", filter: "blur(8px)" },
  heroInner: { position: "relative", padding: "calc(env(safe-area-inset-top,0px) + 26px) 20px 40px" },
  avatarSm: { width: 38, height: 38, borderRadius: "50%", background: "linear-gradient(135deg,#0B3D91,#1A4ED8)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 13 },
  liveBadge: { display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.16)", padding: "6px 12px", borderRadius: 999, marginBottom: 14 },
  liveDotWrap: { position: "relative", width: 8, height: 8 },
  liveDot: { position: "absolute", inset: 0, borderRadius: "50%", background: "#06B6A6", animation: "m_dotPulse 1.6s infinite" },
  heroTitle: { position: "relative", color: "#fff", fontWeight: 800, fontSize: 28, lineHeight: 1.12, letterSpacing: "-.03em" },
  heroSearch: { position: "relative", display: "flex", alignItems: "center", gap: 10, background: "#fff", borderRadius: 15, padding: "13px 15px", marginTop: 18, boxShadow: "0 12px 26px rgba(0,0,0,.28)" },
  heroBubbles: { marginTop: -20, padding: "0 12px", position: "relative", zIndex: 2, display: "flex", justifyContent: "space-between", gap: 4 },

  bidCta: { position: "relative", overflow: "hidden", borderRadius: 20, background: "linear-gradient(115deg,#E2A93A,#D97706)", padding: "17px 18px", boxShadow: "0 14px 30px rgba(217,119,6,.35)" },
  stepBtn: { width: 46, height: 46, borderRadius: 15, background: "#F6F7FB", border: "1.5px solid #E7EAF2", color: "#0A1735", fontSize: 24, fontWeight: 800, fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" },
  promo: { position: "relative", overflow: "hidden", borderRadius: 20, background: "linear-gradient(115deg,#0B3D91,#06B6A6)", padding: 20, color: "#fff", boxShadow: "0 14px 30px rgba(11,61,145,.3)" },
  promoBlob: { position: "absolute", right: -20, bottom: -26, width: 140, height: 140, borderRadius: "50%", background: "rgba(127,212,245,.22)" },
  promoCode: { position: "relative", fontSize: 10, letterSpacing: ".1em", background: "rgba(255,255,255,.18)", display: "inline-block", padding: "3px 9px", borderRadius: 999 },
  promoTitle: { position: "relative", fontWeight: 800, fontSize: 21, marginTop: 9, letterSpacing: "-.02em" },
  h2: { fontWeight: 800, fontSize: 17, color: "#0A1735", letterSpacing: "-.02em" },
  wrow: { display: "flex", alignItems: "center", gap: 13, background: "#fff", border: "1px solid #E7EAF2", borderRadius: 18, padding: "13px 15px", boxShadow: "0 4px 14px rgba(10,23,53,.05)" },
  wrowAvatar: { position: "relative", width: 46, height: 46, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 15, flex: "none" },
  wBadge: { position: "absolute", bottom: -2, right: -2, width: 18, height: 18, borderRadius: "50%", background: "#1A4ED8", border: "2px solid #fff", display: "flex", alignItems: "center", justifyContent: "center" },

  scr: { position: "fixed", inset: 0, overflowY: "auto", animation: "var(--scr-anim, m_slideInRight) var(--scr-dur, .42s) var(--spring-soft, cubic-bezier(.26,1.14,.4,1)) both", background: "#F6F7FB", paddingBottom: "calc(env(safe-area-inset-bottom,0px) + 88px)" },
  marketHead: { background: "#fff", borderBottom: "1px solid #EEF1F7", padding: "calc(env(safe-area-inset-top,0px) + 16px) 18px 16px", position: "sticky", top: 0, zIndex: 10 },
  mAvatar: { position: "relative", width: 54, height: 54, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 18, flex: "none" },
  tag: { fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", padding: "3px 8px", borderRadius: 999 },

  bookH: { fontWeight: 800, fontSize: 15, color: "#0A1735", margin: "22px 0 11px" },
  cta: { position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 15, background: "rgba(255,255,255,.96)", backdropFilter: "blur(12px)", borderTop: "1px solid #EEF1F7", padding: "12px 18px calc(env(safe-area-inset-bottom,0px) + 16px)", animation: "m_sheetUp .5s var(--spring, cubic-bezier(.3,1.36,.44,1)) both" },
  ctaBtn: { width: "100%", border: "none", background: "linear-gradient(120deg,#0B3D91,#1A4ED8)", color: "#fff", fontFamily: "inherit", fontWeight: 800, fontSize: 15.5, padding: 15, borderRadius: 15, cursor: "pointer", boxShadow: "0 10px 24px rgba(11,61,145,.35)" },

  confirm: { position: "fixed", inset: 0, zIndex: 25, background: "radial-gradient(600px 440px at 50% 20%,#16357F,#0A1735 65%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 30, overflow: "hidden" },
};
