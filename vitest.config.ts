import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Resolve tsconfig paths natively (Vite's built-in resolver, replacing the
  // deprecated vite-tsconfig-paths plugin); the nearest tsconfig.json from the
  // project root is used.
  resolve: {
    tsconfigPaths: true,
  },
  // npm SDK packages reference sourcemaps that are not published (files
  // exclude *.map); do not attempt to load them during transform.
  server: {
    sourcemapIgnoreList: () => true,
  },
  test: {
    include: ['tests/**/*.spec.{ts,tsx}'],
    pool: 'forks',
    environment: 'jsdom',
    // @deepseek-ai SDK packages ship browser bundles (CSS imports included);
    // keep them vite-transformed instead of node-externalized.
    server: {
      deps: {
        inline: [/@deepseek-ai\//],
      },
    },
  },
})
