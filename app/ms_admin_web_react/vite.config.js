import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 管理端独立端口 5175；接口经同源代理转发到唯一后端，Cookie 无跨站问题。
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5000,
    proxy: {
      "/auth": "http://127.0.0.1:8080",
      "/admin": "http://127.0.0.1:8080"
    }
  }
});
