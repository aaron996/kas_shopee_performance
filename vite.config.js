import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Browser downloads can be locked briefly on Windows; QA artifacts are not source.
  server: { watch: { ignored: ['**/.playwright-cli/**', '**/output/playwright/**'] } },
})
