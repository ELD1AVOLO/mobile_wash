
import { useEffect, useRef, useState } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */

/* Real Leaflet map for live tracking: CARTO tiles + route polyline +
   client destination + the carwash-marker.png truck moving toward it.
   Same map stack as the website; mobile full-bleed. */

const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";

const DEFAULT_DEST: [number, number] = [33.5889, -7.6331]; // Maârif, Casablanca

// Build a washer → client route ending at `dest` (the client's chosen position).
function buildRoute(dest: [number, number]): [number, number][] {
  const [dLat, dLng] = dest;
  const oLat = dLat - 0.016, oLng = dLng + 0.017; // washer starts ~2 km away
  const lerp = (f: number, jLat = 0, jLng = 0): [number, number] => [oLat + (dLat - oLat) * f + jLat, oLng + (dLng - oLng) * f + jLng];
  return [lerp(0), lerp(0.26, 0.0012, 0.001), lerp(0.52, -0.0014, 0.0008), lerp(0.78, 0.0008, -0.0006), [dLat, dLng]];
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
    const s = document.createElement("script");
    s.src = LEAFLET_JS;
    s.async = true;
    s.onload = () => resolve((window as any).L);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export function MobileTrackMap({ accent = "#1A4ED8", dest, washerPos }: { accent?: string; dest?: [number, number]; washerPos?: [number, number] }) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const washerRef = useRef<any>(null);
  const lineRef = useRef<any>(null);
  const liveRef = useRef(false); // becomes true on the first real position
  const easeRef = useRef(0);
  const fittedRef = useRef(false);
  const [ready, setReady] = useState(false);
  // Stable keys: fresh arrays each parent render — compare by value
  // so the map isn't torn down/rebuilt every render (was crashing the RAF loop).
  const destKey = dest ? `${dest[0]},${dest[1]}` : "";
  const posKey = washerPos ? `${washerPos[0]},${washerPos[1]}` : "";

  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !mapEl.current || mapRef.current) return;
        const ROUTE = buildRoute(dest || DEFAULT_DEST);
        const map = L.map(mapEl.current, { zoomControl: false, attributionControl: false, scrollWheelZoom: false });
        L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", { subdomains: "abcd", maxZoom: 19 }).addTo(map);
        lineRef.current = L.polyline(ROUTE, { color: accent, weight: 5, opacity: 0.55, dashArray: "2 12", lineCap: "round" }).addTo(map);

        const destPt = ROUTE[ROUTE.length - 1];
        L.marker(destPt, { icon: L.divIcon({ className: "", html: `<div class="trk-dest"></div>`, iconSize: [24, 24], iconAnchor: [12, 12] }) }).addTo(map);

        washerRef.current = L.marker(ROUTE[0], {
          icon: L.divIcon({ className: "", html: `<div class="trk-truck" style="border-color:${accent}"><img src="/carwash-truck.png" alt=""/></div>`, iconSize: [46, 46], iconAnchor: [23, 23] }),
          zIndexOffset: 1000,
        }).addTo(map);

        map.fitBounds(ROUTE as any, { padding: [80, 80] });
        mapRef.current = map;
        setReady(true);
        setTimeout(() => map.invalidateSize(), 200);
        setTimeout(() => map.invalidateSize(), 600);

        // Demo motion: only until a REAL position arrives (liveRef).
        const dur = 22000;
        const start = performance.now();
        const step = (now: number) => {
          if (!liveRef.current) {
            const t = ((now - start) % dur) / dur;
            const seg = t * (ROUTE.length - 1);
            const i = Math.max(0, Math.min(ROUTE.length - 2, Math.floor(seg)));
            const a = ROUTE[i], b = ROUTE[i + 1];
            if (a && b && washerRef.current) {
              const f = seg - i;
              washerRef.current.setLatLng([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
            }
          }
          raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      if (easeRef.current) cancelAnimationFrame(easeRef.current);
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accent, destKey]);

  // LIVE mode: a real washer position (from Supabase) — glide the truck
  // there and redraw the dashed line washer → destination.
  useEffect(() => {
    if (!washerPos || !washerRef.current || !mapRef.current) return;
    liveRef.current = true;
    const target: [number, number] = washerPos;
    const from = washerRef.current.getLatLng();
    const start = performance.now();
    const durMs = 1400; // glide between polls so movement looks continuous
    if (easeRef.current) cancelAnimationFrame(easeRef.current);
    const ease = (now: number) => {
      const t = Math.min(1, (now - start) / durMs);
      const k = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const lat = from.lat + (target[0] - from.lat) * k;
      const lng = from.lng + (target[1] - from.lng) * k;
      washerRef.current.setLatLng([lat, lng]);
      if (lineRef.current) lineRef.current.setLatLngs([[lat, lng], dest || DEFAULT_DEST]);
      if (t < 1) easeRef.current = requestAnimationFrame(ease);
    };
    easeRef.current = requestAnimationFrame(ease);
    if (!fittedRef.current) {
      fittedRef.current = true;
      try { mapRef.current.fitBounds([target, dest || DEFAULT_DEST], { padding: [80, 80] }); } catch { /* map busy */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posKey]);

  return (
    <div ref={mapEl} style={{ position: "absolute", inset: 0, background: "#E9EDF3" }}>
      {!ready && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 40 }}>
          <div className="m-skel" style={{ width: "100%", height: 130, borderRadius: 20 }} />
          <div className="m-skel" style={{ width: "70%", height: 16 }} />
          <div className="m-skel" style={{ width: "45%", height: 16 }} />
          <div style={{ color: "#8A94AE", fontSize: 13, fontWeight: 600, marginTop: 6 }}>Chargement de la carte…</div>
        </div>
      )}
    </div>
  );
}
