import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

const site = process.env.SITE_URL || 'https://example.github.io';

export default defineConfig({
  site,
  integrations: [react(), sitemap()],
  output: 'static',
  vite: {
    ssr: {
      external: ['lunr'],
    },
  },
});
