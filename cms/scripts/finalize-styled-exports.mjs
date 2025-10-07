#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const cmsDir = dirname(scriptDir);

const MARKER = '/* __birdrockStyledInterop */';
const files = [
  'node_modules/styled-components/dist/styled-components.cjs.js',
  'node_modules/styled-components/dist/styled-components.browser.cjs.js',
];

let changed = false;

for (const relativePath of files) {
  const absolutePath = join(cmsDir, relativePath);
  if (!existsSync(absolutePath)) {
    continue;
  }

  let source = readFileSync(absolutePath, 'utf8');
  if (source.includes(MARKER)) {
    continue;
  }

  const injection = `\n${MARKER}\n(function() {\n  var current = module.exports;\n  var candidate = current && (current.styled || current.default || current);\n  if (candidate && typeof candidate === 'object' && typeof candidate.default === 'function') {\n    candidate = candidate.default;\n  }\n  if (typeof candidate !== 'function') {\n    if (typeof current === 'function') {\n      candidate = current;\n    } else {\n      return;\n    }\n  }\n  var finalStyled = candidate;\n  if (current && current !== finalStyled) {\n    try {\n      var keys = Object.getOwnPropertyNames(current);\n      for (var i = 0; i < keys.length; i += 1) {\n        var key = keys[i];\n        if (key === 'default' || key === 'styled') {\n          continue;\n        }\n        try {\n          finalStyled[key] = current[key];\n        } catch (error) {\n          // ignore reassignment errors for read-only descriptors\n        }\n      }\n    } catch (error) {\n      // ignore reflection errors\n    }\n  }\n  if (!finalStyled.styled) {\n    finalStyled.styled = finalStyled;\n  }\n  if (!finalStyled.default) {\n    finalStyled.default = finalStyled;\n  }\n  module.exports = finalStyled;\n  module.exports.default = finalStyled;\n  module.exports.styled = finalStyled;\n  try {\n    Object.defineProperty(module.exports, '__esModule', { value: true });\n  } catch (error) {\n    module.exports.__esModule = true;\n  }\n})();\n`;

  const sourceMapIndex = source.lastIndexOf('\n//# sourceMappingURL=');
  if (sourceMapIndex !== -1) {
    source = source.slice(0, sourceMapIndex) + injection + source.slice(sourceMapIndex);
  } else {
    source += injection;
  }

  writeFileSync(absolutePath, source, 'utf8');
  changed = true;
}

if (changed) {
  console.info('[styled-components] Applied runtime export harmonization.');
}
