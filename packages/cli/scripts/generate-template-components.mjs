#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Writes assets/templates/components.generated.json at `prepack`: the
 * components each template source Astryx ships composes, keyed by a hash of
 * the source, so the published package reads a shipped template's components
 * without parsing it. The file is not committed; a checkout without it parses
 * every source, with the same result. `--clean` (at `postpack`) removes it.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CLI_ROOT} from '../foundation/fs/paths.mjs';
import {
  parsedComponents,
  sourceKey,
  TEMPLATE_COMPONENTS_FILE,
} from '../foundation/discovery/template-adapter.mjs';

const TEMPLATES_DIR = path.join(CLI_ROOT, 'assets', 'templates');
/** Page and block templates: the sources whose components are read. */
const SOURCE_DIRS = ['pages', 'blocks'];

/**
 * Every `.tsx` file under `dir`, sorted.
 * @param {string} dir
 * @returns {string[]}
 */
function sourcesIn(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, {withFileTypes: true})
    .flatMap(entry => {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) return sourcesIn(file);
      return entry.name.endsWith('.tsx') ? [file] : [];
    })
    .sort();
}

/**
 * The file's text: each source's key and components, in key order.
 * @returns {string}
 */
export function templateComponentsText() {
  /** @type {Record<string, string[]>} */
  const byKey = {};
  for (const sub of SOURCE_DIRS) {
    for (const file of sourcesIn(path.join(TEMPLATES_DIR, sub))) {
      const source = fs.readFileSync(file, 'utf-8');
      byKey[sourceKey(source)] = parsedComponents(source);
    }
  }
  const sorted = Object.fromEntries(
    Object.keys(byKey)
      .sort()
      .map(key => [key, byKey[key]]),
  );
  return JSON.stringify(sorted) + '\n';
}

const isMain =
  Boolean(process.argv[1]) &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain && process.argv.includes('--clean')) {
  // `postpack`: the checkout goes back to parsing, so a later edit to the
  // parser shows there.
  fs.rmSync(TEMPLATE_COMPONENTS_FILE, {force: true});
} else if (isMain) {
  fs.writeFileSync(TEMPLATE_COMPONENTS_FILE, templateComponentsText());
  console.log(
    `Wrote ${path.relative(process.cwd(), TEMPLATE_COMPONENTS_FILE)}.`,
  );
}
