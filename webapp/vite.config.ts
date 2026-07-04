import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Builds straight into the Capacitor webDir (../www). base "./" so the
// bundle loads from the local capacitor:// / https://localhost origin.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "../www",
    emptyOutDir: true,
  },
});
