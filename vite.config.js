// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // 👇 muy importante para GitHub Pages
  base: "/Simulador-chat-CNX/",
});
