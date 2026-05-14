import { defineConfig } from 'vite';

import { vitePlugins } from './scripts/plugin/vite';

export default defineConfig({
  root: 'src',
  resolve: { tsconfigPaths: true },
  publicDir: 'src/stories/public',
  css: { modules: { generateScopedName: '[local]___[hash:base64:5]' } },
  define: {
    isDevMode:
      process.env.VITEST !== 'true' && process.env.NODE_ENV === 'development',
  },
  plugins: vitePlugins,
  worker: { plugins: () => vitePlugins },
});
