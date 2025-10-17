import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import node from '@astrojs/node';

const site = process.env.SITE_URL || 'https://example.github.io';

export default defineConfig({
  site,
  integrations: [react(), sitemap()],
  adapter: node({ mode: 'standalone' }),
  output: 'hybrid',
  vite: {
    ssr: {
      external: ['lunr'],
    },
  },
});
