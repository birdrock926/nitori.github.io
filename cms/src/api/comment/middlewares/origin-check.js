const parseOrigins = (value) => {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

const DEFAULT_LOCAL_ORIGINS = [
  'http://localhost:4321',
  'http://127.0.0.1:4321',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

export default (config) => {
  const configuredOrigins = parseOrigins(config?.origins);
  const envOrigins = parseOrigins(process.env.PUBLIC_FRONT_ORIGINS);
  const allowLocal = process.env.NODE_ENV !== 'production';

  const allowed = new Set([...configuredOrigins, ...envOrigins]);

  if (allowLocal || !allowed.size) {
    DEFAULT_LOCAL_ORIGINS.forEach((origin) => allowed.add(origin));
  }

  return async (ctx, next) => {
    const origin = ctx.request.header.origin;
    if (!origin) {
      return next();
    }

    if (allowed.has('*') || allowed.has(origin)) {
      return next();
    }

    const serverUrl = process.env.SERVER_URL || process.env.PUBLIC_URL;
    if (serverUrl) {
      try {
        const allowedOrigin = new URL(serverUrl).origin;
        if (allowedOrigin === origin) {
          return next();
        }
      } catch (error) {
        // ignore malformed server URL
      }
    }

    const hostHeader = ctx.request.header.host;
    if (hostHeader) {
      const [host] = origin.replace(/^https?:\/\//, '').split('/');
      if (host === hostHeader) {
        return next();
      }
    }

    ctx.set('Vary', 'Origin');
    ctx.throw(403, 'Origin not allowed');
  };
};
