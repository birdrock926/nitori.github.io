import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const ensureEnvModulePath = new URL('./ensure-env.mjs', import.meta.url);

await import(ensureEnvModulePath);

const require = createRequire(import.meta.url);
const packagePath = require.resolve('@strapi/strapi/package.json');
const strapiBin = path.join(path.dirname(packagePath), 'bin', 'strapi.js');

const args = [...process.argv.slice(2)];

const command = args[0];
const hasAdminWatchFlag = args.some((flag) => flag === '--watch-admin' || flag === '--no-watch-admin');

const isLikelyLocalhost = (hostname) => {
  if (!hostname) {
    return true;
  }

  const normalized = hostname.trim().toLowerCase();

  if (!normalized) {
    return true;
  }

  if (normalized === 'localhost' || normalized === '0.0.0.0' || normalized === '127.0.0.1' || normalized === '[::1]') {
    return true;
  }

  if (normalized.endsWith('.localhost')) {
    return true;
  }

  if (normalized.startsWith('127.0.0.')) {
    return true;
  }

  return false;
};

if (command === 'develop' && !hasAdminWatchFlag) {
  const urlCandidates = [process.env.ADMIN_URL, process.env.PUBLIC_URL, process.env.STRAPI_ADMIN_BACKEND_URL];
  let resolvedHost = null;

  for (const candidate of urlCandidates) {
    if (typeof candidate !== 'string' || candidate.trim().length === 0) {
      continue;
    }

    try {
      const parsed = new URL(candidate);
      resolvedHost = parsed.hostname;
      break;
    } catch {
      // Ignore invalid URLs and continue checking the next candidate.
    }
  }

  if (!isLikelyLocalhost(resolvedHost)) {
    args.push('--no-watch-admin');
    console.info(
      'Detected a non-local admin host. Disabling admin hot reload so the prebuilt dashboard is served without requiring the Vite HMR port.'
    );
  }
}
const specifierFlag = '--experimental-specifier-resolution=node';
const env = { ...process.env };

if (typeof env.NODE_OPTIONS === 'string' && env.NODE_OPTIONS.trim().length > 0) {
  const options = env.NODE_OPTIONS.split(/\s+/u);
  if (!options.includes(specifierFlag)) {
    options.push(specifierFlag);
    env.NODE_OPTIONS = options.join(' ');
  }
} else {
  env.NODE_OPTIONS = specifierFlag;
}

const nodeArgs = [strapiBin, ...args];

const child = spawn(process.execPath, nodeArgs, {
  stdio: 'inherit',
  env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});
