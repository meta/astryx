// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The route segment of every name the CLI's own typed docs (command,
 * function, schema and enum docs) can carry, read from their text without
 * loading them.
 *
 * @input the trees of the folders that hold them (./name-roots.mjs
 *   CLI_SELF_DOC_DIRS), as kept-tree reads them
 * @output the names, as lines
 * @position foundation/discovery: read by the lookup commands' not-found
 *   hint's name index (../suggest/name-index.mjs) when it makes the index
 */

import * as path from 'node:path';
import {nameLines} from '../fs/kept-tree.mjs';
import {foldEntryName} from './entry-name-files.mjs';
import {routeSegment} from './docs-section-key.mjs';

/** A `name` field and its quoted value, as a doc's text writes it. */
const NAME_FIELD_RE = /["']?\bname["']?\s*:\s*["']([^"'\n]+)["']/gu;

/**
 * The route segment of every name the CLI's own typed docs can carry, read
 * from the trees of the CLI's own doc folders: each `name` field's value as a
 * route segment, folded ({@link foldEntryName}), as lines ({@link nameLines}).
 * The tree gives such a doc the segment of its name, so a segment that is not
 * a line here is no such doc's.
 * @param {import('../fs/kept-tree.mjs').Tree[]} trees
 * @returns {string | string[]}
 */
export function cliSelfDocNameLines(trees) {
  const names = new Set();
  for (const {folders, readText} of trees) {
    for (const {rel, entries} of folders) {
      for (const {name, isDir} of entries) {
        if (isDir || !name.endsWith('.doc.mjs')) continue;
        let text;
        try {
          text = readText(rel === '' ? name : path.join(rel, name));
        } catch {
          continue;
        }
        for (const [, value] of text.matchAll(NAME_FIELD_RE)) {
          names.add(foldEntryName(routeSegment(value)));
        }
      }
    }
  }
  return nameLines(names);
}
