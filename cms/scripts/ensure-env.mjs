import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const envPath = path.resolve(process.cwd(), '.env');
const samplePath = path.resolve(process.cwd(), '.env.sample');
const lifecycle = process.env.npm_lifecycle_event || '';
const isBuildLike = ['build', 'prebuild', 'start', 'prestart'].includes(lifecycle);
const isProduction = process.env.NODE_ENV === 'production' || isBuildLike;

const loadTemplate = () => {
  if (fs.existsSync(envPath)) {
    return fs.readFileSync(envPath, 'utf8');
  }
  if (fs.existsSync(samplePath)) {
    return fs.readFileSync(samplePath, 'utf8');
  }
  return '';
};

const parseLines = (content) => {
  const lines = content.split(/\r?\n/);
  const map = new Map();
  const order = new Map();

  lines.forEach((line, index) => {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) {
      const [, key, value] = match;
      map.set(key, value);
      order.set(key, index);
    }
  });

  return { lines, map, order };
};

const randomHex = (bytes) => crypto.randomBytes(bytes).toString('hex');
const randomKeys = () => Array.from({ length: 4 }, () => randomHex(16)).join(',');

const ensureValue = (key, generator, state, changes) => {
  const current = process.env[key] ?? state.map.get(key);
  if (!current || /replace-with/i.test(current) || current.trim() === '') {
    const next = generator();
    state.map.set(key, next);
    process.env[key] = next;
    changes.push(key);
  } else {
    state.map.set(key, current.trim());
    process.env[key] = current.trim();
  }
};

const writeEnvFile = (state) => {
  const { lines, map, order } = state;
  map.forEach((value, key) => {
    const newLine = `${key}=${value}`;
    if (order.has(key)) {
      lines[order.get(key)] = newLine;
    } else {
      lines.push(newLine);
    }
  });
  const cleaned = lines
    .filter((line, index) => !(index === 0 && line.trim() === ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+$/g, '')
    .concat('\n');
  fs.writeFileSync(envPath, cleaned, 'utf8');
};

const main = () => {
  const template = loadTemplate();
  const state = parseLines(template);
  const changes = [];

  ensureValue('HOST', () => '0.0.0.0', state, changes);
  ensureValue('PORT', () => '1337', state, changes);
  ensureValue('PUBLIC_URL', () => process.env.PUBLIC_URL || 'http://localhost:1337', state, changes);
  ensureValue('APP_KEYS', randomKeys, state, changes);
  ensureValue('API_TOKEN_SALT', () => randomHex(16), state, changes);
  ensureValue('ADMIN_JWT_SECRET', () => randomHex(32), state, changes);
  ensureValue('JWT_SECRET', () => randomHex(32), state, changes);
  ensureValue(
    'NODE_ENV',
    () =>
      process.env.NODE_ENV || (isBuildLike ? 'production' : 'development'),
    state,
    changes,
  );
  ensureValue('LOG_LEVEL', () => process.env.LOG_LEVEL || 'info', state, changes);
  ensureValue('HASH_PEPPER', () => randomHex(16), state, changes);
  ensureValue('ALIAS_SALT', () => randomHex(16), state, changes);
  ensureValue('CAPTCHA_PROVIDER', () => 'none', state, changes);
  ensureValue('CAPTCHA_SECRET', () => 'set-before-production', state, changes);
  ensureValue('PUBLIC_FRONT_ORIGINS', () => 'http://localhost:4321', state, changes);
  ensureValue('RATE_LIMITS_MIN', () => '5', state, changes);
  ensureValue('RATE_LIMITS_HOUR', () => '30', state, changes);
  ensureValue('RATE_LIMITS_DAY', () => '200', state, changes);
  ensureValue(
    'COMMENTS_AUTO_PUBLISH',
    () => 'smart',
    state,
    changes,
  );
  ensureValue('GITHUB_WORKFLOW_OWNER', () => 'local-owner', state, changes);
  ensureValue('GITHUB_WORKFLOW_REPO', () => 'local-repo', state, changes);
  ensureValue('GITHUB_WORKFLOW_ID', () => 'dispatch-workflow.yml', state, changes);
  ensureValue('GITHUB_WORKFLOW_TOKEN', () => 'github-token-placeholder', state, changes);
  ensureValue('GITHUB_WORKFLOW_BRANCH', () => 'main', state, changes);
  ensureValue('DATABASE_CLIENT', () => 'sqlite', state, changes);
  ensureValue('DATABASE_FILENAME', () => '.tmp/data.db', state, changes);
  ensureValue('UPLOAD_PROVIDER', () => 'local', state, changes);
  ensureValue('UPLOAD_SIZE_LIMIT', () => '268435456', state, changes);
  ensureValue('SMTP_HOST', () => 'smtp.example.com', state, changes);
  ensureValue('SMTP_PORT', () => '587', state, changes);
  ensureValue('SMTP_SECURE', () => 'false', state, changes);
  ensureValue('SMTP_USERNAME', () => 'apikey', state, changes);
  ensureValue('SMTP_PASSWORD', () => 'dev-smtp-password', state, changes);
  ensureValue('SMTP_FROM', () => 'Kininatta News <noreply@example.com>', state, changes);
  ensureValue('SMTP_REPLY_TO', () => 'contact@example.com', state, changes);

  if (changes.length > 0) {
    if (!isProduction) {
      writeEnvFile(state);
      console.info(`Generated development secrets for: ${changes.join(', ')}`);
    } else {
      console.warn(
        `Using temporary secrets for this ${lifecycle || 'run'} execution. Configure environment variables for production deployments.`,
      );
    }
  }
};

main();
