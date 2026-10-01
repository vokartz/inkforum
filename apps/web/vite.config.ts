import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const api = process.env.INTERNAL_API_URL ?? 'http://127.0.0.1:3000';

// Sürüm paketi: sunucu tarafı kod da küçültülür, kaynak haritası üretilmez
const release = process.env.INKFORUM_RELEASE === '1';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  build: release ? { minify: true, sourcemap: false } : undefined,
  server: {
    proxy: {
      '/api': { target: api, changeOrigin: false, xfwd: true },
      '/uploads': { target: api, changeOrigin: false },
      '/emoji': { target: api, changeOrigin: false },
    },
  },
});
