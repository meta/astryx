#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file generate-data-tokens.mjs
 * @input packages/core/src/theme/dataTokens.stylex.ts
 * @output packages/core/src/theme/domainTokens/dataTokens.ts
 * @position Keeps the non-StyleX token-resolution view derived from the public StyleX source
 *
 * Usage:
 *   node scripts/generate-data-tokens.mjs
 *   node scripts/generate-data-tokens.mjs --check
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(ROOT, 'packages/core/src/theme/dataTokens.stylex.ts');
const OUTPUT = path.join(
  ROOT,
  'packages/core/src/theme/domainTokens/dataTokens.ts',
);

export function parseDataTokenDefaults(source) {
  const block = source.match(
    /const dataTokenDefaults\s*=\s*\{([\s\S]*?)\}\s*as const;/,
  );
  if (!block) {
    throw new Error('Could not find the static dataTokenDefaults object');
  }

  const entries = [];
  const seen = new Set();
  const entryPattern = /'(--color-data-[^']+)'\s*:\s*'([^']+)'/g;
  for (const match of block[1].matchAll(entryPattern)) {
    const [, name, value] = match;
    if (seen.has(name)) {
      throw new Error(`Duplicate data token: ${name}`);
    }
    seen.add(name);
    entries.push([name, value]);
  }

  if (entries.length !== 56) {
    throw new Error(`Expected 56 data tokens, found ${entries.length}`);
  }
  return entries;
}

export function renderDataTokenDefaults(entries) {
  const declarations = entries
    .map(([name, value]) => `  '${name}': '${value}',`)
    .join('\n');

  return `// Copyright (c) Meta Platforms, Inc. and affiliates.\n\n/**\n * @file dataTokens.ts\n * @input dataTokens.stylex.ts (generated; do not edit)\n * @output dataTokenDefaults, DataTokenName\n * @position Plain compatibility view for theme validation and JavaScript token resolution\n *\n * Run \`pnpm generate:data-tokens\` after editing the canonical StyleX source.\n */\n\nexport const dataTokenDefaults = {\n${declarations}\n} as const;\n\nexport type DataTokenName = keyof typeof dataTokenDefaults;\n`;
}

export function generateDataTokenDefaults() {
  return renderDataTokenDefaults(
    parseDataTokenDefaults(fs.readFileSync(SOURCE, 'utf8')),
  );
}

function main() {
  const expected = generateDataTokenDefaults();
  if (process.argv.includes('--check')) {
    const actual = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, 'utf8') : '';
    if (actual !== expected) {
      console.error(
        'Data token compatibility view is stale. Run `pnpm generate:data-tokens`.',
      );
      process.exit(1);
    }
    console.log('Data token compatibility view is in sync.');
    return;
  }

  fs.writeFileSync(OUTPUT, expected);
  console.log(`Generated ${path.relative(ROOT, OUTPUT)}.`);
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
