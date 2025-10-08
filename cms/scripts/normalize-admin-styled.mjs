#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const cmsDir = dirname(scriptDir);
const adminDistDir = join(cmsDir, 'node_modules', '@strapi', 'admin', 'dist');
const COMPAT_MARKER = '/* __birdrockStyledCompat */';

function collectJsFiles(startDir) {
  const results = [];
  const stack = [];
  if (existsSync(startDir)) {
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
      const entryPath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith('.js')) {
        results.push(entryPath);
      }
    }
  }
  return results;
}

function harmonizeStyledRequire(source) {
  if (!source.includes("require('styled-components')") || source.includes(COMPAT_MARKER)) {
    return { changed: false, source };
  }
  let changed = false;
  const pattern = /(var styled = require\('styled-components'\);)/g;
  const updated = source.replace(pattern, (match) => {
    changed = true;
    return `${match}\n${COMPAT_MARKER}\nif (styled && typeof styled === 'object' && styled !== null && 'default' in styled && typeof styled.default === 'function') {\n  var __styledDefault = styled.default;\n  var __styledKeys = [];\n  try {\n    __styledKeys = Object.getOwnPropertyNames(styled).concat(Object.getOwnPropertySymbols ? Object.getOwnPropertySymbols(styled) : []);\n  } catch (styledKeysError) {}\n  for (var __styledIndex = 0; __styledIndex < __styledKeys.length; __styledIndex += 1) {\n    var __styledKey = __styledKeys[__styledIndex];\n    if (__styledKey === 'default') {\n      continue;\n    }\n    var __styledDescriptor = null;\n    try {\n      __styledDescriptor = Object.getOwnPropertyDescriptor(styled, __styledKey);\n    } catch (styledDescriptorError) {}\n    if (__styledDescriptor) {\n      try {\n        Object.defineProperty(__styledDefault, __styledKey, __styledDescriptor);\n      } catch (styledDefineError) {}\n    }\n  }\n  try {\n    __styledDefault.default = __styledDefault;\n  } catch (styledDefaultError) {}\n  try {\n    __styledDefault.styled = __styledDefault;\n  } catch (styledStyledError) {}\n  try {\n    __styledDefault.__esModule = true;\n  } catch (styledEsModuleError) {}\n  styled = __styledDefault;\n}\n`;
  });
  return { changed, source: updated };
}

let filesChanged = 0;
const targets = collectJsFiles(adminDistDir);
for (const filePath of targets) {
  let source;
  try {
    source = readFileSync(filePath, 'utf8');
  } catch {
    continue;
  }
  const { changed, source: nextSource } = harmonizeStyledRequire(source);
  if (!changed) {
    continue;
  }
  if (nextSource !== source) {
    writeFileSync(filePath, nextSource, 'utf8');
  }
  filesChanged += 1;
}

if (filesChanged > 0) {
  console.info(`[styled-components] Normalized styled-components interop in ${filesChanged} Strapi admin files.`);
}

const cacheRoots = [
  join(cmsDir, 'node_modules', '.strapi', 'vite'),
  join(cmsDir, 'node_modules', '.strapi', 'build'),
];
let cacheCleared = false;
for (const cacheDir of cacheRoots) {
  if (existsSync(cacheDir)) {
    try {
      const stats = statSync(cacheDir);
      if (stats && stats.isDirectory()) {
        rmSync(cacheDir, { recursive: true, force: true });
        cacheCleared = true;
      }
    } catch (error) {
      console.warn('[styled-components] Failed to clear Strapi cache', cacheDir, error?.message || error);
    }
  }
}
if (cacheCleared) {
  console.info('[styled-components] Cleared cached Strapi admin bundles.');
}
