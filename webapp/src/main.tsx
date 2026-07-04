import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { WashMobile } from "./components/WashMobile";
import { supabase } from "./lib/supabase";
import type { Washer, Service } from "./lib/types";
import "./mobile.css";

/**
 * Standalone entry — renders instantly (WashMobile falls back to demo data
 * while empty), then swaps in the live washers/services once Supabase answers.
 * Same queries the Next.js page ran on the server.
 */
function App() {
  const [washers, setWashers] = useState<Washer[]>([]);
  const [services, setServices] = useState<Service[]>([]);

  useEffect(() => {
    supabase
      .from("washers")
      .select("*")
      .order("is_super", { ascending: false })
      .order("rating", { ascending: false })
      .then(({ data }) => { if (data?.length) setWashers(data as Washer[]); });
    supabase
      .from("services")
      .select("*")
      .order("sort_order", { ascending: true })
      .then(({ data }) => { if (data?.length) setServices(data as Service[]); });
  }, []);

  return <WashMobile washers={washers} services={services} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div className="mob">
      <App />
    </div>
  </StrictMode>
);
