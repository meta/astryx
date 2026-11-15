// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Whether a component or hook can carry a name, read without loading
 * any doc: from Core's file and folder names, and from integrations' doc file
 * names and the words in those docs' text. Each is a summary kept between
 * runs while those folders and docs are unchanged (../fs/kept-tree.mjs).
 *
 * @input  Core's folder or integrations' components folders, and a name
 *   folded as a reader may type it ({@link foldEntryName})
 * @output false only when discovery lists no component or hook there whose
 *   folded name is that name; for Core, the top folders that can hold one
 * @position foundation/discovery: lets the docs not-found error skip
 *   component and hook discovery for a name no Core file or folder name, and
 *   no integration doc's file name or text, carries
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {hasNameLine, keptTreeSummary, nameLines} from '../fs/kept-tree.mjs';

/** A component doc's suffix, as integration discovery reads it. */
const INTEGRATION_DOC_RE = /\.doc\.(ts|mjs|js)$/;

/**
 * A name as a reader may type it: case, spaces and hyphens do not count.
 * @param {string} name
 * @returns {string}
 */
export function foldEntryName(name) {
  return name.toLowerCase().replace(/[\s-]+/g, '');
}

/**
 * Visit each file and folder under `dir`, outside `node_modules`, until
 * `visit` returns true.
 * @param {string} dir
 * @param {(name: string, dir: string, isDir: boolean) => boolean} visit
 * @returns {boolean} whether a visit returned true
 */
function walkUntil(dir, visit) {
  let entries;
  try {
    entries = fs.readdirSync(dir, {withFileTypes: true});
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules') continue;
    const isDir = entry.isDirectory();
    if (visit(entry.name, dir, isDir)) return true;
    if (isDir && walkUntil(path.join(dir, entry.name), visit)) return true;
  }
  return false;
}

/** This module's own file: its code decides the kept summaries' shape. */
const OWN_FILE = fileURLToPath(import.meta.url);

/**
 * The folded names Core's files and folders give, each with a top folder of
 * `src` that holds one, as lines ({@link nameLines}) of `<kind><name>\t<top>`:
 * kind `t` for a `.tsx` stem (a component), `o` for a `.doc.mjs` stem (a
 * hook), `d` for a folder name (a component). A file directly in `src` is
 * under the top folder `''`, and a top folder under its own name. A folded
 * name holds no white space, so a tab ends it.
 * @param {string} coreDir
 * @returns {string | string[]}
 */
function coreNameIndex(coreDir) {
  return keptTreeSummary(
    {
      kind: 'core-entry-names',
      roots: [path.join(coreDir, 'src')],
      code: [OWN_FILE],
      skip: name => name === 'node_modules',
    },
    ([{folders}]) => {
      /** @type {string[]} */
      const lines = [];
      for (const {rel, entries} of folders) {
        const top = rel === '' ? '' : rel.split(path.sep)[0];
        for (const {name, isDir} of entries) {
          if (isDir) {
            if (name !== 'node_modules') {
              lines.push(`d${foldEntryName(name)}\t${rel === '' ? name : top}`);
            }
          } else if (name.endsWith('.doc.mjs')) {
            const stem = name.slice(0, -'.doc.mjs'.length);
            lines.push(`o${foldEntryName(stem)}\t${top}`);
          } else if (name.endsWith('.tsx')) {
            lines.push(
              `t${foldEntryName(name.slice(0, -'.tsx'.length))}\t${top}`,
            );
          }
        }
      }
      return nameLines(lines);
    },
  );
}

/**
 * The tops the index lines that start with `prefix` name.
 * @param {string | string[]} lines
 * @param {string} prefix
 * @returns {string[]}
 */
function topsAfter(lines, prefix) {
  if (typeof lines !== 'string') {
    return lines
      .filter(line => line.startsWith(prefix))
      .map(line => line.slice(prefix.length));
  }
  const needle = `\n${prefix}`;
  const tops = [];
  for (
    let at = lines.indexOf(needle);
    at >= 0;
    at = lines.indexOf(needle, at + 1)
  ) {
    const start = at + needle.length;
    tops.push(lines.slice(start, lines.indexOf('\n', start)));
  }
  return tops;
}

/**
 * Which Core entries can fold to `wanted`. Every Core component takes its
 * name from a `.tsx` file (without an `XDS` prefix) or a folder, and every
 * hook from its doc's file name, so a name no such file carries is neither.
 * @param {string} coreDir
 * @param {string} wanted a folded name
 * @returns {{component: boolean, hook: boolean, componentTops: Set<string>, hookTops: Set<string>}}
 *   `hook` also counts a hook named `use` + `wanted`; the tops are the top
 *   folders of `src` that hold such a file or folder
 */
