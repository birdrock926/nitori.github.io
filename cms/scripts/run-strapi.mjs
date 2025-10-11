import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const packagePath = require.resolve('@strapi/strapi/package.json');
const strapiBin = path.join(path.dirname(packagePath), 'bin', 'strapi.js');

const args = process.argv.slice(2);
const nodeArgs = [strapiBin, ...args];

const child = spawn(process.execPath, nodeArgs, {
  stdio: 'inherit',
  env: process.env,
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
