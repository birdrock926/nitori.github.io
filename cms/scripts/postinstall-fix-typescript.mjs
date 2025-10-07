import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import fse from 'fs-extra';

const cwd = process.cwd();
const rootTs = path.resolve(cwd, 'node_modules', 'typescript');
const nestedTs = path.resolve(
  cwd,
  'node_modules',
  '@strapi',
  'typescript-utils',
  'node_modules',
  'typescript'
);

const ensureValidTypescript = async () => {
  if (!existsSync(rootTs)) {
    return;
  }

  try {
    await fs.stat(rootTs);
  } catch {
    return;
  }

  try {
    await fse.remove(nestedTs);
    await fse.copy(rootTs, nestedTs, { overwrite: true });
    console.info('[postinstall] Synchronized TypeScript runtime for @strapi/typescript-utils');
  } catch (error) {
    console.warn('[postinstall] Failed to synchronize TypeScript runtime:', error?.message || error);
  }
};

await ensureValidTypescript();
