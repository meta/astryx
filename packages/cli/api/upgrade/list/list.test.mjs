// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colocated tests for the upgrade.list leaf: every field an entry
 * carries is declared on the canonical `UpgradeListEntry` type, and every
 * declared field is present on every entry.
 */

import {describe, it, expect} from 'vitest';
import * as fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {list} from './list.mjs';

const TYPE_FILE = fileURLToPath(
  new URL('../upgrade.type.mjs', import.meta.url),
);

/**
 * Property names a JSDoc `@typedef {object}` declares, parsed from the file.
 * @param {string} typedefName
 * @returns {string[]}
 */
function declaredProperties(typedefName) {
  const source = ts.createSourceFile(
    TYPE_FILE,
    fs.readFileSync(TYPE_FILE, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  /** @type {string[]} */
  const names = [];
  for (const statement of source.statements) {
    for (const doc of /** @type {any} */ (statement).jsDoc ?? []) {
      for (const tag of doc.tags ?? []) {
        if (
          !ts.isJSDocTypedefTag(tag) ||
          tag.name?.getText(source) !== typedefName
        ) {
          continue;
        }
        const literal = tag.typeExpression;
        if (literal && ts.isJSDocTypeLiteral(literal)) {
          for (const property of literal.jsDocPropertyTags ?? []) {
            names.push(property.name.getText(source));
          }
        }
      }
    }
  }
  return names.sort();
}

describe('upgrade.list entries', () => {
  it('carry exactly the fields UpgradeListEntry declares', async () => {
    const declared = declaredProperties('UpgradeListEntry');
    expect(declared.length).toBeGreaterThan(0);

    const {type, data} = await list();
    expect(type).toBe('upgrade.list');
    expect(data.length).toBeGreaterThan(0);
    for (const entry of data) {
      expect(Object.keys(entry).sort()).toEqual(declared);
    }
  });

  it('marks optional codemods with a boolean', async () => {
    const {data} = await list();
    for (const entry of data) expect(typeof entry.optional).toBe('boolean');
    expect(data.some(entry => entry.optional)).toBe(true);
  });
});