export function coreFilesNaming(coreDir, wanted) {
  const index = coreNameIndex(coreDir);
  const componentTops = new Set([
    ...topsAfter(index, `t${wanted}\t`),
    ...topsAfter(index, `txds${wanted}\t`),
    ...topsAfter(index, `d${wanted}\t`),
  ]);
  const hookTops = new Set([
    ...topsAfter(index, `o${wanted}\t`),
    ...topsAfter(index, `ouse${wanted}\t`),
  ]);
  return {
    component: componentTops.size > 0,
    hook: hookTops.size > 0,
    componentTops,
    hookTops,
  };
}

/** A name a doc's text can spell: a run of word characters. */
const WORD_RE = /[A-Za-z0-9_$]+/g;

/**
 * What each integration's component docs can name: each doc's folded file
 * stem, and each word in its text, in lower case. `unreadable` when a doc
 * could not be read.
 * @param {string[]} componentsDirs
 * @returns {Array<{stems: string | string[], words: string | string[], unreadable: boolean}>}
 */
function integrationNameIndexes(componentsDirs) {
  return keptTreeSummary(
    {
      kind: 'integration-component-names',
      roots: componentsDirs,
      code: [OWN_FILE],
      // Integration discovery reads no doc in these folders.
      skip: name => name === 'node_modules' || name === '__tests__',
    },
    trees =>
      trees.map(({folders, readText}) => {
        const stems = new Set();
        const words = new Set();
        let unreadable = false;
        for (const {rel, entries} of folders) {
          for (const {name, isDir} of entries) {
            if (isDir || !INTEGRATION_DOC_RE.test(name)) continue;
            stems.add(foldEntryName(name.replace(INTEGRATION_DOC_RE, '')));
            let text;
            try {
              text = readText(rel === '' ? name : path.join(rel, name));
            } catch {
              unreadable = true;
              continue;
            }
            for (const word of text.match(WORD_RE) ?? []) {
              words.add(word.toLowerCase());
            }
          }
        }
        return {stems: nameLines(stems), words: nameLines(words), unreadable};
      }),
  );
}

/**
 * Whether an integration component can fold to `wanted`, for each
 * components folder in order. Integration discovery names a component after
 * its doc's file, or after a name the doc spells out (its export, or a family
 * member), so a doc whose file name and text both lack the name lists no
 * such component.
 * @param {Array<string | undefined>} componentsDirs
 * @param {string} wanted a folded name
 * @returns {boolean[]}
 */
export function integrationsFilesNaming(componentsDirs, wanted) {
  // A name of word characters alone is a whole word of the text exactly when
  // it is one of the text's words: the kept index answers it.
  if (!/^[a-z0-9_$]+$/.test(wanted)) {
    return componentsDirs.map(dir => !!dir && docsSpell(dir, wanted));
  }
  const dirs = componentsDirs.flatMap(dir => (dir ? [dir] : []));
  const indexes = dirs.length > 0 ? integrationNameIndexes(dirs) : [];
  let at = 0;
  return componentsDirs.map(dir => {
    if (!dir) return false;
    const {stems, words, unreadable} = indexes[at++];
    return (
      unreadable || hasNameLine(stems, wanted) || hasNameLine(words, wanted)
    );
  });
}

/**
 * {@link integrationsFilesNaming} for one components folder.
 * @param {string | undefined} componentsDir
 * @param {string} wanted a folded name
 * @returns {boolean}
 */
export function integrationFilesNaming(componentsDir, wanted) {
  return integrationsFilesNaming([componentsDir], wanted)[0];
}

/**
 * Whether a component doc under `componentsDir` has a file stem that folds to
 * `wanted`, or text that holds it as a whole word, read from the disk.
 * @param {string} componentsDir
 * @param {string} wanted a folded name
 * @returns {boolean}
 */
function docsSpell(componentsDir, wanted) {
  const token = new RegExp(
    `(?<![\\w$])${wanted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w$])`,
    'i',
  );
  return walkUntil(componentsDir, (name, dir, isDir) => {
    if (isDir || !INTEGRATION_DOC_RE.test(name)) return false;
    if (foldEntryName(name.replace(INTEGRATION_DOC_RE, '')) === wanted) {
      return true;
    }
    try {
      return token.test(fs.readFileSync(path.join(dir, name), 'utf8'));
    } catch {
      return true;
    }
  });
}
