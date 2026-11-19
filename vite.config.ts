import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { ecoLifeJsonDbAdminPlugin } from './src/admin/viteJsonDbPlugin.ts';
import tailwindcss from '@tailwindcss/vite';
// https://vite.dev/config/
export default defineConfig({
  plugins: [react(),ecoLifeJsonDbAdminPlugin(),tailwindcss()],
  
})
