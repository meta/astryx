// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Check or fix the canonical order of the curated RTL targets.
 * @input apps/storybook/rtl-audit/targets.json
 * @output Exit 1 with the first out-of-order target (check), or a rewritten,
 *   Prettier-formatted file (`--fix`).
 * @position Guardrail beside the RTL audit; the node suite runs the same check.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import prettier from 'prettier';
import {firstUnsortedTarget, sortTargets} from './rtl-audit-coverage.mjs';

const file = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'targets.json',
);
const targets = JSON.parse(fs.readFileSync(file, 'utf8'));

if (process.argv.includes('--fix')) {
  const text = await prettier.format(JSON.stringify(sortTargets(targets)), {
    ...(await prettier.resolveConfig(file)),
    filepath: file,
  });
  fs.writeFileSync(file, text);
  console.log(`sorted ${targets.length} RTL targets`);
} else {
  const index = firstUnsortedTarget(targets);
  if (index !== -1) {
    const {component, storyId} = targets[index];
    console.error(
      `targets.json is not sorted by component, then story: ${component} / ${storyId} (entry ${index}) is out of order. Run node apps/storybook/rtl-audit/sort-targets.mjs --fix`,
    );
    process.exit(1);
  }
  console.log(`${targets.length} RTL targets are sorted`);
}
