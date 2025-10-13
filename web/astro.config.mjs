import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import node from '@astrojs/node';

const site = process.env.SITE_URL || 'https://example.github.io';

export default defineConfig({
  site,
  integrations: [react(), sitemap()],
  output: 'hybrid',
  adapter: node({ mode: 'standalone' }),
  vite: {
    ssr: {
      external: ['lunr'],
    },
  },
});
