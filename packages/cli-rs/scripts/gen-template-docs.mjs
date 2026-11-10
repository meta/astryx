// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Compile the CLI's own template docs ahead of time into one JSON file the
 * Rust binary embeds: every `*.doc.*` / `*.template.*` under
 * `packages/cli/assets/templates`, keyed by its path relative to that folder,
 * with the view the JS CLI's template discovery reads.
 *
 * Usage: node scripts/gen-template-docs.mjs [--cli <packages/cli with node_modules>]
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const crate = path.resolve(here, '..');
const argIdx = process.argv.indexOf('--cli');
const cliRoot =
  argIdx > 0 ? path.resolve(process.argv[argIdx + 1]) : path.resolve(crate, '..', 'cli');
const assets = path.join(path.resolve(crate, '..', 'cli'), 'assets', 'templates');

const {readDocView} = await import(
  pathToFileURL(path.join(cliRoot, 'foundation', 'doc-compiler', 'read.mjs')).href
);

const SUFFIX = /\.(template|doc)\.(ts|mjs|js)$/;
/** @type {string[]} */
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (SUFFIX.test(e.name)) files.push(full);
  }
})(assets);
files.sort();

/** @type {Record<string, unknown>} */
const out = {};
for (const file of files) {
  const rel = path.relative(assets, file).split(path.sep).join('/');
  // Read the same file the Rust CLI root ships, through the JS CLI's reader.
  const view = await readDocView(file, {root: 'templates', loader: 'template'});
  out[rel] = view ?? null;
}

const dest = path.join(crate, 'src', 'commands', 'template', 'embedded_templates.json');
fs.writeFileSync(dest, JSON.stringify(out) + '\n');
console.log(`wrote ${Object.keys(out).length} template docs to ${path.relative(crate, dest)}`);

// The bundled themes, as theme discovery reads them (paths relative to the
// bundled themes folder).
const {discoverBundledThemes, THEMES_DIR} = await import(
  pathToFileURL(path.join(cliRoot, 'foundation', 'discovery', 'theme-discovery.mjs')).href
);
const themes = discoverBundledThemes().map(theme => ({
  ...theme,
  sourceDir: path.relative(THEMES_DIR, theme.sourceDir),
  docPath: path.relative(THEMES_DIR, theme.docPath),
}));
const themesDest = path.join(crate, 'src', 'commands', 'theme', 'embedded_themes.json');
fs.writeFileSync(themesDest, JSON.stringify(themes, null, 1) + '\n');
console.log(`wrote ${themes.length} bundled themes to ${path.relative(crate, themesDest)}`);
