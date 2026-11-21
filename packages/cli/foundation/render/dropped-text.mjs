// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Which component dropped a text the page gave it, as the component's
 * own docs say.
 *
 * @input  a text the render did not draw, with the components around it, and
 *         the folder of the Core the page rendered with
 * @output the component that drops the text, `null` when the text is the
 *         first paint's to leave out, or `undefined` when a doc is missing
 * @position foundation/render; render-page.mjs asks it only for a text that
 *           is missing, so a page with no such text reads no docs
 */

import * as path from 'node:path';
import {
  documentedEntry,
  findComponentReadme,
} from '../discovery/component-discovery.mjs';
import {loadComponentDoc} from '../discovery/component-loader.mjs';

const CORE = '@astryxdesign/core';

/**
 * @typedef {object} ChainEntry
 * @property {string} component the element's name as the page writes it
 * @property {number} line
 * @property {string | null} from the module it is imported from; null for the page's own
 * @property {string} name the name that module exports it under
 */

/**
 * Whether a component takes children, as its doc lists its props: `true`,
 * `false`, or `null` when no doc of the given Core lists them.
 * @param {string | null} coreDir
 * @returns {(entry: ChainEntry) => Promise<boolean | null>}
 */
export function childrenReader(coreDir) {
  /** @type {Map<string, Promise<boolean | null>>} */
  const known = new Map();
  return entry => {
    if (
      !coreDir ||
      !entry.from ||
      (entry.from !== CORE && !entry.from.startsWith(`${CORE}/`))
    )
      return Promise.resolve(null);
    let answer = known.get(entry.name);
    if (!answer) {
      answer = takesChildren(coreDir, entry.name);
      known.set(entry.name, answer);
    }
    return answer;
  };
}

/**
 * @param {string} coreDir
 * @param {string} name
 * @returns {Promise<boolean | null>}
 */
async function takesChildren(coreDir, name) {
  const docPath = findComponentReadme(coreDir, name);
  if (!docPath) return null;
  try {
    const doc = await loadComponentDoc(path.resolve(docPath));
    const props = documentedEntry(doc, name)?.props;
    if (!Array.isArray(props) || props.length === 0) return null;
    return props.some((/** @type {any} */ p) => p?.name === 'children');
  } catch {
    return null;
  }
}

/**
 * The component that drops a missing text: the innermost one around it whose
 * doc lists props without `children`. `null` when every component around the
 * text takes children, so the text is there for a later paint (a collapsed
 * panel, an inactive tab or route). `undefined` when a component around it
 * has no doc that says (the page's own, or another package's).
 * @param {ChainEntry[]} chain the element first, then the components around it
 * @param {(entry: ChainEntry) => Promise<boolean | null>} takes
 * @returns {Promise<ChainEntry | null | undefined>}
 */
export async function dropperOf(chain, takes) {
  for (const entry of chain) if ((await takes(entry)) === false) return entry;
  for (const entry of chain)
    if ((await takes(entry)) !== true) return undefined;
  return chain.length > 0 ? null : undefined;
}
