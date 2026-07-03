import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Autokhidma WASH — native shell config.
 *
 * This app does NOT bundle the web code. It loads the live deployed
 * Next.js app (so 100% of the features — API routes, middleware,
 * Supabase auth, live tracking, OTP — keep working exactly as on the web).
 *
 * 👉 Change SERVER_URL below to your deployed domain.
 *    - Production (Vercel):  https://your-domain.com
 *    - Local testing on a real phone (same Wi-Fi): http://192.168.1.XX:3000
 *      (run `npm run dev` in the web project; find your PC IP with `ipconfig`)
 *
 * The `?native=wash` query tells the web app it runs inside the Wash
 * native shell (used to apply the mobile UI + hide cross-app navigation).
 */
// 👉 PRODUCTION — set this to your deployed Vercel domain before publishing.
// 👉 PRODUCTION — set this to your deployed Vercel domain before publishing.
const SERVER_URL = "https://autokhidma.vercel.app/m/wash?native=wash";
// 👉 LOCAL TEST on a real phone (same Wi-Fi): comment the line above and use your PC's LAN IP:
// const SERVER_URL = "http://192.168.11.107:3000/m/wash?native=wash";
// 👉 EMULATOR test:
// const SERVER_URL = "http://10.0.2.2:3000/m/wash?native=wash";

const config: CapacitorConfig = {
  appId: "ma.autokhidma.wash",
  appName: "Autokhidma Wash",
  webDir: "www",
  server: {
    url: SERVER_URL,
    cleartext: true, // allow http:// for local LAN testing; harmless for https prod
    androidScheme: "https",
  },
  backgroundColor: "#0A1735",
  plugins: {
    SplashScreen: {
      launchShowDuration: 1400,
      backgroundColor: "#0A1735",
      androidSplashResourceName: "splash",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    Keyboard: {
      resize: "native",
    },
  },
};

export default config;
