// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The docs a run on Core reads and a run on another base leaves out.
 * @input the CLI's built-in topics and docs tree
 * @output coreOnlyDocNames()
 * @position foundation/bases — lets a check tell a link into Core's docs
 *   from a broken link
 */

import {builtinTopicsForCore} from '../discovery/docs-discovery.mjs';
import {loadTreeInputs} from '../doc-compiler/tree.mjs';
import {currentNonCoreBase} from './state.mjs';

/**
 * The names of the docs a run on Core reads and this run leaves out: every
 * built-in topic and every tree doc outside the CLI's own roots. Empty in a
 * run on Core.
 * @returns {Promise<Set<string>>}
 */
export async function coreOnlyDocNames() {
  if (!currentNonCoreBase()) return new Set();
  const all = await loadTreeInputs({selfDocs: false, allRoots: true});
  const kept = await loadTreeInputs({selfDocs: false});
  const keptNames = new Set([
    ...kept.namespaces.map(ns => ns.doc.name),
    ...kept.docs.map(doc => doc.name),
  ]);
  return new Set(
    [
      ...Object.keys(builtinTopicsForCore()),
      ...all.namespaces.map(ns => ns.doc.name),
      ...all.docs.map(doc => doc.name),
    ].filter(name => !keptNames.has(name)),
  );
}
