#!/usr/bin/env node
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const cmsDir = dirname(scriptDir);

function collectStyledPackageRoots(startDir) {
  const results = new Set();
  const stack = [];
  if (startDir && existsSync(startDir)) {
    stack.push(startDir);
  }

  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const nextPath = join(current, entry.name);
      if (entry.name === 'styled-components') {
        if (existsSync(join(nextPath, 'package.json'))) {
          results.add(nextPath);
        }
        const nestedNodeModules = join(nextPath, 'node_modules');
        if (existsSync(nestedNodeModules)) {
          stack.push(nestedNodeModules);
        }
        continue;
      }

      if (entry.name === 'node_modules' || entry.name.startsWith('@')) {
        stack.push(nextPath);
        continue;
      }

      if (current.endsWith('node_modules')) {
        stack.push(nextPath);
      }
    }
  }

  return Array.from(results);
}

const styledPackageRoots = collectStyledPackageRoots(join(cmsDir, 'node_modules'));
if (styledPackageRoots.length === 0) {
  console.warn('styled-components is not installed; skipping export verification.');
  process.exit(0);
}

const cases = [];
for (const pkgRoot of styledPackageRoots) {
  const localRequire = createRequire(join(pkgRoot, 'package.json'));
  cases.push(
    {
      id: `${pkgRoot} (package entry)`,
      loader: () => localRequire('styled-components'),
    },
    {
      id: `${pkgRoot} dist/styled-components.cjs.js`,
      loader: () => localRequire('styled-components/dist/styled-components.cjs.js'),
    },
    {
      id: `${pkgRoot} dist/styled-components.browser.cjs.js`,
      loader: () => localRequire('styled-components/dist/styled-components.browser.cjs.js'),
    },
  );
}

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
  if (typeof mod.ThemeProvider !== 'function') {
    throw new Error(`Expected ${id} to retain component exports like ThemeProvider after harmonization.`);
  }
}

const esm = await import('styled-components');
if (typeof esm.default !== 'function') {
  throw new Error('Expected styled-components ESM default export to be a callable styled() factory.');
}
if (esm.default !== esm.default.styled) {
  throw new Error('Expected styled-components ESM default export to expose styled.styled referencing itself.');
}
