// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Builds the theme editor's part data and component docs for the
 *   CLI's own Core, once per test run, into the run's folder.
 * @input The folder, as the first argument.
 * @output `<folder>/<core key>/parts.json` and `docs.json`.
 * @position Run by the node project's globalSetup in plain Node, as the CLI
 *   runs: the module runner globalSetup itself runs in does not give the
 *   theme build what it needs (import.meta.resolve). theme-cache.mjs copies
 *   the files into each fixture.
 */
import fs from 'node:fs';
import path from 'node:path';
import {CACHE_FILES, cacheRoot} from './theme-cache.mjs';

/**
 * Build the part data and component docs of the CLI's own Core, in a
 * fixture of their own, and keep them in `dir/<core key>/`.
 * @param {string} dir
 */
async function warmThemeCache(dir) {
  const {makeLinkedFixture, removeLinkedFixture} =
    await import('./linked-fixture.mjs');
  const {FIXTURE_PACKAGES, writeFixtureBaseTheme} =
    await import('./base-theme-fixture.mjs');
  const {themeEditNew} = await import('../api/theme-edit/theme-edit.mjs');
  const fixture = makeLinkedFixture('astryx-theme-cache-', FIXTURE_PACKAGES);
  try {
    writeFixtureBaseTheme(fixture, 'neutral');
    // A new theme reads the part data and the component docs, so the
    // editor builds both into the fixture's cache.
    await themeEditNew('warm', {cwd: fixture, like: 'neutral'});
    const cache = cacheRoot(path.dirname(fixture));
    for (const key of fs.readdirSync(cache))
      for (const name of CACHE_FILES) {
        const from = path.join(cache, key, name);
        if (!fs.existsSync(from)) continue;
        fs.mkdirSync(path.join(dir, key), {recursive: true});
        fs.copyFileSync(from, path.join(dir, key, name));
      }
  } finally {
    removeLinkedFixture(fixture);
  }
}

await warmThemeCache(/** @type {string} */ (process.argv[2]));
