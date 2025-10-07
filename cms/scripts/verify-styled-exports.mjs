#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const cmsDir = dirname(scriptDir);

const cases = [
  {
    id: 'styled-components (package entry)',
    loader: () => require('styled-components'),
  },
  {
    id: 'styled-components/dist/styled-components.cjs.js',
    loader: () => require('styled-components/dist/styled-components.cjs.js'),
  },
  {
    id: 'styled-components/dist/styled-components.browser.cjs.js',
    loader: () => require('styled-components/dist/styled-components.browser.cjs.js'),
  },
];

for (const { id, loader } of cases) {
  const mod = loader();
  if (typeof mod !== 'function') {
    throw new Error(`Expected ${id} to export a callable styled() factory but received ${typeof mod}.`);
  }
  if (mod.default !== mod) {
    throw new Error(`Expected ${id} to default-export its styled() factory for CJS consumers.`);
  }
  if (mod.styled !== mod) {
    throw new Error(`Expected ${id} to expose a styled.styled helper that references the callable factory.`);
  }
  if (mod.__esModule !== true) {
    throw new Error(`Expected ${id} to maintain an __esModule=true flag for bundler interop.`);
  }
}

const esm = await import('styled-components');
if (typeof esm.default !== 'function') {
  throw new Error('Expected styled-components ESM default export to be a callable styled() factory.');
}
if (esm.default !== esm.default.styled) {
  throw new Error('Expected styled-components ESM default export to expose styled.styled referencing itself.');
}

const adminDistDir = join(cmsDir, 'node_modules', '@strapi', 'admin', 'dist');
if (existsSync(adminDistDir)) {
  const offenders = [];
  const requirePattern = /require\((['\"])styled-components\1\)/;
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.js')) {
        continue;
      }
      const contents = readFileSync(fullPath, 'utf8');
      if (requirePattern.test(contents) && !contents.includes('/* __birdrockStyledRequire */')) {
        offenders.push(fullPath);
      }
    }
  }
  walk(adminDistDir);
  if (offenders.length > 0) {
    const list = offenders.map((file) => ` - ${file.replace(cmsDir + '/', '')}`).join('\n');
    throw new Error(`Expected styled-components requires in Strapi admin bundles to be normalized. Offending files:\n${list}`);
  }
}
