// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Core's components, each with the parts of its doc the component
 * matcher scores, kept between runs.
 *
 * @input A Core folder and the component names discovery lists for it.
 * @output {@link coreComponentViews}: each name's {@link ComponentMatchView},
 *   read from the doc the matcher finds for it under `<core>/src`.
 * @position Read by the component matcher's keyword and description pass
 *   (foundation/text/string-utils.mjs searchComponents), which the
 *   `component` lookup's not-found path runs. The summary is kept while every
 *   folder the matcher's doc lookup lists, every doc it read and every path it
 *   probed keep their stamps, so a warm miss loads no Core doc.
 */

import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {keptTreeSummaryAsync} from '../fs/kept-tree.mjs';
import {oncePerListing} from '../fs/listing-cache.mjs';

/**
 * @typedef {import('../text/string-utils.mjs').ComponentMatchView} ComponentMatchView
 */

/** The code that makes the kept views. */
const VIEWS_CODE = [
  fileURLToPath(import.meta.url),
  ...[
    '../doc-compiler/read.mjs',
    '../fs/listing-cache.mjs',
    '../text/string-utils.mjs',
  ].map(rel => fileURLToPath(new URL(rel, import.meta.url))),
];

/**
 * The folders the doc lookup lists: `src`, its folders, and theirs. A doc
 * sits at `src/<Name>/` or `src/<group>/<Name>/`.
 * @param {string} _name
 * @param {string} rel the holding folder's path from `src`
 * @returns {boolean}
 */
const deeperThanDocs = (_name, rel) => rel.includes(path.sep);

/**
 * Whether a stored summary is a list of views: each a name with an object or
 * null. Any other value is read again.
 * @param {unknown} value
 * @returns {boolean}
 */
const isViewList = value =>
  Array.isArray(value) &&
  value.every(
    entry =>
      Array.isArray(entry) &&
      entry.length === 2 &&
      typeof entry[0] === 'string' &&
      (entry[1] === null ||
        (typeof entry[1] === 'object' && !Array.isArray(entry[1]))),
  );

/**
 * Each of `names` with the {@link ComponentMatchView} of the doc the matcher
 * reads for it under `<coreDir>/src`: `src/<Name>/<Name>.doc.mjs`, then
 * `src/<Name>/XDS<Name>.doc.mjs`, then `src/<group>/<Name>/<Name>.doc.mjs`.
 * The view is null for a name with no such doc, or one whose doc does not
 * load.
 * @param {string | null} coreDir
 * @param {string[]} names
 * @returns {Promise<Map<string, ComponentMatchView | null>>}
 */
export function coreComponentViews(coreDir, names) {
  if (coreDir == null || names.length === 0) return Promise.resolve(new Map());
  // Each search in one operation reads the same docs, so one operation
  // reads them once.
  return oncePerListing(
    `core-component-views\0${coreDir}\0${names.join('\n')}`,
    () => readViews(coreDir, names),
  );
}

/**
 * {@link coreComponentViews}, kept between runs.
 * @param {string} coreDir
 * @param {string[]} names
 * @returns {Promise<Map<string, ComponentMatchView | null>>}
 */
async function readViews(coreDir, names) {
  const srcDir = path.join(coreDir, 'src');
  const views = await keptTreeSummaryAsync(
    {
      kind: 'core-component-views',
      roots: [{root: srcDir, skip: deeperThanDocs}],
      code: VIEWS_CODE,
      key: [names.join('\n')],
      recorded: true,
      accept: isViewList,
    },
    async ([tree]) => {
      const [{readDocView}, {pathExists}, {componentMatchView}] =
        await Promise.all([
          import('../doc-compiler/read.mjs'),
          import('../fs/listing-cache.mjs'),
          import('../text/string-utils.mjs'),
        ]);
      /** @type {Map<string, Map<string, {isDir: boolean, isLink: boolean}>>} */
      const listed = new Map(
        tree.folders.map(({rel, entries}) => [
          rel,
          new Map(entries.map(entry => [entry.name, entry])),
        ]),
      );
      /**
       * Whether `src/<parts>` exists, from the listings the walk took. A
       * link, or a path the walk did not list, is probed.
       * @param {string[]} parts
       */
      const exists = (...parts) => {
        let rel = '';
        for (const [at, part] of parts.entries()) {
          const entry = listed.get(rel)?.get(part);
          const here = rel === '' ? part : rel + path.sep + part;
          if (!listed.has(rel) || entry?.isLink) {
            return pathExists(path.join(srcDir, ...parts));
          }
          if (!entry) return false;
          if (at < parts.length - 1 && !entry.isDir) return false;
          rel = here;
        }
        return true;
      };
      /**
       * The doc the matcher reads for `comp`, or null.
       * @param {string} comp
       */
      const docPathOf = comp => {
        if (exists(comp, comp + '.doc.mjs')) {
          return path.join(srcDir, comp, comp + '.doc.mjs');
        }
        if (exists(comp, 'XDS' + comp + '.doc.mjs')) {
          return path.join(srcDir, comp, 'XDS' + comp + '.doc.mjs');
        }
        for (const [name, entry] of listed.get('') ?? []) {
          if (!entry.isDir) continue;
          if (exists(name, comp, comp + '.doc.mjs')) {
            return path.join(srcDir, name, comp, comp + '.doc.mjs');
          }
        }
        return null;
      };
      /** @type {Array<[string, ComponentMatchView | null]>} */
      const entries = [];
      for (const name of new Set(names)) {
        let view = null;
        try {
          const docPath = docPathOf(name);
          // Only the legacy `docs` export has ever been indexed here.
          if (docPath) {
            view = componentMatchView(
              await readDocView(docPath, {
                root: 'components',
                loader: 'native',
                exports: ['docs'],
              }),
            );
          }
        } catch {
          // A doc that does not load is not matched.
        }
        entries.push([name, view]);
      }
      return entries;
    },
  );
  return new Map(views);
}
