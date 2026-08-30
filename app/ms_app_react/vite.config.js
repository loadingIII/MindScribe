import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/gen_imgs": "http://127.0.0.1:8080",
      "/auth": "http://127.0.0.1:8080"
    }
  }
});
