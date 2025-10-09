import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const packagePath = require.resolve('@strapi/strapi/package.json');
const strapiBin = path.join(path.dirname(packagePath), 'bin', 'strapi.js');

const args = process.argv.slice(2);
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
