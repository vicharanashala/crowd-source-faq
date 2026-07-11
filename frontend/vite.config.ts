import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:5002",
        changeOrigin: true,
      },
      // The FAQ Voice Agent now runs inside the backend on the same port
      // (see backend/src/app.ts), so it's proxied here the same way /api is.
      "/voice-agent": {
        target: "http://localhost:5002",
        changeOrigin: true,
      },
    },
  },
});
