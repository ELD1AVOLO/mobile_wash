import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

/**
 * Real Supabase email auth — optional: the app is fully usable as a guest,
 * an account just syncs identity (and attaches user_id to bookings).
 */
export function useSession(): Session | null {
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  return session;
}

export async function signUp(email: string, password: string, name: string) {
  return supabase.auth.signUp({ email, password, options: { data: { name } } });
}
export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}
export async function signOut() {
  return supabase.auth.signOut();
}
export async function updatePassword(password: string) {
  return supabase.auth.updateUser({ password });
}
