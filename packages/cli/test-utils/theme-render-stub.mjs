// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A stand-in for the two page renders of `experimental theme editor`
 * (the sample page every change renders, and the sheet of every component
 * `show` renders), for test files whose assertions are about settings,
 * builds, files and messages, not the rendered pages. A render costs
 * seconds; the stand-in writes a small page in the same place and returns
 * what the render returns. A test turns real renders on with
 * {@link realRenders}; `THEME_EDIT_SLOW=1` renders for real everywhere.
 *
 * Use, at the top of a test file:
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

/** @returns {{real: boolean}} */
function state() {
  const g = /** @type {any} */ (globalThis);
  return (g[STATE] ??= {real: process.env.THEME_EDIT_SLOW === '1'});
}

/** Whether the long sweeps run: `THEME_EDIT_SLOW=1`. */
export const SLOW = process.env.THEME_EDIT_SLOW === '1';

/**
 * Render for real (true) or with the stand-in (false) from now on, until
 * the next call. With `THEME_EDIT_SLOW=1`, renders stay real.
 * @param {boolean} on
 */
export function realRenders(on) {
  state().real = on || SLOW;
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
        `<!doctype html><title>${slug}: sample page</title><!-- test stand-in -->\n`,
      );
      return shown(cwd, out);
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
        `<!doctype html><title>${slug}: every component${options.group ? ` (${options.group})` : ''}</title><!-- test stand-in -->\n`,
      );
      return {file: shown(cwd, out), components: 1, skipped: []};
    },
  };
}
