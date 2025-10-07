#!/usr/bin/env node
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

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

