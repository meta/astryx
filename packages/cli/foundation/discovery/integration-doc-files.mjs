// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The doc files an integration package ships, by root: every doc its
 * roots hold, so the doc type check covers each one an agent can open.
 *
 * Each root's reader names the docs it serves, with the kind it reads each
 * as:
 * - components: the doc each component discovery records;
 * - templates: the doc of each template template discovery serves;
 * - docs: the file of each topic, namespace and placed guide docs discovery
 *   serves, and each topic's and guide's `zh` and `dense` overlay that a docs
 *   read applies;
 * - themes: each theme's descriptor, as theme discovery resolves it. A themes
 *   root that discovery cannot read serves no theme, and is listed with the
 *   reason;
 * - iconSets: each icon set's descriptor that icon-set discovery reads. A
 *   set whose descriptor or data file does not parse still ships its
 *   descriptor, which is checked as a doc no reader serves.
 * A doc no reader serves still ships: a `hidden` one, a second doc for one
 * name, an overlay without its topic. It goes to its root's kind. A test
 * fixture does not ship as a doc, and is only counted: a doc under
 * `__tests__` in the components or docs root, which those readers skip.
 * A file two roots hold goes to the deepest.
 *
 * @input A loaded integration and its resolved roots.
 * @output DocFile entries for checkDocTypes, each with the root it belongs to,
 *   the roots a reader could not read, and how many test fixtures it left
 *   out.
 * @position Read by `astryx doctor integration validate` before it checks
 *   each doc against its authoring type.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {OVERLAY_LANGUAGES, overlayPath} from '../doc-compiler/read.mjs';
import {discoverIntegrationComponents} from './component-discovery.mjs';
import {discoverIntegrationDocs} from './docs-discovery.mjs';
import {discoverIntegrationTemplatesForOne} from './template-adapter.mjs';
import {discoverThemeDirectory} from './theme-discovery.mjs';
import {discoverIconSetDirectory} from './icon-set-discovery.mjs';
import {rootProblem} from '../integrations/validate-contributions.mjs';

/** @typedef {import('./doc-types.mjs').DocFile} DocFile */
/** @typedef {import('./doc-types.mjs').DocRoot} DocRoot */

/**
 * Every doc file an integration's roots hold, each assigned to the deepest
 * root that holds it, each root a reader could not read, and how many test
 * fixtures no reader serves.
 * @param {any} integration a loaded integration
 * @returns {Promise<{files: DocFile[], unread: Array<{path: string, reason: string}>, fixtures: number}>}
 */
