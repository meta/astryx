// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file source-file-cache.test.mjs
 * @input source-file-cache.mjs's `keepSourceFiles`, with the repository's own
 *   TypeScript and a file in a temporary folder
 * @output Unit cases: a file is parsed once for every host and program that
 *   compiles with the same options while it is unchanged; a rewrite at the
 *   same size and modification time is parsed again; options that only
 *   resolve or check share files, and options that parse or bind them
 *   differently (JSX, strict mode) keep them apart; a kept file counts as read by the running operation; a
 *   TypeScript older than 5.3 gets the host's own `getSourceFile`; and a
 *   program over kept files reads the same types as one over fresh parses.
 * @position Node unit tests beside the props comparison and doc types check
 *   that use it.
 *
 * SYNC: When modified, update source-file-cache.mjs.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {recordReads} from '../fs/read-record.mjs';
import {keepSourceFiles} from './source-file-cache.mjs';

const OPTIONS = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  noEmit: true,
  types: [],
};

let dir;
let file;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-source-file-cache-'));
  file = path.join(dir, 'props.ts');
  fs.writeFileSync(file, 'export interface Props {size: number}\n');
});

afterEach(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

/** A host for `options` whose `getSourceFile` counts its parses of `file`. */
function countingHost(options) {
  const host = ts.createCompilerHost(options);
  const parse = host.getSourceFile.bind(host);
  const counted = {host, parses: 0};
  host.getSourceFile = (name, ...rest) => {
    if (path.resolve(name) === path.resolve(file)) counted.parses += 1;
    return parse(name, ...rest);
  };
  return counted;
}

describe('keepSourceFiles', () => {
  it('parses a file once for every host that compiles with the same options, while it is unchanged', () => {
    const first = countingHost(OPTIONS);
    const second = countingHost({...OPTIONS});
    const fromFirst = keepSourceFiles(ts, first.host, OPTIONS);
    const fromSecond = keepSourceFiles(ts, second.host, {...OPTIONS});
    const parsed = fromFirst(file, ts.ScriptTarget.ES2022);
    expect(fromFirst(file, ts.ScriptTarget.ES2022)).toBe(parsed);
    expect(fromSecond(file, ts.ScriptTarget.ES2022)).toBe(parsed);
    expect(first.parses + second.parses).toBe(1);
  });

  it('parses it again once it is rewritten, at the same size and modification time', () => {
    const {host} = countingHost(OPTIONS);
    const keep = keepSourceFiles(ts, host, OPTIONS);
    const before = keep(file, ts.ScriptTarget.ES2022);
    const {atime, mtime} = fs.statSync(file);
    fs.writeFileSync(file, 'export interface Props {name: string}\n');
    fs.utimesSync(file, atime, mtime);
    const after = keep(file, ts.ScriptTarget.ES2022);
    expect(after).not.toBe(before);
    expect(after.text).toContain('name: string');
  });

  it('shares files between options that parse and bind alike', () => {
    const {host} = countingHost(OPTIONS);
    const resolving = {...OPTIONS, types: ['node'], paths: {'@x/*': ['./x/*']}};
    const parsed = keepSourceFiles(
      ts,
      host,
      OPTIONS,
    )(file, ts.ScriptTarget.ES2022);
    const other = countingHost(resolving);
    expect(
      keepSourceFiles(ts, other.host, resolving)(file, ts.ScriptTarget.ES2022),
    ).toBe(parsed);
    expect(other.parses).toBe(0);
  });

  it('keeps files apart for options that parse or bind them differently', () => {
    const {host} = countingHost(OPTIONS);
    const parsed = keepSourceFiles(
      ts,
      host,
      OPTIONS,
    )(file, ts.ScriptTarget.ES2022);
    for (const options of [
      {...OPTIONS, jsx: ts.JsxEmit.ReactJSX},
      {...OPTIONS, strict: false},
    ]) {
      expect(
        keepSourceFiles(
          ts,
          countingHost(options).host,
          options,
        )(file, ts.ScriptTarget.ES2022),
      ).not.toBe(parsed);
    }
  });

  it('counts a kept file as read by the running operation', () => {
    const {host} = countingHost(OPTIONS);
    const keep = keepSourceFiles(ts, host, OPTIONS);
    keep(file, ts.ScriptTarget.ES2022);
    const seen = new Map();
    recordReads(seen, () => keep(file, ts.ScriptTarget.ES2022));
    expect([...seen.keys()]).toContain(path.resolve(file));
  });

  it("gives a TypeScript older than 5.3 the host's own getSourceFile", () => {
    const counted = countingHost(OPTIONS);
    const older = {...ts, versionMajorMinor: '5.2'};
    const keep = keepSourceFiles(older, counted.host, OPTIONS);
    keep(file, ts.ScriptTarget.ES2022);
    keep(file, ts.ScriptTarget.ES2022);
    expect(counted.parses).toBe(2);
  });

  it('reads the same types in a program over kept files as over fresh parses', () => {
    const propsOf = keep => {
      const host = ts.createCompilerHost(OPTIONS);
      if (keep) host.getSourceFile = keepSourceFiles(ts, host, OPTIONS);
      const program = ts.createProgram({
        rootNames: [file],
        options: OPTIONS,
        host,
      });
      const checker = program.getTypeChecker();
      const source = program.getSourceFile(file);
      const props = checker
        .getExportsOfModule(checker.getSymbolAtLocation(source))
        .find(symbol => symbol.name === 'Props');
      return checker.typeToString(
        checker.getDeclaredTypeOfSymbol(props),
        undefined,
        ts.TypeFormatFlags.InTypeAlias,
      );
    };
    const fresh = propsOf(false);
    // Twice over kept files: the second program binds nothing anew.
    expect(propsOf(true)).toBe(fresh);
    expect(propsOf(true)).toBe(fresh);
  });
});
