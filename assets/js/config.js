// Isi dua nilai ini setelah proyek Supabase Aluna Store dibuat.
// Publishable/anon key aman berada di browser selama RLS pada schema.sql aktif.
export const SUPABASE_URL = "https://vqtbbtbqfwtimhtaxmud.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_amwTxvpApios8-T6Ezlv_Q_F09AxKMN";

export const STORE_CONFIG = Object.freeze({
  whatsappNumber: "6289656009717",
  foodCartKey: "aluna_food_cart_v2",
  appsCartKey: "aluna_apps_cart_v2",
  imageBucket: "product-images",
  storeLocation: Object.freeze({
    name: "Aluna Eats",
    latitude: -7.0551246,
    longitude: 107.5436398,
  }),
  shipping: Object.freeze({
    maxDeliveryKm: 8,
    tiers: Object.freeze([
      Object.freeze({ maxKm: 2, fee: 3000 }),
      Object.freeze({ maxKm: 5, fee: 8000 }),
      Object.freeze({ maxKm: 8, fee: 15000 }),
    ]),
  }),
});
