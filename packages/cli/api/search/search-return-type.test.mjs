// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The declared return type of `search()` is the canonical SearchResponse.
 * Consumers of `@astryxdesign/cli/api` type-check against it; an `object` entry
 * type erases every result field from their view.
 */

import {createRequire} from 'node:module';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SEARCH = path.join(HERE, 'search.mjs');
const TYPES = path.join(HERE, 'search.type.mjs');

describe('search() declared return type', () => {
  it('types each result as the canonical SearchResultEntry', () => {
    const program = ts.createProgram([SEARCH, TYPES], {
      allowJs: true,
      noEmit: true,
      skipLibCheck: true,
      types: [],
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      target: ts.ScriptTarget.ES2022,
    });
    const checker = program.getTypeChecker();
    const source = program.getSourceFile(SEARCH);
    /** @param {string} file @param {string} name */
    const exportOf = (file, name) =>
      checker
        .getExportsOfModule(checker.getSymbolAtLocation(program.getSourceFile(file)))
        .find((/** @type {any} */ s) => s.name === name);
    /** @param {any} type @param {string} name */
    const prop = (type, name) =>
      checker.getTypeOfSymbolAtLocation(type.getProperty(name), source);
    /** @param {any} type */
    const names = type => type.getProperties().map((/** @type {any} */ p) => p.name).sort();

    const fn = checker.getTypeOfSymbolAtLocation(exportOf(SEARCH, 'search'), source);
    const response = checker.getAwaitedType(fn.getCallSignatures()[0].getReturnType());
    const data = prop(response, 'data');
    expect(names(data)).toEqual(['matchCount', 'query', 'results']);
    const entry = checker.getIndexTypeOfType(prop(data, 'results'), ts.IndexKind.Number);
    const canonical = checker.getDeclaredTypeOfSymbol(exportOf(TYPES, 'SearchResultEntry'));
    expect(names(canonical)).toContain('command');
    expect(names(entry)).toEqual(names(canonical));
  }, 30_000);
});
