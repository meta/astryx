// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import jscodeshift from 'jscodeshift';
import {afterEach, describe, expect, it} from 'vitest';
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

/**
 * Run a codemod that renames `oldProp` over the given files, counting the
 * files its transform saw.
 * @param {Record<string, string>} files name to source
 * @param {string[] | undefined} mentions
 */
function runOver(files, mentions) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemod-mentions-'));
  dirs.push(dir);
  const paths = Object.entries(files).map(([name, source]) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, source);
    return file;
  });
  /** @type {string[]} */
  const seen = [];
  const result = runCodeCodemod(
    {
      id: 'rename-old-prop',
      type: 'code',
      package: 'core',
      codemod: {
        title: 'Rename oldProp',
        fileExtensions: ['.tsx', '.css'],
        ...(mentions ? {mentions} : {}),
        transform(file, api) {
          seen.push(path.basename(file.path));
          if (file.path.endsWith('.css')) return undefined;
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
    {apply: false, log, jscodeshift, root: dir},
  );
  return {seen, result};
}

const FILES = {
  'uses.tsx': 'export const a = <Box oldProp="x" />;\n',
  'plain.tsx': 'export const b = <Box other="x" />;\n',
  'broken.tsx': 'export const c = <Box other="x" ;\n',
};

describe('a codemod that declares the words a file must say', () => {
  it('skips a file that says none of them and parses, with the same result', () => {
    const declared = runOver(FILES, ['oldProp']);
    const undeclared = runOver(FILES, undefined);
    expect(undeclared.seen.sort()).toEqual([
      'broken.tsx',
      'plain.tsx',
      'uses.tsx',
    ]);
    // The unparseable file still reaches the transform, so it is reported
    // exactly as before.
    expect(declared.seen.sort()).toEqual(['broken.tsx', 'uses.tsx']);
    const strip = (/** @type {any} */ r) =>
      JSON.parse(
        JSON.stringify(r).replaceAll(/codemod-mentions-[^/"\\\\]+/g, 'D'),
      );
    expect(strip(declared.result)).toEqual(strip(undeclared.result));
    expect(declared.result.filesChanged).toBe(1);
    expect(
      declared.result.errors.map((/** @type {any} */ e) => e.file),
    ).toEqual(['broken.tsx']);
  });

  it('runs on a file with a backslash, where an escape may spell a word', () => {
    const escaped = {
      'escaped.tsx': "export const d = <Box {...{'old\\u0050rop': 1}} />;\n",
    };
    expect(runOver(escaped, ['oldProp']).seen).toEqual(['escaped.tsx']);
  });

  it('runs on every file when it declares no words', () => {
    expect(runOver(FILES, []).seen.sort()).toEqual([
      'broken.tsx',
      'plain.tsx',
      'uses.tsx',
    ]);
  });

  it('always runs on a stylesheet, even one that parses as JavaScript', () => {
    // `button.primary` then a `{ … }` block on the next line is a valid
    // JavaScript expression and block, yet a stylesheet transform changes it.
    const css = {'theme.css': 'button.primary\n{\n  color: white;\n}\n'};
    expect(runOver(css, ['oldProp']).seen).toEqual(['theme.css']);
  });
});
