// Minimal test config: the app's vite.config.ts pulls in the Start, nitro and
// devtools plugins, which unit tests don't need (and which keep vitest alive).
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
