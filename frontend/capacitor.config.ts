import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.skdev.chakravyuh",
  appName: "Chakravyuh",
  webDir: "dist",
  server: {
    // For local dev against the Vite server, uncomment and set your LAN IP:
    // url: "http://192.168.x.x:5173",
    // cleartext: true,
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    GoogleAuth: {
      scopes: ["profile", "email"],
      // Web OAuth client ID (NOT the Android client ID) — public value.
      serverClientId: "929006071236-k0rm595b6mi2g67pu6f008qdpnipb5aq.apps.googleusercontent.com",
      forceCodeForRefreshToken: false,
    },
  },
};

export default config;
