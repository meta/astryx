// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A stand-in for the costly drawing of `experimental theme editor`'s
 * pages, for tests whose assertions are about settings, builds, files,
 * checks and messages, not the drawn components. Drawing a page (rendering
 * every component on the server) costs seconds.
 *
 * {@link stubDrawing} is every file of the node project's default
 * (vitest.setup.node.mjs): only the drawing is stood in for. Everything the
 * editor does around it (the build, the page's source and its key, the
 * notes and warnings, the media sides, the written file) runs as it does
 * for real, and the stand-in page has the sections a real drawing of the
 * same page has, so what is cut from it (a family's own sheet, its
 * picture) is the same set of pages in both.
 *
 * A file whose assertions read drawn components or pictures calls
 * `realRenders(true)` at its top (the setup file sets every file back to
 * the default before it starts). `THEME_EDIT_REAL_RENDERS=1` (or
 * `THEME_EDIT_SLOW=1`) draws for real everywhere.
 *
 * @position test-utils — used by vitest.setup.node.mjs and the theme-edit
 *   test files
 */

import {
  openGroupOf,
  sheetGroups,
  sheetSectionClass,
} from '../api/theme-edit/_catalog.mjs';

const STATE = Symbol.for('astryx.test-utils.theme-render-stub');

/** Whether the long sweeps run: `THEME_EDIT_SLOW=1`. */
export const SLOW = process.env.THEME_EDIT_SLOW === '1';

/**
 * Whether every page is drawn for real: `THEME_EDIT_REAL_RENDERS=1` (the
 * mode a gate runs the editor suite in before a push), or the long sweeps.
 */
export const REAL_EVERYWHERE =
  SLOW || process.env.THEME_EDIT_REAL_RENDERS === '1';

/** @returns {{real: boolean}} */
function state() {
  const g = /** @type {any} */ (globalThis);
  return (g[STATE] ??= {real: REAL_EVERYWHERE});
}

/**
 * Back to the default, as every test file starts (the node project's setup
 * file calls it): the stand-in, or real drawing with
 * `THEME_EDIT_REAL_RENDERS=1`.
 */
export function resetRenders() {
  state().real = REAL_EVERYWHERE;
}

/**
 * Draw for real (true) or with the stand-in (false) from now on, until the
 * next call. With `THEME_EDIT_REAL_RENDERS=1` or `THEME_EDIT_SLOW=1`,
 * drawing stays real.
 * @param {boolean} on
 */
export function realRenders(on) {
  state().real = on || REAL_EVERYWHERE;
}

/**
 * Run `fn` with real drawing, then go back to the stand-in.
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

/**
 * The preview module as it is: its renders go through the drawing, which
 * the node project's setup file stands in for. Kept for the files that set
 * it up in their own mock of `./_preview.mjs`.
 * @template {Record<string, any>} M
 * @param {M} original the real `_preview.mjs`
 * @returns {M}
 */
export function stubRenders(original) {
  return original;
}

/** @param {string} s */
const escape = s =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * A constant the generated page's source declares (`const NAME = <JSON>;`,
 * one line each), or undefined.
 * @param {string} source
 * @param {string} name
 * @returns {any}
 */
function declared(source, name) {
  const line = source.split('\n').find(l => l.startsWith(`const ${name} = `));
  if (!line) return undefined;
  try {
    return JSON.parse(line.slice(`const ${name} = `.length).replace(/;$/, ''));
  } catch {
    return undefined;
  }
}

/**
 * The stand-in drawing of a sheet: its bar and its sections, each with its
 * cells, as the sheet's own page groups them (_catalog.mjs sheetGroups),
 * with no component drawn in them.
 * @param {string} source
 */
function sheetStandIn(source) {
  const items = /** @type {any[]} */ (declared(source, 'ITEMS') ?? []);
  const section = String(declared(source, 'SECTION') ?? '');
  const title = String(declared(source, 'TITLE') ?? '');
  const openGroup = openGroupOf(section);
  const sections = sheetGroups(
    items.filter(it => !it.onlyOpen),
    openGroup,
  )
    .map(
      g =>
        `<section class="${sheetSectionClass(g.name, openGroup)}">${g.name ? `<h2 class="cs-group-name">${escape(g.name)}</h2>` : ''}<div class="${g.name === 'pages' ? 'cs-pages' : 'cs-sheet'}">${g.cells.map(c => `<div class="cs-cell"><div class="cs-name">${escape(c.name)}</div></div>`).join('')}</div></section>`,
    )
    .join('');
  return `<main><div class="${section ? `cs-page cs-section-${escape(section)}` : 'cs-page'}"><div class="cs-bar"><strong>${escape(title)}</strong></div>${sections}</div></main>`;
}

/**
 * The page-drawing module with its drawing stood in for while real drawing
 * is off: `renderGenerated` returns the page's structure (a sheet's
 * sections, as the page groups them) with no component drawn, so what
 * reads the page (the media sides, its key, the family pages cut from it)
 * runs on it. Drawn for real: the part data's catalog (what parts read is
 * read from real drawings), and a project with no React (so the error a
 * missing React gives is the real one).
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
      const layout = declared(source, 'LAYOUT');
      if (
        state().real ||
        (layout !== 'sheet' && layout !== 'page') ||
        original.reactMissing(project.cwd).length
      )
        return original.renderGenerated(project, file, source, extra, opts);
      const markup =
        layout === 'sheet'
          ? sheetStandIn(source)
          : `<main data-test-stand-in="${escape(file)}"></main>`;
      return {
        html: `<!doctype html><html><head><meta charset="utf-8"><title>${escape(file)}</title></head><body>${markup}</body></html>\n`,
        markup,
      };
    },
  };
}
