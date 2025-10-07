#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const cmsDir = dirname(scriptDir);

const BUNDLE_MARKER = '/* __birdrockStyledInterop */';
const REQUIRE_MARKER = '/* __birdrockStyledRequire */';

const bundleFiles = [
  'node_modules/styled-components/dist/styled-components.cjs.js',
  'node_modules/styled-components/dist/styled-components.browser.cjs.js',
];

let bundleChanged = false;
for (const relativePath of bundleFiles) {
  const absolutePath = join(cmsDir, relativePath);
  if (!existsSync(absolutePath)) {
    continue;
  }

  let source = readFileSync(absolutePath, 'utf8');
  if (source.includes(BUNDLE_MARKER)) {
    continue;
  }

  const injection = `\n${BUNDLE_MARKER}\n(function() {\n  var current = module.exports;\n  var candidate = current && (current.styled || current.default || current);\n  if (candidate && typeof candidate === 'object' && typeof candidate.default === 'function') {\n    candidate = candidate.default;\n  }\n  if (typeof candidate !== 'function') {\n    if (typeof current === 'function') {\n      candidate = current;\n    } else {\n      return;\n    }\n  }\n  var finalStyled = candidate;\n  if (current && current !== finalStyled) {\n    try {\n      var keys = Object.getOwnPropertyNames(current);\n      for (var i = 0; i < keys.length; i += 1) {\n        var key = keys[i];\n        if (key === 'default' || key === 'styled') {\n          continue;\n        }\n        try {\n          finalStyled[key] = current[key];\n        } catch (error) {\n          // ignore reassignment errors for read-only descriptors\n        }\n      }\n    } catch (error) {\n      // ignore reflection errors\n    }\n  }\n  if (!finalStyled.styled) {\n    finalStyled.styled = finalStyled;\n  }\n  if (!finalStyled.default) {\n    finalStyled.default = finalStyled;\n  }\n  module.exports = finalStyled;\n  module.exports.default = finalStyled;\n  module.exports.styled = finalStyled;\n  try {\n    Object.defineProperty(module.exports, '__esModule', { value: true });\n  } catch (error) {\n    module.exports.__esModule = true;\n  }\n})();\n`;

  const sourceMapIndex = source.lastIndexOf('\n//# sourceMappingURL=');
  if (sourceMapIndex !== -1) {
    source = source.slice(0, sourceMapIndex) + injection + source.slice(sourceMapIndex);
  } else {
    source += injection;
  }

  writeFileSync(absolutePath, source, 'utf8');
  bundleChanged = true;
}

if (bundleChanged) {
  console.info('[styled-components] Applied runtime export harmonization.');
}

const adminDistDir = join(cmsDir, 'node_modules', '@strapi', 'admin', 'dist');
let adminChanged = false;

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

    let contents = readFileSync(fullPath, 'utf8');
    if (!contents.includes("require('styled-components')") && !contents.includes('require("styled-components")')) {
      continue;
    }
    if (contents.includes(REQUIRE_MARKER)) {
      continue;
    }

    const pattern = /(\s*)(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\((['\"])styled-components\4\);/gm;
    let replaced = false;
    contents = contents.replace(pattern, (_, indent, keyword, identifier, quote) => {
      replaced = true;
      const moduleIdentifier = `${identifier}Module__birdrock`;
      return [
        `${indent}${keyword} ${moduleIdentifier} = require(${quote}styled-components${quote});`,
        `${indent}${REQUIRE_MARKER}`,
        `${indent}${keyword} ${identifier} = (() => {`,
        `${indent}  var mod = ${moduleIdentifier};`,
        `${indent}  if (!mod) {`,
        `${indent}    return mod;`,
        `${indent}  }`,
        `${indent}  var candidate = typeof mod === 'function' ? mod : mod.styled || mod.default || mod;`,
        `${indent}  if (candidate && typeof candidate === 'object' && typeof candidate.default === 'function') {`,
        `${indent}    candidate = candidate.default;`,
        `${indent}  }`,
        `${indent}  if (typeof candidate !== 'function') {`,
        `${indent}    candidate = mod;`,
        `${indent}  }`,
        `${indent}  if (candidate && typeof candidate === 'function' && mod && candidate !== mod) {`,
        `${indent}    try {`,
        `${indent}      var keys = Object.getOwnPropertyNames(mod);`,
        `${indent}      for (var i = 0; i < keys.length; i += 1) {`,
        `${indent}        var key = keys[i];`,
        `${indent}        if (key === 'default' || key === 'styled') {`,
        `${indent}          continue;`,
        `${indent}        }`,
        `${indent}        try {`,
        `${indent}          candidate[key] = mod[key];`,
        `${indent}        } catch (error) {`,
        `${indent}          // ignore reassignment errors`,
        `${indent}        }`,
        `${indent}      }`,
        `${indent}    } catch (error) {`,
        `${indent}      // ignore reflection errors`,
        `${indent}    }`,
        `${indent}  }`,
        `${indent}  if (candidate && typeof candidate === 'function') {`,
        `${indent}    if (!candidate.styled) {`,
        `${indent}      candidate.styled = candidate;`,
        `${indent}    }`,
        `${indent}    if (!candidate.default) {`,
        `${indent}      candidate.default = candidate;`,
        `${indent}    }`,
        `${indent}  }`,
        `${indent}  return candidate;`,
        `${indent})();`
      ].join('\n');
    });

    if (replaced) {
      writeFileSync(fullPath, contents, 'utf8');
      adminChanged = true;
    }
  }
}

if (existsSync(adminDistDir)) {
  walk(adminDistDir);
}

if (adminChanged) {
  console.info('[styled-components] Normalized Strapi styled-components requires.');
}
