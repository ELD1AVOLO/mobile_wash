export type UUID = string;

export interface Washer {
  id: UUID;
  name: string;
  initials: string;
  color: string;
  rating: number;
  reviews_count: number;
  distance_km: number;
  eta_minutes: number;
  base_price: number;
  verified: boolean;
  is_super: boolean;
  zone: string;
  years_experience: number;
  bio: string;
  services: string[];
  available_now: boolean;
  map_x: number;
  map_y: number;
  lat: number | null;
  lng: number | null;
  created_at: string;
}

export interface Service {
  id: string; // 'express' | 'standard' | 'premium'
  name: string;
  description: string;
  duration: string;
  price: number;
  icon: string;
  popular: boolean;
  sort_order: number;
}
