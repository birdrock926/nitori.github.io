#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const cmsDir = dirname(scriptDir);

const BUNDLE_MARKER = '/* __birdrockStyledInterop */';

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

  const injection = `\n${BUNDLE_MARKER}\n(function() {\n  var current = module.exports;\n  var candidate = current && (typeof current === 'function' ? current : current.styled || current.default);\n  if (!candidate || typeof candidate !== 'function') {\n    return;\n  }\n  var descriptors = null;\n  try {\n    descriptors = Object.getOwnPropertyDescriptors(current);\n  } catch (error) {\n    // ignore descriptor retrieval failures\n  }\n  if (descriptors) {\n    for (var key in descriptors) {\n      if (key === 'default' || key === 'styled') {\n        continue;\n      }\n      var descriptor = descriptors[key];\n      try {\n        Object.defineProperty(candidate, key, descriptor);\n      } catch (descriptorError) {\n        // ignore descriptor assignment failures\n      }\n    }\n  } else if (current && current !== candidate) {\n    try {\n      var keys = Object.getOwnPropertyNames(current);\n      for (var i = 0; i < keys.length; i += 1) {\n        var key = keys[i];\n        if (key === 'default' || key === 'styled') {\n          continue;\n        }\n        try {\n          candidate[key] = current[key];\n        } catch (assignmentError) {\n          // ignore reassignment errors\n        }\n      }\n    } catch (reflectionError) {\n      // ignore reflection errors\n    }\n  }\n  if (candidate.styled !== candidate) {\n    try {\n      Object.defineProperty(candidate, 'styled', { configurable: true, enumerable: true, writable: true, value: candidate });\n    } catch (styledError) {\n      try {\n        candidate.styled = candidate;\n      } catch (writeError) {\n        // ignore write failures\n      }\n    }\n  }\n  if (candidate.default !== candidate) {\n    try {\n      Object.defineProperty(candidate, 'default', { configurable: true, enumerable: true, writable: true, value: candidate });\n    } catch (defaultError) {\n      try {\n        candidate.default = candidate;\n      } catch (writeError) {\n        // ignore write failures\n      }\n    }\n  }\n  try {\n    Object.defineProperty(candidate, '__esModule', { configurable: true, enumerable: true, writable: true, value: true });\n  } catch (esModuleError) {\n    try {\n      candidate.__esModule = true;\n    } catch (writeError) {\n      // ignore write failures\n    }\n  }\n  module.exports = candidate;\n  module.exports.default = candidate;\n  module.exports.styled = candidate;\n})();\n`;

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
