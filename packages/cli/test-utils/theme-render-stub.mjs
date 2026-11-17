// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Stand-ins for the costly drawing of `experimental theme editor`'s
 * pages, for tests whose assertions are about settings, builds, files,
 * checks and messages, not the drawn pages. Drawing a page (rendering every
 * component on the server) costs seconds.
 *
 * - {@link stubDrawing}, every file of the node project's default
 *   (vitest.setup.node.mjs): only the drawing is stood in for. Everything
 *   the editor does around it (the build, the page's source and its key,
 *   the notes and warnings, the media sides, the written file) runs as it
 *   does for real; the drawn page is a small stand-in.
 * - {@link stubRenders}, the older form a file sets up itself: the whole
 *   sample page and sheet renders are stood in for.
 *
 * A file whose assertions read drawn pages, pictures or what a drawing
 * reports calls `realRenders(true)` at its top (the setup file sets every
 * file back to the default before it starts). `THEME_EDIT_REAL_RENDERS=1`
 * (or `THEME_EDIT_SLOW=1`) draws for real everywhere.
 *
 * Use of the older form, at the top of a test file:
 *   vi.mock('./_preview.mjs', async importOriginal =>
 *     (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
 *       await importOriginal(),
 *     ),
 *   );
 *
 * @position test-utils — used by the theme-edit test files
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const STATE = Symbol.for('astryx.test-utils.theme-render-stub');

/** Whether the long sweeps run: `THEME_EDIT_SLOW=1`. */
export const SLOW = process.env.THEME_EDIT_SLOW === '1';

/**
 * Whether every page is drawn for real: `THEME_EDIT_REAL_RENDERS=1` (the
 * mode a gate runs the editor suite in before a push), or the long sweeps.
 */
export const REAL_EVERYWHERE =
  SLOW || process.env.THEME_EDIT_REAL_RENDERS === '1';

/** @returns {{real: boolean, drawing: boolean, pinned: boolean}} */
function state() {
  const g = /** @type {any} */ (globalThis);
  return (g[STATE] ??= {real: REAL_EVERYWHERE, drawing: false, pinned: false});
}

/**
 * Back to the default, as every test file starts (the node project's setup
 * file calls it): the stand-in, or real drawing with
 * `THEME_EDIT_REAL_RENDERS=1`.
 */
export function resetRenders() {
  const s = state();
  s.pinned = false;
  s.drawing = false;
  s.real = REAL_EVERYWHERE;
}

/**
 * Keep the stand-in in this file even with `THEME_EDIT_REAL_RENDERS=1`: for
 * a file whose assertions are about what the editor says of a known set of
 * pages (which pictures it names, a file it cannot write), where the real
 * pages would add pages the assertions do not count.
 */
export function keepStandIn() {
  const s = state();
  s.pinned = true;
  s.drawing = false;
  s.real = false;
}

/**
 * Draw pages for real (true) or with the stand-in (false), leaving the
 * older whole-render stand-in ({@link stubRenders}) as it is: for a file
 * that stands in for the sample page and the sheet but reads what another
 * drawing returns.
 * @param {boolean} on
 */
export function realDrawing(on) {
  state().drawing = on;
}

/**
 * Render for real (true) or with the stand-in (false) from now on, until
 * the next call. With `THEME_EDIT_REAL_RENDERS=1` or `THEME_EDIT_SLOW=1`,
 * renders stay real.
 * @param {boolean} on
 */
export function realRenders(on) {
  const s = state();
  s.real = on || (REAL_EVERYWHERE && !s.pinned);
  if (!on) s.drawing = false;
}

/**
 * Run `fn` with real renders, then go back to the stand-in.
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withRealRenders(fn) {
  realRenders(true);
  try {
    return await fn();
  } finally {
    realRenders(false);
  }
}

/** @param {string} cwd @param {string} file */
const shown = (cwd, file) => path.relative(cwd, file).split(path.sep).join('/');

