// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Search's hook candidates, read from Core's hook docs. Imported only
 * by the adapter.
 */

import {CORE_PACKAGE} from '../../foundation/discovery/component-discovery.mjs';
import {
  discoverHooks,
  findHookDoc,
} from '../../foundation/discovery/hook-discovery.mjs';
import {loadModuleDoc} from './_module-doc.mjs';

/** @typedef {import('./_lexical.mjs').Candidate} Candidate */

/**
 * Build hook candidates: name + keywords + usage/description from the hook's
 * .doc.mjs.
 * @param {string} coreDir
 * @returns {Promise<Candidate[]>}
 */
export async function gatherHooks(coreDir) {
  const grouped = discoverHooks(coreDir);
  const names = Object.values(grouped).flat();
  /** @type {Candidate[]} */
  const candidates = [];
  for (const hookName of names) {
    const docPath = findHookDoc(coreDir, hookName);
    /** @type {string[]} */
    let keywords = [];
    let description = '';
    let importPath = '@astryxdesign/core/hooks';
    if (docPath) {
      const doc = await loadModuleDoc(docPath, 'docs', 'hooks');
      if (doc) {
        keywords = Array.isArray(doc.keywords) ? doc.keywords : [];
        description = doc.usage?.description || doc.description || '';
        importPath = doc.importPath || importPath;
      }
    }
    candidates.push({
      domain: 'hook',
      name: hookName,
      keywords,
      description,
      _package: CORE_PACKAGE,
      _import: importPath,
    });
  }
  return candidates;
}
