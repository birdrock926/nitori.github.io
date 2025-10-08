#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const cmsDir = dirname(scriptDir);

const BUNDLE_MARKER = '/* __birdrockStyledInterop_v2 */';

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

let bundleChanged = false;
for (const pkgRoot of styledPackageRoots) {
  const bundleFiles = [
    join(pkgRoot, 'dist/styled-components.cjs.js'),
    join(pkgRoot, 'dist/styled-components.browser.cjs.js'),
  ];

  for (const absolutePath of bundleFiles) {
    if (!existsSync(absolutePath)) {
      continue;
    }

    let source = readFileSync(absolutePath, 'utf8');
    if (source.includes(BUNDLE_MARKER)) {
      continue;
    }

    const injection = `\n${BUNDLE_MARKER}\n(function() {\n  if (typeof module === 'undefined' || !module || !module.exports) {\n    return;\n  }\n  var current = module.exports;\n  var candidate = current;\n  if (candidate && typeof candidate === 'object' && typeof candidate.default === 'function') {\n    candidate = candidate.default;\n  }\n  if (typeof candidate !== 'function') {\n    return;\n  }\n  if (current && current !== candidate) {\n    var ownKeys = Object.getOwnPropertyNames(current).concat(Object.getOwnPropertySymbols(current));\n    for (var index = 0; index < ownKeys.length; index += 1) {\n      var key = ownKeys[index];\n      if (key === 'default' || key === 'styled') {\n        continue;\n      }\n      try {\n        var descriptor = Object.getOwnPropertyDescriptor(current, key);\n        if (descriptor) {\n          Object.defineProperty(candidate, key, descriptor);\n        }\n      } catch (copyError) {\n        // ignore descriptor copy failures\n      }\n    }\n  }\n  try {\n    candidate.styled = candidate;\n  } catch (styledWriteError) {\n    // ignore write failures\n  }\n  try {\n    candidate.default = candidate;\n  } catch (defaultWriteError) {\n    // ignore write failures\n  }\n  try {\n    candidate.__esModule = true;\n  } catch (esModuleWriteError) {\n    // ignore write failures\n  }\n  module.exports = candidate;\n  module.exports.default = candidate;\n  module.exports.styled = candidate;\n})();\n`;

    const sourceMapIndex = source.lastIndexOf('\n//# sourceMappingURL=');
    if (sourceMapIndex !== -1) {
      source = source.slice(0, sourceMapIndex) + injection + source.slice(sourceMapIndex);
    } else {
      source += injection;
    }

    writeFileSync(absolutePath, source, 'utf8');
    bundleChanged = true;
  }
}

if (bundleChanged) {
  console.info('[styled-components] Applied runtime export harmonization.');
}

const adminCaches = [
  join(cmsDir, 'node_modules/.strapi/vite'),
  join(cmsDir, 'node_modules/.strapi/build'),
];

let cacheCleared = false;
for (const cachePath of adminCaches) {
  if (existsSync(cachePath)) {
    try {
      rmSync(cachePath, { recursive: true, force: true });
      cacheCleared = true;
    } catch (cacheError) {
      console.warn('[styled-components] Failed to clear Strapi admin cache:', cacheError?.message || cacheError);
    }
  }
}

if (cacheCleared) {
  console.info('[styled-components] Cleared cached Strapi admin bundles.');
}
