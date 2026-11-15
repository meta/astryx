// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The theme editor's part data and component docs for the CLI's own
 *   Core, built once per test run and copied into each fixture that links
 *   that Core, as a second run of the editor in an app finds them.
 * @input The run's folder for them (`ASTRYX_TEST_THEME_CACHE`, set by the
 *   node project's globalSetup) and the fixture's root.
 * @output `warmThemeCache(dir)` builds them into `dir`; `seedThemeCache(root)`
 *   copies them into a fixture's `node_modules/.cache/astryx-theme`.
 * @position Test support, read by globalSetup and linked-fixture.mjs. The
 *   cache is keyed by Core's version and stylesheet, so a fixture with
 *   another Core never reads it, and a test that writes or removes a cache
 *   file still sees the editor build it again.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** The cache files of one Core: the part data and the component docs. */
const CACHE_FILES = ['parts.json', 'docs.json'];

/**
 * Build the part data and component docs of the CLI's own Core, in a
 * fixture of their own, and keep them in `dir/<core key>/`.
 * @param {string} dir
 */
export async function warmThemeCache(dir) {
  const {makeLinkedFixture, removeLinkedFixture} =
    await import('./linked-fixture.mjs');
  const {FIXTURE_PACKAGES} = await import('./base-theme-fixture.mjs');
  const {openProject} = await import('../api/theme-edit/_project.mjs');
  const {partData} = await import('../api/theme-edit/_parts.mjs');
  const fixture = makeLinkedFixture('astryx-theme-cache-', FIXTURE_PACKAGES);
  try {
    const project = await openProject(fixture);
    await partData(project);
    const to = path.join(dir, path.basename(project.cacheDir));
    fs.mkdirSync(to, {recursive: true});
    for (const name of CACHE_FILES) {
      const from = path.join(project.cacheDir, name);
      if (fs.existsSync(from)) fs.copyFileSync(from, path.join(to, name));
    }
  } finally {
    removeLinkedFixture(fixture);
  }
}

/**
 * Copy this run's built cache into a fixture's own cache folder, where the
 * editor looks for it.
 * @param {string} root the fixture's root, which holds its node_modules
 */
export function seedThemeCache(root) {
  const dir = process.env.ASTRYX_TEST_THEME_CACHE;
  if (!dir || !fs.existsSync(dir)) return;
  for (const key of fs.readdirSync(dir)) {
    const to = path.join(root, 'node_modules', '.cache', 'astryx-theme', key);
    fs.mkdirSync(to, {recursive: true});
    for (const name of CACHE_FILES) {
      const from = path.join(dir, key, name);
      if (fs.existsSync(from)) fs.copyFileSync(from, path.join(to, name));
    }
  }
}

/** A folder for this run's cache, under the temp folder. */
export function themeCacheFolder() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-test-theme-cache-'));
}
