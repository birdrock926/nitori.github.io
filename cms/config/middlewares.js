import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(currentDir, '../public');
const faviconRelativePath = './public/favicon.ico';
const hasFavicon = existsSync(resolve(publicDir, 'favicon.ico'));

const middlewares = [
  'global::comment-proxy',
  'strapi::errors',
  {
    name: 'strapi::security',
    config: {
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'script-src': ["'self'", "'unsafe-inline'", 'https://www.googletagmanager.com', 'https://www.google.com', 'https://www.gstatic.com'],
          'img-src': ["'self'", 'data:', 'blob:', 'https://*.googleusercontent.com'],
          'connect-src': ["'self'", 'https://www.google-analytics.com', 'https://www.googletagmanager.com'],
          'frame-src': ['https://www.google.com', 'https://player.twitch.tv', 'https://www.youtube.com'],
        },
      },
      referrerPolicy: {
        policy: 'no-referrer-when-downgrade',
      },
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
      crossOriginResourcePolicy: { policy: 'same-site' },
      xssProtection: true,
      hsts: false,
    },
  },
  'strapi::cors',
  'strapi::poweredBy',
  'strapi::logger',
  'strapi::query',
  'strapi::body',
  'strapi::session',
  hasFavicon
    ? {
        name: 'strapi::favicon',
        config: {
          path: faviconRelativePath,
        },
      }
    : null,
  'strapi::public',
].filter(Boolean);

export default middlewares;