/**
 * The editor's render stamp on a stand-in page, so the editor reads it as a
 * page it wrote (a page without the stamp is the user's and is left alone).
 */
const STAND_IN_STAMP = `<!-- astryx: render of ${'0'.repeat(24)} ${'0'.repeat(16)} -->`;

/**
 * The settings a stand-in preview was written from, as its key, so the
 * stand-in is current exactly when the real page would be.
 * @param {any} data
 */
const standInKey = data =>
  JSON.stringify([
    data?.like ?? null,
    data?.mode ?? null,
    data?.settings ?? [],
  ]).replace(/-->/g, '');

/**
 * The preview module with its two renders replaced by the stand-in while
 * real renders are off.
 * @template {Record<string, any>} M
 * @param {M} original the real `_preview.mjs`
 * @returns {M}
 */
export function stubRenders(original) {
  return {
    ...original,
    /** @param {any} ctx @param {string} slug @param {any} data */
    async renderPreview(ctx, slug, data) {
      if (state().real) return original.renderPreview(ctx, slug, data);
      const cwd = ctx.project.cwd;
      const out = path.join(cwd, 'themes', slug, 'preview.html');
      fs.writeFileSync(
        out,
        `<!doctype html><title>${slug}: sample page</title><!-- test stand-in ${standInKey(data)} -->\n${STAND_IN_STAMP}\n`,
      );
      return shown(cwd, out);
    },
    /** @param {any} ctx @param {string} slug @param {any} data */
    previewIsCurrent(ctx, slug, data) {
      if (state().real) return original.previewIsCurrent(ctx, slug, data);
      try {
        return fs
          .readFileSync(
            path.join(ctx.project.cwd, 'themes', slug, 'preview.html'),
            'utf8',
          )
          .includes(`<!-- test stand-in ${standInKey(data)} -->`);
      } catch {
        return false;
      }
    },
    /** @param {any} ctx @param {string} slug @param {any} data @param {any} [options] */
    async renderSheet(ctx, slug, data, options = {}) {
      if (state().real) return original.renderSheet(ctx, slug, data, options);
      const cwd = ctx.project.cwd;
      // One section goes to its own file, as the real render writes it.
      const out =
        options.out ??
        path.join(
          cwd,
          'themes',
          slug,
          options.group ? `sheet-${options.group}.html` : 'sheet.html',
        );
      fs.mkdirSync(path.dirname(out), {recursive: true});
      fs.writeFileSync(
        out,
        `<!doctype html><title>${slug}: every component${options.group ? ` (${options.group})` : ''}</title><!-- test stand-in -->\n${STAND_IN_STAMP}\n`,
      );
      return {file: shown(cwd, out), components: 1, skipped: [], notes: []};
    },
  };
}

/**
 * The page-drawing module with its drawing stood in for while real renders
 * are off: `renderGenerated` writes nothing and returns a small page with
 * the generated source's stamp, so what reads the page (the media sides,
 * its key) runs on it. A project with no React draws for real, so the
 * error a missing React gives is the real one.
 * @template {Record<string, any>} M
 * @param {M} original the real `_parts.mjs`
 * @returns {M}
 */
export function stubDrawing(original) {
  return {
    ...original,
    /**
     * @param {any} project @param {string} file @param {string} source
     * @param {any[]} [extra] @param {any} [opts]
     */
    async renderGenerated(project, file, source, extra, opts) {
      if (
        state().real ||
        state().drawing ||
        original.reactMissing(project.cwd).length
      )
        return original.renderGenerated(project, file, source, extra, opts);
      const markup = `<main data-test-stand-in="${file.replace(/[^\w.-]/g, '')}"></main>`;
      return {
        html: `<!doctype html><html><head><meta charset="utf-8"><title>${file}</title></head><body>${markup}</body></html>\n`,
        markup,
      };
    },
  };
}
