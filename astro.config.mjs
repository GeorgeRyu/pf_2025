// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

import vercel from '@astrojs/vercel';

// https://astro.build/config
export default defineConfig({
  // SSGを基本とする
  // output: 'static',

  // SSRを基本とする
  output: 'server',

  devToolbar: {
    enabled: false
  },

  vite: {
    plugins: [tailwindcss()]
  },

  adapter: vercel()
});