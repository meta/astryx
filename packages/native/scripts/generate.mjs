// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file scripts/generate.mjs
 * @input Built contract tools (dist/) and core documentation
 * @output --types: dist/types/*.d.ts. --apple: apple/Sources/AstryxNative/Generated/*.swift
 * @position Run by `build` and `generate:apple`; the Swift output is committed
 *   and a test fails when it drifts from the contracts
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {loadCoreDoc} from './core-docs.mjs';

const PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const APPLE_GENERATED = path.join(
  PACKAGE_ROOT,
  'apple',
  'Sources',
  'AstryxNative',
  'Generated',
);

const args = new Set(process.argv.slice(2));
if (!args.has('--types') && !args.has('--apple')) {
  console.error('Usage: node scripts/generate.mjs [--types] [--apple]');
  process.exit(1);
}

const {buildContracts, generateTypeScript, generateSwift} = await import(
  pathToFileURL(path.join(PACKAGE_ROOT, 'dist', 'contract', 'index.js')).href
);
const {contracts, warnings} = await buildContracts(loadCoreDoc);
for (const warning of warnings) console.warn(`warning: ${warning.message}`);

function writeAll(dir, files) {
  fs.mkdirSync(dir, {recursive: true});
  for (const [name, contents] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), contents);
  }
  console.log(
    `wrote ${Object.keys(files).length} files to ${path.relative(PACKAGE_ROOT, dir)}`,
  );
}

if (args.has('--types'))
  writeAll(
    path.join(PACKAGE_ROOT, 'dist', 'types'),
    generateTypeScript(contracts),
  );
if (args.has('--apple')) writeAll(APPLE_GENERATED, generateSwift(contracts));
