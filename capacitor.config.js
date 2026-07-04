/** @type {import('@capacitor/cli').CapacitorConfig} */

/**
 * Autokhidma WASH — standalone native app config.
 *
 * The app is fully packed: the UI bundle lives in www/ (built from webapp/
 * with `npm run build`) and talks straight to Supabase. No server.url —
 * nothing depends on Vercel or any web deployment.
 */

const config = {
  appId: "ma.autokhidma.wash",
  appName: "Autokhidma Wash",
  webDir: "www",
  server: {
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

module.exports = config;
