import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // GitHub Pages project site
  base: '/SAMS/',
  plugins: [react()],
})
