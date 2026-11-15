// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Core's and Lab's component docs place translated prop text where the
 * overlay reads it. A doc whose props live only on its `components` entries
 * has no top-level prop table, so a `docsZh` or `docsDense` overlay's
 * top-level `props` or `propDescriptions` match nothing: the overlay drops
 * that text and readers in that language see the authored text instead. The
 * text belongs on the overlay's matching `components` entry.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {describe, expect, it} from 'vitest';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = path.resolve(CLI, '..');
const ROOTS = ['core', 'lab'].map(name => path.join(PACKAGES, name, 'src'));
const OVERLAYS = ['docsZh', 'docsDense'];

/**
 * Every `.doc.mjs` under `dir`, skipping `node_modules` and `__tests__`.
 * @param {string} dir
 * @returns {string[]}
 */
function docFiles(dir) {
  /** @type {string[]} */
  const found = [];
  /** @param {string} folder */
  const walk = folder => {
    for (const entry of fs.readdirSync(folder, {withFileTypes: true})) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.doc.mjs')) found.push(full);
    }
  };
  walk(dir);
  return found.sort();
}

/**
 * The top-level prop names an overlay translates.
 * @param {any} overlay
 * @returns {string[]}
 */
function topLevelPropNames(overlay) {
  const listed = Array.isArray(overlay.props)
    ? overlay.props.map((/** @type {any} */ prop) => String(prop?.name))
    : [];
  const described =
    overlay.propDescriptions && typeof overlay.propDescriptions === 'object'
      ? Object.keys(overlay.propDescriptions)
      : [];
  return [...listed, ...described];
}

describe('translated prop text in a doc with only component entries', () => {
  it('sits on the overlay components entries, never at its top level', async () => {
    /** @type {string[]} */
    const dropped = [];
    for (const file of ROOTS.flatMap(docFiles)) {
      const mod = await import(pathToFileURL(file).href);
      const doc = mod.docs ?? mod.default;
      const hasComponents =
        Array.isArray(doc?.components) && doc.components.length > 0;
      const hasTopLevelProps =
        Array.isArray(doc?.props) && doc.props.length > 0;
      if (!hasComponents || hasTopLevelProps) continue;
      for (const exportName of OVERLAYS) {
        const overlay = mod[exportName];
        if (!overlay || typeof overlay !== 'object') continue;
        const names = topLevelPropNames(overlay);
        if (names.length > 0) {
          dropped.push(
            `${path.relative(PACKAGES, file)} ${exportName}: ${names.join(', ')}`,
          );
        }
      }
    }
    expect(dropped).toEqual([]);
  });
});
