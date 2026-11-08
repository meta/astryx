// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Which public doc types accept `stability: 'experimental'`
 * (spec:AST-084 FR18): every one the authoring entry exports except `ThemeDoc`
 * and `IconSetDoc`, plus the schema field and enum member types. Read from
 * the published declarations with the TypeScript checker, so a new doc type
 * fails here until it carries the field or joins the exceptions.
 *
 * @input packages/cli/authoring/index.d.ts and the doc-type declarations
 * @output assertions only
 * @position authoring/doctypes — beside the types it reads
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {describe, expect, it} from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.resolve(HERE, '..', 'index.d.ts');
/** Doc types FR18 excepts; the data file is not a doc. */
const EXCEPT = new Set(['ThemeDoc', 'IconSetDoc', 'IconSetData']);
/** Types FR18 names beside the docs: a schema field and an enum value. */
const MEMBER_TYPES = ['SchemaFieldDoc', 'EnumMemberDoc'];

describe('stability on the public doc types', () => {
  it('every doc type the authoring entry exports accepts it, except ThemeDoc and IconSetDoc', () => {
    const program = ts.createProgram([ENTRY], {
      noEmit: true,
      allowJs: true,
      skipLibCheck: true,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      target: ts.ScriptTarget.ES2022,
    });
    const checker = program.getTypeChecker();
    const entry = /** @type {ts.SourceFile} */ (program.getSourceFile(ENTRY));
    const module = /** @type {ts.Symbol} */ (
      checker.getSymbolAtLocation(entry)
    );
    /** @type {Map<string, ts.Type>} */
    const exported = new Map();
    for (const symbol of checker.getExportsOfModule(module)) {
      const target =
        symbol.flags & ts.SymbolFlags.Alias
          ? checker.getAliasedSymbol(symbol)
          : symbol;
      if (
        target.flags &
        (ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias)
      ) {
        exported.set(symbol.getName(), checker.getDeclaredTypeOfSymbol(target));
      }
    }
    /** @param {ts.Type} type */
    const accepts = type => {
      const members = type.isUnion() ? type.types : [type];
      return members.every(member => {
        const property = checker.getPropertyOfType(member, 'stability');
        return (
          property != null &&
          checker.typeToString(checker.getTypeOfSymbol(property)) ===
            '"experimental" | undefined'
        );
      });
    };
    // The doc file types: each the entry exports on its own line from the
    // doc-type barrel, one per kind of doc file.
    const docTypes = [
      ...fs
        .readFileSync(ENTRY, 'utf8')
        .matchAll(/^export type \{(\w+)\} from '\.\/doctypes\/types\.js';/gmu),
    ].map(([, name]) => name);
    expect(docTypes.length).toBeGreaterThan(10);
    /** @type {Record<string, boolean>} */
    const result = {};
    for (const name of [...docTypes, ...MEMBER_TYPES]) {
      const type = exported.get(name);
      expect(type, `${name} is exported`).toBeDefined();
      result[name] = accepts(/** @type {ts.Type} */ (type));
    }
    /** @type {Record<string, boolean>} */
    const expected = {};
    for (const name of [...docTypes, ...MEMBER_TYPES]) {
      expected[name] = !EXCEPT.has(name);
    }
    expect(result).toEqual(expected);
  }, 120_000);
});
