import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(currentDir, '../public');
const faviconRelativePath = './public/favicon.ico';
const hasFavicon = existsSync(resolve(publicDir, 'favicon.ico'));

const isDevelopment = (process.env.NODE_ENV || 'development') !== 'production';

const normalizeDirective = (values) => Array.from(new Set(values.filter(Boolean)));

const buildSecurityDirectives = () => {

  const scriptSrc = normalizeDirective([
    "'self'",
    "'unsafe-inline'",
    'https://www.googletagmanager.com',
    'https://www.google.com',
    'https://www.gstatic.com',
    isDevelopment ? "'unsafe-eval'" : null,
    isDevelopment ? 'blob:' : null,
  ]);

  const connectSrc = normalizeDirective([
    "'self'",
    'https://www.google-analytics.com',
    'https://www.googletagmanager.com',
    isDevelopment ? 'ws:' : null,
    isDevelopment ? 'wss:' : null,
  ]);

  const imgSrc = normalizeDirective([
    "'self'",
    'data:',
    'blob:',
    'https://*.googleusercontent.com',
  ]);

  const frameSrc = normalizeDirective([
    'https://www.google.com',
    'https://player.twitch.tv',
    'https://www.youtube.com',
  ]);

  const mediaSrc = normalizeDirective([
    "'self'",
    'data:',
    'blob:',
  ]);

  return {
    'script-src': scriptSrc,
    'img-src': imgSrc,
    'connect-src': connectSrc,
    'frame-src': frameSrc,
    'media-src': mediaSrc,
  };
};

const createMiddlewares = () =>
  [
    'strapi::errors',
    {
      name: 'strapi::security',
      config: {
        contentSecurityPolicy: {
          useDefaults: true,
          directives: buildSecurityDirectives(),
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
    'global::comments-limit-sanitizer',
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

export default createMiddlewares;
