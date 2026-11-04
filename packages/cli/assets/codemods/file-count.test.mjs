// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `filesChanged` counts FILES, not (codemod, file) pairs.
 *
 * One source file that four codemods each changed was reported as four files
 * changed — the total was incremented once per transform per file, so it
 * equalled `transformsApplied` in every run and the documented meaning of the
 * field ("Total files changed") was never true. The two numbers answer
 * different questions and both are in the receipt.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import jscodeshift from 'jscodeshift';
import {runCodemods} from './runner.mjs';
import {runIntegrationCodemods} from './integration-runner.mjs';

let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-file-count-'));
});
afterEach(() => fs.rmSync(dir, {recursive: true, force: true}));

/** A transform that rewrites one distinctive token, so several can stack. */
const renaming = (from, to) => (file) =>
  file.source.includes(from) ? file.source.split(from).join(to) : null;

/** @param {string} name @param {string[]} contents */
function writeSources(...contents) {
  return contents.map((content, i) => {
    const file = path.join(dir, `file${i}.ts`);
    fs.writeFileSync(file, content);
    return file;
  });
}

describe('core codemod runner — filesChanged counts files', () => {
  it('reports 1 file for one file changed by four codemods', async () => {
    writeSources('const a = ONE + TWO + THREE + FOUR;\n');

    const result = await runCodemods(
      [
        {
          version: '0.0.2',
          transforms: [
            {name: 'one', transform: renaming('ONE', '1'), meta: {title: 'one'}},
            {name: 'two', transform: renaming('TWO', '2'), meta: {title: 'two'}},
            {name: 'three', transform: renaming('THREE', '3'), meta: {title: 'three'}},
            {name: 'four', transform: renaming('FOUR', '4'), meta: {title: 'four'}},
          ],
        },
      ],
      {apply: true, path: dir, root: dir, codemod: undefined, skipCodemods: new Set(), silent: true},
    );

    expect(result.totalTransformsApplied).toBe(4);
    expect(result.totalFilesChanged).toBe(1);
    expect(new Set(result.changedFiles).size).toBe(1);
  });

  it('still counts two files as two', async () => {
    writeSources('const a = ONE;\n', 'const b = ONE;\n');

    const result = await runCodemods(
      [
        {
          version: '0.0.2',
          transforms: [
            {name: 'one', transform: renaming('ONE', '1'), meta: {title: 'one'}},
          ],
        },
      ],
      {apply: true, path: dir, root: dir, codemod: undefined, skipCodemods: new Set(), silent: true},
    );

    expect(result.totalTransformsApplied).toBe(2);
    expect(result.totalFilesChanged).toBe(2);
  });

  it('reports 0 when nothing matched', async () => {
    writeSources('const a = 1;\n');

    const result = await runCodemods(
      [
        {
          version: '0.0.2',
          transforms: [
            {name: 'one', transform: renaming('ONE', '1'), meta: {title: 'one'}},
          ],
        },
      ],
      {apply: true, path: dir, root: dir, codemod: undefined, skipCodemods: new Set(), silent: true},
    );

    expect(result.totalFilesChanged).toBe(0);
    expect(result.totalTransformsApplied).toBe(0);
  });
});

describe('integration codemod runner — filesChanged counts files', () => {
  it('reports 1 file for one file changed by three integration codemods', () => {
    writeSources('const a = ONE + TWO + THREE;\n');

    const entry = (id, from, to) => ({
      id,
      package: '@acme/widgets',
      type: 'code',
      codemod: {title: id, transform: renaming(from, to)},
    });

    const result = runIntegrationCodemods(
      [
        {
          version: '1.0.0',
          codemods: [
            entry('one', 'ONE', '1'),
            entry('two', 'TWO', '2'),
            entry('three', 'THREE', '3'),
          ],
        },
      ],
      {apply: true, path: dir, root: dir, skipCodemods: new Set(), jscodeshift, silent: true},
    );

    expect(result.totalTransformsApplied).toBe(3);
    expect(result.totalFilesChanged).toBe(1);
    expect(new Set(result.changedFiles).size).toBe(1);
  });
});

describe('core codemod runner — a project codemod', () => {
  it('counts every file it writes, and one change', async () => {
    const result = await runCodemods(
      [
        {
          version: '0.0.2',
          transforms: [
            {
              name: 'project-plan',
              meta: {title: 'project plan', codemodType: 'project'},
              transform: async root => ({
                writes: [
                  {path: path.join(root, 'a.ts'), contents: 'a\n'},
                  {path: path.join(root, 'b.ts'), contents: 'b\n'},
                ],
                deletes: [],
                problems: [],
              }),
            },
          ],
        },
      ],
      {apply: true, path: dir, root: dir, codemod: undefined, skipCodemods: new Set(), silent: true},
    );

    expect(result.totalFilesChanged).toBe(2);
    expect(result.totalTransformsApplied).toBe(1);
  });
});
