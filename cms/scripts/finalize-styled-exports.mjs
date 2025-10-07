#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const cmsDir = dirname(scriptDir);

const BUNDLE_MARKER = '/* __birdrockStyledInterop_v2 */';

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

  const injection = `\n${BUNDLE_MARKER}\n(function() {\n  if (typeof module === 'undefined' || !module || !module.exports) {\n    return;\n  }\n  var current = module.exports;\n  var candidate = current;\n  if (candidate && typeof candidate === 'object' && typeof candidate.default === 'function') {\n    candidate = candidate.default;\n  }\n  if (typeof candidate !== 'function') {\n    return;\n  }\n  if (current && current !== candidate) {\n    try {\n      Object.assign(candidate, current);\n    } catch (assignError) {\n      // ignore assignment failures\n    }\n  }\n  try {\n    candidate.styled = candidate;\n  } catch (styledWriteError) {\n    // ignore write failures\n  }\n  try {\n    candidate.default = candidate;\n  } catch (defaultWriteError) {\n    // ignore write failures\n  }\n  try {\n    candidate.__esModule = true;\n  } catch (esModuleWriteError) {\n    // ignore write failures\n  }\n  module.exports = candidate;\n  module.exports.default = candidate;\n  module.exports.styled = candidate;\n})();\n`;

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
