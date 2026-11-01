// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Reading a component or hook doc for search: the compiled doc and its
 * usage guidance. Imported only by the adapter's gatherers.
 */

import {readDocView} from '../../foundation/doc-compiler/read.mjs';

/** @typedef {import('./_gather-components.mjs').Candidate} Candidate */

/**
 * A component or hook doc, compiled, or null when it cannot be read.
 * @param {string} docPath
 * @param {string} [exportName]
 * @param {'components' | 'hooks'} [root]
 * @returns {Promise<any>}
 */
export async function loadModuleDoc(
  docPath,
  exportName = 'docs',
  root = 'components',
) {
  try {
    // Support both the stamped default export and the legacy named export.
    return (
      (await readDocView(docPath, {
        root,
        loader: 'native',
        exports: ['default', exportName],
      })) ?? null
    );
  } catch {
    return null;
  }
}

/**
 * Build component candidates from core's own tree: name + keywords +
 * usage/description from the component's .doc.mjs.
 * @param {string} coreDir
 * @returns {Promise<Candidate[]>}
 */

/**
 * Usage guidance from a component doc: its feature list and its best-practice
 * advice, flattened to plain strings.
 *
 * This is where a reader's vocabulary usually lives. `Banner` calls itself "a
 * persistent message" and only its guidance names "form errors, system
 * updates, maintenance notices" — so a search for the words people actually
 * type finds nothing without it.
 *
 * @param {any} doc
 * @returns {string[]}
 */
export function guidanceFrom(doc) {
  if (!doc) return [];
  const features = Array.isArray(doc.features) ? doc.features : [];
  const practices = Array.isArray(doc.usage?.bestPractices)
    ? doc.usage.bestPractices
    : [];
  return [...features, ...practices]
    .map(entry =>
      typeof entry === 'string'
        ? entry
        : [
            entry?.title,
            entry?.text,
            entry?.description,
            entry?.do,
            entry?.dont,
          ]
            .filter(Boolean)
            .join(' '),
    )
    .filter(Boolean);
}
