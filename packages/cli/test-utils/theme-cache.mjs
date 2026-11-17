// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The theme editor's part data, component docs and page component
 *   items for the CLI's own Core, built once per test run and copied into each fixture that links
 *   that Core, as a second run of the editor in an app finds them.
 * @input The run's folder for them (`astryxThemeCacheDir`, provided by the
 *   node project's globalSetup) and the fixture's root.
 * @output `seedThemeCache(root)` copies them into a fixture's
 *   `node_modules/.cache/astryx-theme`.
 * @position Test support, read by linked-fixture.mjs; theme-cache-warm.mjs
 *   builds them. The cache is built through the editor's own command, and is keyed by Core's
 *   version and stylesheet, so a fixture with another Core never reads it,
 *   and a test that writes or removes a cache file still sees the editor
 *   build it again.
 */
import fs from 'node:fs';
import path from 'node:path';
import {inject} from 'vitest';

/** The cache files of one Core: the part data, the component docs and the component items of the editor's pages. */
export const CACHE_FILES = ['parts.json', 'docs.json', 'items.json'];

/**
 * A fixture's editor cache folder, beside the node_modules that holds its
 * Core.
 * @param {string} root the fixture's root
 */
export const cacheRoot = root =>
  path.join(root, 'node_modules', '.cache', 'astryx-theme');

/**
 * Copy this run's built cache into a fixture's own cache folder, where the
 * editor looks for it.
 * @param {string} root the fixture's root, which holds its node_modules
 */
export function seedThemeCache(root) {
  let dir;
  try {
    dir = inject('astryxThemeCacheDir');
  } catch {
    // Not in a run of the node project: each fixture builds its own.
    return;
  }
  if (typeof dir !== 'string' || !fs.existsSync(dir)) return;
  for (const key of fs.readdirSync(dir)) {
    const to = path.join(cacheRoot(root), key);
    fs.mkdirSync(to, {recursive: true});
    for (const name of CACHE_FILES) {
      const from = path.join(dir, key, name);
      if (fs.existsSync(from)) fs.copyFileSync(from, path.join(to, name));
    }
  }
}
