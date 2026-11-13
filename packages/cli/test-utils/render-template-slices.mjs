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
import {ensureBuiltOnce} from '../clients/cli/commands/ensure-core-built.mjs';
import {makeLinkedFixture, removeLinkedFixture} from './linked-fixture.mjs';

/**
 * Builds a theme package's dist when it has none. Slices run in parallel
 * workers and can need the same theme, so one builder at a time holds the
 * lock, and the others wait until the build is current.
 * @param {string} themeDir
 */
function buildThemeOnce(themeDir) {
  ensureBuiltOnce({
    isBuilt: () => fs.existsSync(path.join(themeDir, 'dist')),
    build: () => {
      const built = spawnSync('pnpm', ['run', 'build'], {
        cwd: themeDir,
        encoding: 'utf8',
        shell: process.platform === 'win32',
      });
      expect(
        built.status,
        `${path.basename(themeDir)} build: ${built.stderr}`,
      ).toBe(0);
    },
    lockDir: path.join(
      os.tmpdir(),
      `astryx-theme-build-${path.basename(themeDir)}.lock`,
    ),
  });
}

/**
 * The templates slice `slice` (1-based) of `count` renders: every `count`th
 * one, so the slices together hold each template exactly once.
 * @param {string[]} ids every ready page template, as the registry lists them
 * @param {number} slice
 * @param {number} count
 * @returns {string[]}
 */
export function templateSlice(ids, slice, count) {
  return ids.filter((_, i) => i % count === slice - 1);
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
      const ids = templateSlice(ready, slice, count);
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
