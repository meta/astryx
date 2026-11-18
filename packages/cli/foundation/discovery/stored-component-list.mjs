// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Core's component list and each listed component's import, as worked
 * out at publish for the Core the CLI was published with
 * (scripts/generate-component-list.mjs), with the state of every file and
 * folder that work read.
 *
 * @input `storedComponentList(coreDir)`.
 * @output The stored groups and imports while every recorded file and folder
 *   under `coreDir` is in its recorded state, else null: any edit, addition or
 *   removal, a patched install or another Core version reads Core live.
 * @position Read by component discovery (component-discovery.mjs): the list
 *   checks the store, and an import lookup in the same operation reuses that
 *   check.
 */

import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {keptTreeSummary} from '../fs/kept-tree.mjs';
import {CLI_ROOT} from '../fs/paths.mjs';
import {onceComputed, oncePerListing} from '../fs/listing-cache.mjs';
import {readStore, storedKey} from '../doc-compiler/stored-docs.mjs';
import {inputsUnchanged} from './stored-self-audit.mjs';

/** Where the stored component list is written at `prepack`. */
export const COMPONENT_LIST_FILE = path.join(
  CLI_ROOT,
  'assets',
  'component-list.generated.json',
);

/**
 * Folder entries an install adds beside Core's own files: only `node_modules`.
 * Every other name counts, so a file added anywhere the list reads misses the
 * store.
 */
export const CORE_FOLDER_SKIP = /^node_modules$/;

/**
 * @typedef {object} StoredComponentList
 * @property {Record<string, string[]>} groups - discoverComponents' answer.
 * @property {Record<string, string>} imports - resolveImportPath's answer
 *   for each listed component.
 */

/**
 * The stored list for the Core in `coreDir`, while every file and folder its
 * work read is unchanged; checked once per operation.
 * @param {string} coreDir
 * @returns {StoredComponentList | null}
 */
export function storedComponentList(coreDir) {
  return oncePerListing(storeKey(coreDir), () => {
    /** @type {any} */
    let entry;
    try {
      entry = readStore(COMPONENT_LIST_FILE).get('core');
    } catch {
      return null;
    }
    if (
      !entry ||
      typeof entry.inputs !== 'object' ||
      typeof entry.groups !== 'object' ||
      typeof entry.imports !== 'object'
    ) {
      return null;
    }
    return keptInputsCheck(coreDir, entry.inputs)
      ? {groups: entry.groups, imports: entry.imports}
      : null;
  });
}

/**
 * The stored list for `coreDir` when this operation has already checked it,
 * without checking it: one lookup never pays for the check, which costs more
 * than the lookup.
 * @param {string} coreDir
 * @returns {StoredComponentList | null}
 */
export function checkedComponentList(coreDir) {
  return (
    /** @type {StoredComponentList | null | undefined} */ (
      onceComputed(storeKey(coreDir))
    ) ?? null
  );
}

/** The code that makes the kept check. */
const CHECK_CODE = [
  fileURLToPath(import.meta.url),
  fileURLToPath(new URL('./stored-self-audit.mjs', import.meta.url)),
];

/**
 * Whether every input the stored list recorded is in its recorded state
 * under `coreDir` (stored-self-audit.mjs inputsUnchanged), kept while every
 * file and folder the check read keeps its stamp, so a warm run does not
 * read Core's files again to check them.
 * @param {string} coreDir
 * @param {Record<string, string>} inputs
 * @returns {boolean}
 */
function keptInputsCheck(coreDir, inputs) {
  return keptTreeSummary(
    {
      kind: 'stored-component-list-check',
      roots: [],
      code: CHECK_CODE,
      key: [path.resolve(coreDir), storedKey(JSON.stringify(inputs))],
      recorded: true,
      // A stored verdict that is not one is checked again.
      accept: value => typeof value === 'boolean',
    },
    () => inputsUnchanged(coreDir, inputs, CORE_FOLDER_SKIP),
  );
}

/** @param {string} coreDir */
const storeKey = coreDir => `stored-component-list\0${coreDir}`;
