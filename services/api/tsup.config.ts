import { defineConfig } from 'tsup';

// Bundles the API (and the TS-source @fare/shared workspace) into dist/server.js.
// Native / heavy runtime deps stay external and are installed in the image.
export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: ['@fare/shared'],
  external: ['sharp', 'pg', 'pg-native', '@anthropic-ai/sdk'],
});
