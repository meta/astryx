#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Write the template icon placeholder package from its table.
 *
 * `packages/cli/assets/icons/template-icons.json` names, for each icon
 * definition a bundled template draws, the library icon that draws it in each
 * look. This script writes `packages/template-icons`: one module per look,
 * each re-exporting that icon as `<Meaning>Icon`. Template sources import
 * from it, so every preview draws the template's icons with no extra step.
 * The CLI reads the same table when it copies a template.
 *
 * Run `node packages/cli/scripts/generate-template-icons.mjs` after editing
 * the table, or with `--check` to fail when the package is out of date.
 *
 * @input The template icon table
 * @output packages/template-icons (package.json and one module per look)
 * @position CLI build tooling; checked by template-placeholders.test.mjs
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  PLACEHOLDER_MODULE,
  placeholderExportName,
  placeholderModule,
  placeholderSource,
} from '../foundation/discovery/template-placeholders.mjs';

export {placeholderExportName};

const CLI_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const TABLE = path.join(CLI_DIR, 'assets/icons/template-icons.json');
const PACKAGE_DIR = path.resolve(CLI_DIR, '../template-icons');

const HEADER =
  '// Copyright (c) Meta Platforms, Inc. and affiliates.\n\n' +
  '// Generated from packages/cli/assets/icons/template-icons.json by\n' +
  '// packages/cli/scripts/generate-template-icons.mjs. Do not edit.\n\n';

/**
 * Every file the package holds, by path relative to the package directory.
 * @param {import('../foundation/discovery/template-placeholders.mjs').PlaceholderTable} table
 * @returns {Map<string, string>}
 */
export function templateIconFiles(table) {
  const files = new Map();
  /** @type {Record<string, {types: string, default: string}>} */
  const exports = {};
  for (const look of Object.keys(table.looks)) {
    const lines = [];
    for (const meaning of Object.keys(table.meanings)) {
      const drawn = placeholderSource(meaning, look, table);
      if (drawn) {
        lines.push(
          `export {${drawn.export} as ${placeholderExportName(meaning)}} from '${drawn.module}';`,
        );
      }
    }
    const dir = placeholderModule(look)
      .slice(PLACEHOLDER_MODULE.length)
      .replace(/^\//u, '');
    const body = `${HEADER}${lines.join('\n')}\n`;
    files.set(path.posix.join(dir, 'index.js'), body);
    files.set(path.posix.join(dir, 'index.d.ts'), body);
    exports[dir ? `./${dir}` : '.'] = {
      types: `./${path.posix.join(dir, 'index.d.ts')}`,
      default: `./${path.posix.join(dir, 'index.js')}`,
    };
  }
  const manifest = {
    name: '@astryxdesign/template-icons',
    version: '0.0.0',
    private: true,
    description:
      'Icon placeholders for Astryx templates: one export per icon meaning, drawn with Heroicons, or Lucide in the lucide look.',
    license: 'MIT',
    type: 'module',
    sideEffects: false,
    exports,
    peerDependencies: {
      '@heroicons/react': '^2.2.0',
      'lucide-react': '^1.66.0',
      react: '>=18',
    },
    peerDependenciesMeta: {'lucide-react': {optional: true}},
  };
  files.set('package.json', `${JSON.stringify(manifest, null, 2)}\n`);
  return files;
}

function main() {
  const check = process.argv.includes('--check');
  const table = JSON.parse(fs.readFileSync(TABLE, 'utf-8'));
  const stale = [];
  for (const [rel, text] of templateIconFiles(table)) {
    const file = path.join(PACKAGE_DIR, rel);
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : null;
    if (current === text) continue;
    stale.push(rel);
    if (!check) {
      fs.mkdirSync(path.dirname(file), {recursive: true});
      fs.writeFileSync(file, text);
    }
  }
  if (check && stale.length > 0) {
    console.error(
      `packages/template-icons is out of date (${stale.join(', ')}). Run node packages/cli/scripts/generate-template-icons.mjs.`,
    );
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
