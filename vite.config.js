import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // A new deployment (including a rebuild of the same commit) renews onboarding.
  define: { __APP_BUILD_ID__: JSON.stringify(process.env.VERCEL_DEPLOYMENT_ID || new Date().toISOString()) },
  plugins: [react()],
  // Browser downloads can be locked briefly on Windows; QA artifacts are not source.
  server: { watch: { ignored: ['**/.playwright-cli/**', '**/output/playwright/**'] } },
})
