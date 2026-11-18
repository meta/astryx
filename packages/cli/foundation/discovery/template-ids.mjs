// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Template ids read from file names alone: the template-spec suffixes,
 * Core's page and block folders, Core's template ids, an integration's
 * template ids, and which of them can fold to a name.
 *
 * @input Core's template folders, integrations' templates folders, and a
 *   name folded as a reader may type it
 * @output ids, suffixes and folders; whether a template id folds to the name
 * @position foundation/discovery: read by template discovery
 *   (./template-adapter.mjs), which re-exports the ids, and by the lookup
 *   commands' not-found hint (../suggest/name-index.mjs keeps the ids'
 *   lines; ../suggest/other-command.mjs reads an integration's template doc
 *   only when its file names can match)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {nameLines} from '../fs/kept-tree.mjs';
import {listDirEntries} from '../fs/listing-cache.mjs';
import {BLOCKS_DIR, PAGES_DIR} from './name-roots.mjs';
import {foldEntryName} from './entry-name-files.mjs';

/**
 * Released compatibility suffixes, in precedence order. Stable 0.6.0
 * documented `.template.*`, so discovery keeps reading those files while all
 * new authoring uses `.doc.mjs`.
 */
const TEMPLATE_SUFFIXES = ['.template.ts', '.template.mjs', '.template.js'];

/**
 * Descriptor suffixes for templates, in precedence order. New authoring always
 * emits `.doc.mjs`; the TypeScript and JavaScript variants remain readable.
 */
const DOC_SUFFIXES = ['.doc.ts', '.doc.mjs', '.doc.js'];

/**
 * Every template-spec suffix, in the released precedence a core page directory
 * uses to pick one file. Integration discovery never picks: every match is a
 * template, so two specs for one stem list twice and read as ambiguous.
 */
export const ALL_TEMPLATE_SUFFIXES = [...TEMPLATE_SUFFIXES, ...DOC_SUFFIXES];

/**
 * The template-spec suffix present on `file`, or null if none matches.
 * Recognizes both the canonical `.doc.*` and released `.template.*` families.
 * @param {string} file
 * @returns {string | null}
 */
export function matchedTemplateSuffix(file) {
  return ALL_TEMPLATE_SUFFIXES.find(suffix => file.endsWith(suffix)) ?? null;
}

/**
 * RegExp matching either template-spec suffix family at end of a basename.
 * Used where a per-file regex is convenient (e.g. block discovery walks).
 */
export const TEMPLATE_SUFFIX_RE = /\.(template|doc)\.(ts|mjs|js)$/;

export {BLOCKS_DIR, PAGES_DIR};

/**
 * List the core page-template directory names (sorted). The `template --list`
 * view discovers far more; this is the minimal core-page set `init` scaffolds
 * from.
 * @returns {string[]}
 */
export function listTemplates() {
  /** @type {string[]} */
  const all = [];
  if (fs.existsSync(PAGES_DIR)) {
    all.push(
      ...listDirEntries(PAGES_DIR)
        .filter(e => e.isDirectory())
        .map(e => e.name),
    );
  }
  return all.sort();
}

/**
 * The ids of Core's templates that `keep` accepts, read from file names: each
 * page folder, and each block doc that has its same-stem source. Discovery
 * gives Core's templates exactly these ids. Only a kept block's source is
 * looked for.
 * @param {(id: string) => boolean} [keep]
 * @returns {string[]}
 */
export function coreTemplateIds(keep = () => true) {
  const ids = listTemplates().filter(keep);
  /** @param {string} dir */
  const walk = dir => {
    let entries;
    try {
      entries = fs.readdirSync(dir, {withFileTypes: true});
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!TEMPLATE_SUFFIX_RE.test(entry.name)) continue;
      const suffix = matchedTemplateSuffix(entry.name);
      if (!suffix) continue;
      const basename = entry.name.slice(0, -suffix.length);
      if (keep(basename) && fs.existsSync(path.join(dir, basename + '.tsx'))) {
        ids.push(basename);
      }
    }
  };
  walk(BLOCKS_DIR);
  return ids;
}

/**
 * The folded ids the template docs under one templates folder give, as lines
 * ({@link nameLines}): Core's block ids are stems; an integration's are paths,
 * folded whole and by their last segment, as a reader types one. Discovery
 * lists a template only when its doc has its same-stem `.tsx` source beside
 * it, so a doc without one gives no id.
 * @param {import('../fs/kept-tree.mjs').TreeFolder[]} folders the folder's tree
 * @param {boolean} isCore whether it is Core's {@link BLOCKS_DIR}
 * @returns {string | string[]}
 */
export function templateIdLines(folders, isCore) {
  const folded = new Set();
  for (const {rel, entries} of folders) {
    const files = new Set(
      entries.flatMap(({name, isDir}) => (isDir ? [] : [name])),
    );
    for (const name of files) {
      const suffix = matchedTemplateSuffix(name);
      if (!suffix || !files.has(`${name.slice(0, -suffix.length)}.tsx`))
        continue;
      const id = isCore
        ? name.slice(0, -suffix.length)
        : path.join(rel, name).slice(0, -suffix.length);
      const parts = id.split(path.sep);
      folded.add(foldEntryName(parts.join('/')));
      folded.add(foldEntryName(parts[parts.length - 1]));
    }
  }
  return nameLines(folded);
}

/**
 * Recursively collect integration template-spec files under `root`.
 * Returns absolute paths to files ending in one of ALL_TEMPLATE_SUFFIXES
 * (canonical `.doc.*` or released `.template.*` compatibility files).
 *
 * @param {string} root
 * @returns {string[]}
 */
export function findIntegrationDocFiles(root) {
  /** @type {string[]} */
  const results = [];
  if (!fs.existsSync(root)) return results;
  /** @param {string} dir */
  const walk = dir => {
    for (const entry of listDirEntries(dir)) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (
        ALL_TEMPLATE_SUFFIXES.some(suffix => entry.name.endsWith(suffix))
      ) {
        results.push(full);
      }
    }
  };
  walk(root);
  return results;
}

/**
 * The id of each template doc an integration ships, valid or not, read from
 * file names alone.
 * @param {{templates?: string}} integration
 * @returns {string[]}
 */
export function integrationTemplateIds(integration) {
  const root = integration?.templates;
  if (!root) return [];
  return findIntegrationDocFiles(root).flatMap(docPath => {
    const suffix = matchedTemplateSuffix(docPath);
    if (!suffix) return [];
    return [
      path
        .relative(root, docPath)
        .slice(0, -suffix.length)
        .split(path.sep)
        .join('/'),
    ];
  });
}
