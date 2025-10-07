#!/usr/bin/env node
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const checks = [
  {
    id: 'styled-components',
    loader: () => require('styled-components'),
  },
  {
    id: 'styled-components/browser',
    loader: () => require('styled-components/dist/styled-components.browser.cjs.js'),
  },
];

for (const { id, loader } of checks) {
  const mod = loader();
  if (typeof mod !== 'function') {
    throw new Error(`Expected ${id} to export a callable styled() factory but received ${typeof mod}.`);
  }
  if (mod.default !== mod) {
    throw new Error(`Expected ${id} to default-export its styled() factory for CJS consumers.`);
  }
  if (typeof mod.styled !== 'function') {
    throw new Error(`Expected ${id} to expose a styled.styled helper but received ${typeof mod.styled}.`);
  }
}