export async function integrationDocFiles(integration) {
  const {components, templates, docs, themes, iconSets} = integration ?? {};
  /** @type {Array<[DocRoot, string, string[]]>} */
  const read = [];
  /** @type {Array<{path: string, reason: string}>} */
  const unread = [];
  // A root `validate` already reports (missing, a file, unreadable) is left
  // to that issue. A reader that fails inside a root, such as on a folder it
  // cannot read, leaves the root listed with the reason.
  /** @type {(root: string | undefined, label: string, files: () => Promise<Array<[DocRoot, string[]]>>) => Promise<void>} */
  const take = async (root, label, files) => {
    if (!root || rootProblem(root)) return;
    try {
      for (const [kind, list] of await files()) read.push([kind, root, list]);
    } catch (err) {
      unread.push({
        path: root,
        reason: `the ${label} root does not load, so no doc in it was checked: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  };
  await take(components, 'components', async () => [
    [
      'components',
      discoverIntegrationComponents(integration).map(c => c.docPath),
    ],
  ]);
  await take(templates, 'templates', async () => [
    [
      'templates',
      (await discoverIntegrationTemplatesForOne(integration)).templates.map(
        t => t.docPath,
      ),
    ],
  ]);
  await take(docs, 'docs', async () => {
    const found = await discoverIntegrationDocs(integration);
    // Topics and placed guides are read with their overlays; a namespace
    // names its file `<package name>/<path in the root>`.
    const withOverlays = [
      ...found.records.map(record => record.path),
      ...found.guides.map(guide => guide.ref.topicFile),
    ];
    const prefix = `${integration.name}/`;
    const namespaces = found.namespaces.map(entry =>
      path.join(
        /** @type {string} */ (docs),
        ...(entry.source.startsWith(prefix)
          ? entry.source.slice(prefix.length)
          : entry.source
        ).split('/'),
      ),
    );
    return [
      ['docs', [...withOverlays, ...namespaces]],
      [
        'docs-overlay',
        withOverlays.flatMap(file =>
          OVERLAY_LANGUAGES.map(lang => overlayPath(file, lang)).filter(
            overlay => fs.existsSync(overlay),
          ),
        ),
      ],
    ];
  });
  await take(themes, 'themes', async () => [
    [
      'themes',
      discoverThemeDirectory(
        /** @type {string} */ (themes),
        integration?.name ?? 'the package',
      ).map(theme => theme.docPath),
    ],
  ]);
  await take(iconSets, 'iconSets', async () => [
    [
      'icon-sets',
      discoverIconSetDirectory(
        /** @type {string} */ (iconSets),
        integration?.name ?? 'the package',
      ).sets.map(set => set.docPath),
    ],
  ]);
  /** @type {Map<string, {root: DocRoot, dir: string}>} */
  const owners = new Map();
  /** @type {(table: Map<string, {root: DocRoot, dir: string}>, root: DocRoot, dir: string, file: string) => void} */
  const own = (table, root, dir, file) => {
    const owner = table.get(file);
    if (!owner || dir.length > owner.dir.length) table.set(file, {root, dir});
  };
  for (const [root, dir, files] of read) {
    for (const file of files) own(owners, root, dir, file);
  }
  // The docs no reader serves, in each root a reader could read.
  /** @type {Map<string, {root: DocRoot, dir: string}>} */
  const shipped = new Map();
  const readable = new Set(read.map(([, dir]) => dir));
  for (const [
    kind,
    dir,
  ] of /** @type {Array<[DocRoot, string | undefined]>} */ ([
    ['components', components],
    ['templates', templates],
    ['docs', docs],
    ['themes', themes],
    ['icon-sets', iconSets],
  ])) {
    if (!dir || !readable.has(dir)) continue;
    for (const file of docFilesUnder(dir)) {
      const overlay = OVERLAY_LANGUAGES.some(lang =>
        file.endsWith(`.doc.${lang}.mjs`),
      );
      if (overlay && kind !== 'docs') continue;
      own(shipped, overlay ? 'docs-overlay' : kind, dir, file);
    }
  }
  let fixtures = 0;
  for (const [file, owner] of shipped) {
    if (owners.has(file)) continue;
    if (isFixture(path.relative(owner.dir, file), owner.root)) fixtures++;
    else owners.set(file, owner);
  }
  return {
    files: [...owners]
      .map(([file, {root}]) => ({path: file, root}))
      .sort((a, b) => a.path.localeCompare(b.path)),
    unread,
    fixtures,
  };
}

/**
 * Whether a doc file is a test fixture: under `__tests__` in a root whose
 * reader skips that folder (components and docs). The template reader reads
 * it, so a template doc there is the package's like any other.
 * @param {string} file its path relative to its root
 * @param {DocRoot} root
 */
function isFixture(file, root) {
  return (
    root !== 'templates' &&
    root !== 'themes' &&
    root !== 'icon-sets' &&
    file.split(path.sep).includes('__tests__')
  );
}

/**
 * Every doc file under a folder: a `.doc.ts`, `.doc.mjs` or `.doc.js` file,
 * or a `zh` or `dense` overlay, through its folders and linked files, but not
 * `node_modules`, `.git` or a linked folder.
 * @param {string} dir
 * @returns {string[]}
 */
function docFilesUnder(dir) {
  /** @type {string[]} */
  const found = [];
  /** @type {(folder: string) => void} */
  const walk = folder => {
    /** @type {fs.Dirent[]} */
    let entries;
    try {
      entries = fs.readdirSync(folder, {withFileTypes: true});
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (entry.isSymbolicLink()) {
        try {
          if (!fs.statSync(full).isFile()) continue;
        } catch {
          continue;
        }
      } else if (!entry.isFile()) {
        continue;
      }
      if (
        /\.doc\.(ts|mjs|js)$/.test(entry.name) ||
        OVERLAY_LANGUAGES.some(lang => entry.name.endsWith(`.doc.${lang}.mjs`))
      ) {
        found.push(full);
      }
    }
  };
  walk(dir);
  return found;
}
