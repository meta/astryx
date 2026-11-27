// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file input-field-family-members.js
 * @description The members of `family:input-fields`, read from the family
 * record's front matter through the shared knowledge front-matter reader. A
 * member is a Field-composed input: its props omit root `xstyle`
 * (family:input-fields FR10), so a caller cannot style its outer box through
 * `xstyle`.
 *
 * `no-style-only-wrapper` reads this list only when the file has no type
 * information. With types, it reads the child's props instead.
 */

import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseKnowledgeFrontmatter} from '../../scripts/lib/knowledge-frontmatter.mjs';

const RECORD = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../docs/families/input-fields.md',
);

let cached = null;

/**
 * The component names in the record's `members` field, for example
 * `Selector` for `component:Selector`. An unreadable record gives an empty
 * set, so the rule then reports as it did before the list existed.
 */
export function inputFieldFamilyMembers(recordPath = RECORD) {
  if (cached != null && recordPath === RECORD) {
    return cached;
  }
  let members = new Set();
  try {
    const {frontmatter} = parseKnowledgeFrontmatter(
      readFileSync(recordPath, 'utf8'),
      recordPath,
    );
    const listed = frontmatter.get('members');
    if (Array.isArray(listed)) {
      members = new Set(
        listed
          .filter(id => id.startsWith('component:'))
          .map(id => id.slice('component:'.length)),
      );
    }
  } catch {
    members = new Set();
  }
  if (recordPath === RECORD) {
    cached = members;
  }
  return members;
}
