import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Keep production assets relative so the site works both at
  // /crochet/ on GitHub Pages and at a future custom domain.
  base: './',
  plugins: [react()],
})
