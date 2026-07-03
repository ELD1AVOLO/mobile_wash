/** @type {import('@capacitor/cli').CapacitorConfig} */

/**
 * Autokhidma WASH — native shell config.
 * Converted from .ts to .js to avoid requiring TypeScript on CI.
 *
 * SERVER_URL: points to the deployed Vercel app.
 * The ?native=wash query tells the web app it runs inside the native shell.
 */

const SERVER_URL = "https://autokhidma.vercel.app/m/wash?native=wash";
// LOCAL TEST (same Wi-Fi): const SERVER_URL = "http://192.168.11.107:3000/m/wash?native=wash";
// EMULATOR:               const SERVER_URL = "http://10.0.2.2:3000/m/wash?native=wash";

const config = {
  appId: "ma.autokhidma.wash",
  appName: "Autokhidma Wash",
  webDir: "www",
  server: {
    url: SERVER_URL,
    cleartext: true,
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
