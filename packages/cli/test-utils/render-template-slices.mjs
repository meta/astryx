// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Scaffolds every ready page template and takes it round trip, one
 *   slice per test file, so the Node legs can spread the templates: it
 *   renders, gives the page back exactly, reports a hand edit of its text,
 *   and renders the same again from what came back.
 * @input A slice number (1-based) and the slice count.
 * @output A describe block that takes that slice's templates round trip.
 * @position Test support for packages/cli/api/render/render.templates.*.test.mjs.
 */

import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {render} from '../api/render/render.mjs';
import {
  readSourceBlock,
  recordedText,
  renderedHeadOf,
  renderedMarkupOf,
} from '../foundation/render/source-block.mjs';
import {template} from '../api/template/template.mjs';
import {ensureBuiltOnce} from '../clients/cli/commands/ensure-core-built.mjs';
import {makeLinkedFixture, removeLinkedFixture} from './linked-fixture.mjs';

/** The preload that gives a page process a fixed clock. */
const FIXED_CLOCK = fileURLToPath(
  new URL('./fixed-clock.mjs', import.meta.url),
);

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
 * Take a rendered template round trip, and say what went wrong, if anything:
 * `--reverse` gives back every file byte for byte (`exact`, not `edited`); a
 * hand edit of one run of text in the markup is reported; and the page that
 * came back renders the same markup, styles and files again.
 * @param {string} home
 * @param {string} id
 * @returns {Promise<string | null>}
 */
async function roundTrip(home, id) {
  const html = fs.readFileSync(
    path.join(home, 'templates', id, 'page.html'),
    'utf8',
  );
  const block = readSourceBlock(html);
  if (!block.found || !('source' in block))
    return 'the rendered file has no embedded source';
  const {source} = block;
  const back = /** @type {any} */ (
    await render(`templates/${id}/page.html`, {
      cwd: home,
      reverse: true,
      out: `back/${id}/page.tsx`,
    })
  ).data;
  if (
    back.mode !== 'embedded' ||
    back.exact !== true ||
    back.edited !== false
  ) {
    return `reverse: mode ${back.mode}, exact ${back.exact}, edited ${back.edited}`;
  }
  for (const [i, f] of source.files.entries()) {
    const written = fs.readFileSync(path.join(home, back.files[i]));
    if (!written.equals(Buffer.from(f.base64, 'base64')))
      return `reverse: ${back.files[i]} differs from the embedded ${f.path}`;
  }
  const page = fs.readFileSync(path.join(home, 'templates', id, 'page.tsx'));
  if (!page.equals(fs.readFileSync(path.join(home, back.output))))
    return 'reverse: the page differs from the template source';
  // A hand edit of one run of text in the markup is reported, and names the
  // old text. The run is one that appears once in the markup, edited there.
  const markup = renderedMarkupOf(html) ?? '';
  const runs = source.markup ? (recordedText(source.markup)?.runs ?? []) : [];
  const run = runs.find(r => markup.split(r).length === 2);
  if (!run)
    return 'edit: no run of text appears exactly once in the markup, so no hand edit was tried';
  const at = html.indexOf(markup);
  fs.writeFileSync(
    path.join(home, 'templates', id, 'edited.html'),
    `${html.slice(0, at)}${markup.replace(run, `${run} (edited)`)}${html.slice(at + markup.length)}`,
  );
  const edited = /** @type {any} */ (
    await render(`templates/${id}/edited.html`, {
      cwd: home,
      reverse: true,
      out: `edited/${id}/page.tsx`,
    })
  ).data;
  if (
    edited.edited !== true ||
    !edited.edits?.some((/** @type {any} */ e) => e.was === run)
  ) {
    return `edit: ${JSON.stringify(run)} changed, reported edited ${edited.edited} with ${JSON.stringify(edited.edits)}`;
  }
  /** @param {string} page @param {string} out */
  const markupOf = async (page, out) => {
    await render(page, {cwd: home, out});
    return fs.readFileSync(path.join(home, out), 'utf8');
  };
  const again = await markupOf(`back/${id}/page.tsx`, `back/${id}/page.html`);
  if (renderedMarkupOf(again) !== renderedMarkupOf(html))
    return 'render again: the markup differs';
  const againBlock = readSourceBlock(again);
  if (renderedHeadOf(again).style !== renderedHeadOf(html).style)
    return 'render again: the styles differ';
  const sums = (/** @type {any} */ b) =>
    'source' in b
      ? b.source.files.map((/** @type {any} */ f) => f.sha256).join()
      : '';
  if (sums(againBlock) !== sums(block))
    return 'render again: the carried files differ';
  return null;
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
  describe(`render(): every ready page template, round trip (slice ${slice} of ${count})`, () => {
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

    it('scaffolds each one, renders it, gives it back exactly, reports a hand edit, and renders the same again', async () => {
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
      // Every page process the renders start reads one fixed clock, so a
      // page that shows the time renders the same markup each time.
      const nodeOptions = process.env.NODE_OPTIONS;
      process.env.NODE_OPTIONS = [
        nodeOptions,
        `--import=${pathToFileURL(FIXED_CLOCK).href}`,
      ]
        .filter(Boolean)
        .join(' ');
      try {
        for (let i = 0; i < ids.length; i += 4) {
          await Promise.all(
            ids.slice(i, i + 4).map(async id => {
              try {
                await render(`templates/${id}/page.tsx`, {cwd: home});
                const problem = await roundTrip(home, id);
                if (problem) failed.push(`${id}: ${problem}`);
              } catch (e) {
                failed.push(
                  `${id}: ${/** @type {any} */ (e).code} ${/** @type {any} */ (e).message}`,
                );
              }
            }),
          );
        }
      } finally {
        if (nodeOptions === undefined) delete process.env.NODE_OPTIONS;
        else process.env.NODE_OPTIONS = nodeOptions;
      }
      expect(failed).toEqual([]);
    }, 900_000);
  });
}
