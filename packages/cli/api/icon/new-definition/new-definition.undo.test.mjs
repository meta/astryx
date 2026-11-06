// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `iconNewDefinition` with `icon` (AST-084 FR13): when the set fails to
 * read back after both writes, the data file and the definition file are
 * both undone, so every file is as it was.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const reread = vi.hoisted(() => ({calls: 0, failOn: 0}));

vi.mock(
  '../../../foundation/discovery/icon-set-writer.mjs',
  async importOriginal => {
    const actual =
      /** @type {typeof import('../../../foundation/discovery/icon-set-writer.mjs')} */ (
        await importOriginal()
      );
    return {
      ...actual,
      /** @type {typeof actual.findLocalIconSet} */
      findLocalIconSet: async (...args) => {
        reread.calls += 1;
        if (reread.calls === reread.failOn) {
          throw new Error('the set did not read back');
        }
        return actual.findLocalIconSet(...args);
      },
    };
  },
);

const {iconNewSet} = await import('../new-set/new-set.mjs');
const {iconNewDefinition} = await import('./new-definition.mjs');

/** @type {string} */
let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(
    path.join(process.cwd(), '.astryx-add-icon-definition-undo-'),
  );
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    `${JSON.stringify({name: '@acme/icons', version: '1.0.0', license: 'MIT'}, null, 2)}\n`,
  );
  reread.calls = 0;
  reread.failOn = 0;
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('iconNewDefinition --icon', () => {
  it('a failed re-read undoes the map write and the definition file', async () => {
    await iconNewSet('outline', {cwd: tmpDir});
    const set = path.join(tmpDir, 'icon-sets', 'outline');
    const dataPath = path.join(set, 'outline.icons.json');
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    data.icons = [{id: 'cross', export: 'CrossIcon', words: ['cross']}];
    fs.writeFileSync(dataPath, `${JSON.stringify(data, null, 2)}\n`);
    const before = fs.readFileSync(dataPath, 'utf-8');

    reread.calls = 0;
    // The first lookup finds the set; the read-back after the writes fails.
    reread.failOn = 2;
    await expect(
      iconNewDefinition('crossOut', {
        cwd: tmpDir,
        description: 'Cross something out.',
        words: ['strike', 'cross'],
        icon: 'cross',
      }),
    ).rejects.toThrow('the set did not read back');
    expect(reread.calls).toBe(2);
    expect(fs.readFileSync(dataPath, 'utf-8')).toBe(before);
    expect(
      fs.existsSync(path.join(set, 'definitions', 'crossOut.doc.mjs')),
    ).toBe(false);

    // With the read-back passing, the same call writes both.
    reread.failOn = 0;
    await iconNewDefinition('crossOut', {
      cwd: tmpDir,
      description: 'Cross something out.',
      words: ['strike', 'cross'],
      icon: 'cross',
    });
    expect(JSON.parse(fs.readFileSync(dataPath, 'utf-8')).map).toEqual({
      crossOut: 'cross',
    });
  });
});
