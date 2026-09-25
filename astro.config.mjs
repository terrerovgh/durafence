import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://durafencemetal.com',
  trailingSlash: 'always',
  integrations: [
    sitemap({
      filter: (page) => !/\/404\/?$/.test(page),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
    server: {
      host: '0.0.0.0',
      port: 4321,
      strictPort: true,
      allowedHosts: ['durafencemetal.terrerov.com'],
      ws: { clientPort: 443 },
    },
  },
});
