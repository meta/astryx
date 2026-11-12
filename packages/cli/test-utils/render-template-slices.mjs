// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Scaffolds and renders every ready page template, one slice per test
 *   file, so the Node legs can spread the templates.
 * @input A slice number (1-based) and the slice count.
 * @output A describe block that renders that slice's templates.
 * @position Test support for packages/cli/api/render/render.templates.*.test.mjs.
 */

import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {render} from '../api/render/render.mjs';
import {template} from '../api/template/template.mjs';
import {makeLinkedFixture, removeLinkedFixture} from './linked-fixture.mjs';

/** A lock older than this is left by a run that stopped mid-build. */
const STALE_LOCK_MS = 15 * 60_000;

/** @param {number} ms */
const sleep = ms =>
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * Builds a theme package's dist when it has none. Slices run in parallel
 * workers and can need the same theme, so one builder at a time holds a lock
 * and checks again for the dist before it builds.
 * @param {string} themeDir
 */
function buildThemeOnce(themeDir) {
  const lock = path.join(
    os.tmpdir(),
    `astryx-theme-build-${path.basename(themeDir)}.lock`,
  );
  for (;;) {
    try {
      fs.mkdirSync(lock);
      break;
    } catch (error) {
      if (/** @type {any} */ (error).code !== 'EEXIST') throw error;
      try {
        if (Date.now() - fs.statSync(lock).mtimeMs > STALE_LOCK_MS)
          fs.rmSync(lock, {recursive: true, force: true});
      } catch {
        // The holder released the lock between the two calls.
      }
      sleep(500);
    }
  }
  try {
    if (fs.existsSync(path.join(themeDir, 'dist'))) return;
    const built = spawnSync('pnpm', ['run', 'build'], {
      cwd: themeDir,
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    expect(
      built.status,
      `${path.basename(themeDir)} build: ${built.stderr}`,
    ).toBe(0);
  } finally {
    fs.rmSync(lock, {recursive: true, force: true});
  }
}

/**
 * Scaffolds and renders every `count`th ready page template, starting at
 * `slice`.
 * @param {number} slice
 * @param {number} count
 */
export function describeTemplateSlice(slice, count) {
  describe(`render(): every ready page template (slice ${slice} of ${count})`, () => {
    /** @type {string} */
    let home;

    beforeAll(() => {
      home = makeLinkedFixture('astryx-render-templates-', [
        '@astryxdesign',
        '@stylexjs',
        '@heroicons',
        'lucide-react',
        'react',
        'react-dom',
        'recharts',
      ]);
    });

    afterAll(() => {
      removeLinkedFixture(home);
    });

    it('scaffolds and renders each one', async () => {
      const listed = /** @type {any} */ (
        await template(undefined, {list: true, type: 'page', cwd: home})
      );
      /** @type {string[]} */
      const ready = listed.data
        .filter((/** @type {any} */ t) => t.isReady)
        .map((/** @type {any} */ t) => t.id);
      expect(ready.length).toBeGreaterThanOrEqual(count);
      const ids = ready.filter((_, i) => i % count === slice - 1);
      /** @type {Set<string>} */
      const themes = new Set();
      for (const id of ids) {
        await template(id, {
          targetPath: `templates/${id}`,
          type: 'page',
          cwd: home,
        });
        const source = fs.readFileSync(
          path.join(home, 'templates', id, 'page.tsx'),
          'utf8',
        );
        for (const m of source.matchAll(
          /from '(@astryxdesign\/theme-[a-z0-9-]+)[/']/g,
        ))
          themes.add(m[1]);
      }
      // The node tests build Core only. A template that imports a theme's
      // build needs that build.
      for (const name of themes)
        buildThemeOnce(
          fs.realpathSync(path.join(home, '..', 'node_modules', name)),
        );
      /** @type {string[]} */
      const failed = [];
      for (let i = 0; i < ids.length; i += 4) {
        await Promise.all(
          ids.slice(i, i + 4).map(async id => {
            try {
              await render(`templates/${id}/page.tsx`, {cwd: home});
            } catch (e) {
              failed.push(
                `${id}: ${/** @type {any} */ (e).code} ${/** @type {any} */ (e).message}`,
              );
            }
          }),
        );
      }
      expect(failed).toEqual([]);
    }, 900_000);
  });
}
