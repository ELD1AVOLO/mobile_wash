
import { useEffect, useRef, useState } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */

/* Full-screen "set your position" map. Move the map under the centre pin
   (Uber-style) or tap the GPS button. Returns { lat, lng, label }. */

const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const CASA: [number, number] = [33.5731, -7.5898];

export type PickedPos = { lat: number; lng: number; label: string };

function loadLeaflet(): Promise<any> {
  return new Promise((resolve, reject) => {
    if ((window as any).L) return resolve((window as any).L);
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    const existing = document.querySelector(`script[src="${LEAFLET_JS}"]`) as HTMLScriptElement | null;
    if (existing) { existing.addEventListener("load", () => resolve((window as any).L)); existing.addEventListener("error", reject); return; }
    const s = document.createElement("script");
    s.src = LEAFLET_JS; s.async = true; s.onload = () => resolve((window as any).L); s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`, { headers: { "Accept-Language": "fr" } });
    const d = await r.json();
    const a = d.address || {};
    const parts = [a.road || a.neighbourhood || a.suburb, a.city || a.town || a.village || a.county].filter(Boolean);
    return parts.join(", ") || d.display_name?.split(",").slice(0, 2).join(",") || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } catch {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}

export function LocationPicker({ initial, onConfirm, onCancel }: { initial?: { lat: number; lng: number } | null; onConfirm: (p: PickedPos) => void; onCancel: () => void }) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((L) => {
      if (cancelled || !mapEl.current || mapRef.current) return;
      const map = L.map(mapEl.current, { zoomControl: false, attributionControl: false, center: initial ? [initial.lat, initial.lng] : CASA, zoom: initial ? 16 : 13 });
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", { subdomains: "abcd", maxZoom: 19 }).addTo(map);
      mapRef.current = map;
      setReady(true);
      setTimeout(() => map.invalidateSize(), 200);
      setTimeout(() => map.invalidateSize(), 600);
      if (!initial) locate(true);
    }).catch(() => {});
    return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function locate(silent = false) {
    if (!("geolocation" in navigator)) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { mapRef.current?.setView([pos.coords.latitude, pos.coords.longitude], 16, { animate: true }); setLocating(false); },
      () => { setLocating(false); if (!silent) alert("Autorise la localisation pour utiliser ta position."); },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  async function confirm() {
    const map = mapRef.current;
    if (!map) return;
    setBusy(true);
    const c = map.getCenter();
    const label = await reverseGeocode(c.lat, c.lng);
    onConfirm({ lat: c.lat, lng: c.lng, label });
  }

  return (
    <div style={{ position: "relative", width: "100vw", height: "100dvh", overflow: "hidden", background: "#E9EDF3" }}>
      <div ref={mapEl} style={{ position: "absolute", inset: 0 }}>
        {!ready && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 40 }}>
            <div className="m-skel" style={{ width: "100%", height: 130, borderRadius: 20 }} />
            <div className="m-skel" style={{ width: "70%", height: 16 }} />
            <div style={{ color: "#8A94AE", fontSize: 13, fontWeight: 600, marginTop: 6 }}>Chargement de la carte…</div>
          </div>
        )}
      </div>

      {/* centre pin (Uber style) */}
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-100%)", zIndex: 1000, pointerEvents: "none" }}>
        <svg width="40" height="52" viewBox="0 0 40 52" fill="none"><path d="M20 2C11 2 4 9 4 18c0 11 16 30 16 30s16-19 16-30C36 9 29 2 20 2Z" fill="#1A4ED8" stroke="#fff" strokeWidth="2.5" /><circle cx="20" cy="18" r="6" fill="#fff" /></svg>
        <div style={{ width: 10, height: 4, background: "rgba(10,23,53,.25)", borderRadius: "50%", margin: "2px auto 0", filter: "blur(1px)" }} />
      </div>

      {/* top bar */}
      <div style={{ position: "absolute", top: "calc(env(safe-area-inset-top,0px) + 12px)", left: 14, right: 14, zIndex: 1000, display: "flex", gap: 10, alignItems: "center" }}>
        <button onClick={onCancel} className="tap" style={pkBtn}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0A1735" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg></button>
        <div style={{ flex: 1, background: "#fff", borderRadius: 14, padding: "12px 14px", boxShadow: "0 6px 18px rgba(10,23,53,.16)", fontSize: 13.5, fontWeight: 700, color: "#0A1735" }}>Place le repère sur ton adresse</div>
      </div>

      {/* GPS button */}
      <button onClick={() => locate(false)} className="tap" style={{ ...pkBtn, position: "absolute", right: 16, bottom: 150, zIndex: 1000 }} aria-label="Ma position">
        {locating ? <span style={{ width: 18, height: 18, border: "2.5px solid #E7EAF2", borderTopColor: "#1A4ED8", borderRadius: "50%", display: "inline-block", animation: "m_spin .8s linear infinite" }} /> : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1A4ED8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3.4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>}
      </button>

      {/* confirm bar */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 1000, background: "#fff", borderRadius: "22px 22px 0 0", boxShadow: "0 -8px 28px rgba(10,23,53,.12)", padding: "16px 18px calc(env(safe-area-inset-bottom,0px) + 16px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1A4ED8" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s7-6.4 7-12a7 7 0 0 0-14 0c0 5.6 7 12 7 12Z" /><circle cx="12" cy="9" r="2.4" /></svg>
          <span style={{ fontSize: 13, color: "#5B6784", fontWeight: 600 }}>Le laveur viendra exactement ici</span>
        </div>
        <button onClick={confirm} disabled={busy} className="tap" style={{ width: "100%", border: "none", background: "linear-gradient(120deg,#0B3D91,#1A4ED8)", color: "#fff", fontFamily: "inherit", fontWeight: 800, fontSize: 15.5, padding: 15, borderRadius: 15, boxShadow: "0 10px 24px rgba(11,61,145,.35)" }}>{busy ? "Validation…" : "Confirmer cette position"}</button>
      </div>
    </div>
  );
}

const pkBtn: React.CSSProperties = { width: 44, height: 44, borderRadius: 14, background: "#fff", border: "none", boxShadow: "0 6px 18px rgba(10,23,53,.16)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "none" };
