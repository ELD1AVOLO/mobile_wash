
import { useEffect, useMemo, useRef, useState } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */

/* Same map as the website: Leaflet + CARTO light tiles + the carwash-marker.png
   truck pin for each washer + live geolocation. Mobile full-screen layout. */

const CASA: [number, number] = [33.5731, -7.5898];
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";

export type MapWasher = {
  id: string;
  name: string;
  initials: string;
  color: string;
  rating: number;
  zone: string;
  base_price: number;
  available_now: boolean;
  eta_minutes: number;
  lat: number | null;
  lng: number | null;
};

type LatLng = { lat: number; lng: number };

function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

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
    if (existing) {
      existing.addEventListener("load", () => resolve((window as any).L));
      existing.addEventListener("error", reject);
      return;
    }
    const script = document.createElement("script");
    script.src = LEAFLET_JS;
    script.async = true;
    script.onload = () => resolve((window as any).L);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

export function MobileMap({
  washers,
  onBack,
  onPick,
}: {
  washers: MapWasher[];
  onBack: () => void;
  onPick: (w: MapWasher) => void;
}) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const userMarkerRef = useRef<any>(null);

  const [ready, setReady] = useState(false);
  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);

  const located = useMemo(() => washers.filter((w) => w.lat != null && w.lng != null), [washers]);
  const nearby = useMemo(() => {
    const arr = located.map((w) => ({
      w,
      dist: origin ? haversineKm(origin, { lat: w.lat as number, lng: w.lng as number }) : null,
    }));
    if (origin) arr.sort((a, b) => (a.dist ?? 0) - (b.dist ?? 0));
    return arr;
  }, [located, origin]);

  // auto-locate the user on open (so they see their position + nearby washers)
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => { /* denied/unavailable — map stays centred on Casablanca */ },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  // init map
  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !mapEl.current || mapRef.current) return;
        LRef.current = L;
        const map = L.map(mapEl.current, { center: CASA, zoom: 12, zoomControl: false, scrollWheelZoom: true });
        L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
          attribution: "&copy; OSM &copy; CARTO",
          maxZoom: 19,
          subdomains: "abcd",
        }).addTo(map);
        mapRef.current = map;
        setReady(true);
        // The map mounts before layout settles; re-measure a few times so
        // Leaflet fills the real container size (fixes blank/0×0 map).
        setTimeout(() => map.invalidateSize(), 150);
        setTimeout(() => map.invalidateSize(), 500);
        setTimeout(() => map.invalidateSize(), 1000);
      })
      .catch(() => setReady(false));
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // washer truck pins
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map || !ready) return;
    markersRef.current.forEach((m) => map.removeLayer(m));
    markersRef.current = [];
    nearby.forEach(({ w }) => {
      const icon = L.divIcon({
        className: "",
        html: `<div class="map-truck-pin${w.available_now ? "" : " busy"}"><img src="/carwash-truck.png" alt="" /><span class="map-truck-price">${w.base_price}</span></div>`,
        iconSize: [52, 56],
        iconAnchor: [26, 56],
      });
      const marker = L.marker([w.lat, w.lng], { icon }).addTo(map);
      marker.on("click", () => onPick(w));
      markersRef.current.push(marker);
    });
  }, [nearby, ready, onPick]);

  // user location marker
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map || !origin) return;
    map.setView([origin.lat, origin.lng], 13, { animate: true });
    if (userMarkerRef.current) map.removeLayer(userMarkerRef.current);
    const icon = L.divIcon({ className: "", html: `<div class="map-me"></div>`, iconSize: [22, 22], iconAnchor: [11, 11] });
    userMarkerRef.current = L.marker([origin.lat, origin.lng], { icon }).addTo(map);
  }, [origin]);

  function useMyLocation() {
    if (!("geolocation" in navigator)) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  return (
    <div style={{ position: "relative", width: "100vw", height: "100dvh", overflow: "hidden", background: "#E9EDF3" }}>
      <div ref={mapEl} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}>
        {!ready && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 40 }}>
            <div className="m-skel" style={{ width: "100%", height: 130, borderRadius: 20 }} />
            <div className="m-skel" style={{ width: "70%", height: 16 }} />
            <div className="m-skel" style={{ width: "45%", height: 16 }} />
            <div style={{ color: "#8A94AE", fontSize: 13, fontWeight: 600, marginTop: 6 }}>Chargement de la carte…</div>
          </div>
        )}
      </div>

      {/* top bar */}
      <div style={{ position: "absolute", top: "calc(env(safe-area-inset-top,0px) + 12px)", left: 14, right: 14, zIndex: 1000, display: "flex", gap: 10, alignItems: "center" }}>
        <button onClick={onBack} className="tap" style={btn}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0A1735" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 9, background: "#fff", borderRadius: 14, padding: "12px 14px", boxShadow: "0 6px 18px rgba(10,23,53,.16)" }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#8A94AE" strokeWidth={2.2} strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
          <span style={{ color: "#5B6784", fontSize: 13.5, fontWeight: 600 }}>Maârif, Casablanca</span>
        </div>
      </div>

      {/* my-location button */}
      <button onClick={useMyLocation} className="tap" style={{ ...btn, position: "absolute", right: 16, bottom: 330, zIndex: 1000 }} aria-label="Ma position">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1A4ED8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3.4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>
      </button>

      {/* bottom sheet */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 1000, background: "#fff", borderRadius: "24px 24px 0 0", boxShadow: "0 -8px 28px rgba(10,23,53,.1)", padding: "10px 0 calc(env(safe-area-inset-bottom,0px) + 14px)", maxHeight: 320, animation: "m_rise .55s var(--spring, cubic-bezier(.3,1.36,.44,1)) both" }}>
        <div style={{ width: 40, height: 4, background: "#E7EAF2", borderRadius: 999, margin: "4px auto 12px" }} />
        <div style={{ padding: "0 18px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: "#0A1735" }}>{origin ? "Les plus proches" : "Laveurs autour de toi"}</div>
          <div className="mono" style={{ fontSize: 11, color: "#8A94AE" }}>
            {locating ? "localisation…" : `${located.length} géolocalisés`}
          </div>
        </div>
        <div className="scrl" style={{ overflowY: "auto", maxHeight: 230, padding: "0 18px" }}>
          {nearby.map(({ w, dist }) => (
            <div key={w.id} onClick={() => onPick(w)} className="tap" style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: "1px solid #EEF1F7" }}>
              <div style={{ width: 42, height: 42, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 14, flex: "none", background: w.color }}>{w.initials}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#0A1735" }}>{w.name}</div>
                <div style={{ fontSize: 12, color: "#5B6784" }}>
                  {w.zone}
                  {dist != null && <> · {dist.toFixed(1)} km</>} · ★ {w.rating}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="mono" style={{ fontSize: 12, color: "#0A1735", fontWeight: 500 }}>dès {w.base_price}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: w.available_now ? "#06B6A6" : "#8A94AE" }}>{w.available_now ? "Dispo" : "Occupé"}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const btn: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 14,
  background: "#fff",
  border: "none",
  boxShadow: "0 6px 18px rgba(10,23,53,.16)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  flex: "none",
};
