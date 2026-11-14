// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A code codemod's run binds jscodeshift to each parser once for all
 * the files it reads, and each file's transform sees the same jscodeshift
 * as it would bound for that file alone.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import jscodeshift from 'jscodeshift';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {runCodeCodemod} from './run-codemod.mjs';

/** @type {string[]} */
const dirs = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    fs.rmSync(dir, {recursive: true, force: true});
});

const log = {
  step() {},
  info() {},
  success() {},
  warn() {},
  error() {},
  message() {},
};

/** @type {Record<string, string>} */
const FILES = {
  'a.tsx': 'export const a = <Box oldProp="x" />;\n',
  'b.ts': 'export const b: number = 1;\n',
  'c.jsx': 'export const c = <Box oldProp="y" />;\n',
  'd.tsx': 'export const d = <Box oldProp="z" />;\n',
  'e.js': 'export const e = 2;\n',
};

/**
 * Rename `oldProp` over FILES with `factory` as the jscodeshift factory.
 * @param {{withParser: (parser: string) => any}} factory
 */
function renameOver(factory) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemod-parsers-'));
  dirs.push(dir);
  const paths = Object.entries(FILES).map(([name, source]) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, source);
    return file;
  });
  const result = runCodeCodemod(
    {
      id: 'rename-old-prop',
      type: 'code',
      package: 'core',
      codemod: {
        title: 'Rename oldProp',
        fileExtensions: ['.tsx', '.ts', '.jsx', '.js'],
        transform(file, api) {
          const root = api.jscodeshift(file.source);
          const attrs = root.find(api.jscodeshift.JSXAttribute, {
            name: {name: 'oldProp'},
          });
          if (attrs.size() === 0) return undefined;
          attrs.forEach(p => {
            p.node.name.name = 'newProp';
          });
          return root.toSource();
        },
      },
    },
    paths,
    {apply: false, log, jscodeshift: factory, root: dir},
  );
  return JSON.parse(
    JSON.stringify(result).replaceAll(/codemod-parsers-[^/"\\]+/g, 'D'),
  );
}

describe('code codemod parsers', () => {
  it('binds jscodeshift to each parser once for all the files', () => {
    const withParser = vi.fn(parser => jscodeshift.withParser(parser));
    const result = renameOver({withParser});
    expect(withParser.mock.calls.map(([parser]) => parser).sort()).toEqual([
      'babel',
      'tsx',
    ]);
    expect(result.filesChanged).toBe(3);
    // The same result as a jscodeshift bound afresh for every file.
    expect(result).toEqual(
      renameOver({withParser: parser => jscodeshift.withParser(parser)}),
    );
  });
});
