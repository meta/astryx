// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Folder tests: a path that does not read (a file in its path, a
 * link loop) is never an empty folder, nor a folder to write into, and
 * never throws.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, describe, expect, it} from 'vitest';
import {folderIsEmpty, isFolderOrLinkToOne} from './empty-folder.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-empty-folder-'));
afterAll(() => fs.rmSync(root, {recursive: true, force: true}));

describe('a path that does not read', () => {
  it('is neither empty nor a folder, and never throws', () => {
    fs.writeFileSync(path.join(root, 'src'), 'a file\n');
    const under = path.join(root, 'src', 'themes');
    expect(folderIsEmpty(under)).toBe(false);
    expect(isFolderOrLinkToOne(under)).toBe(false);
    fs.symlinkSync('loop', path.join(root, 'loop'));
    expect(folderIsEmpty(path.join(root, 'loop'))).toBe(false);
    expect(isFolderOrLinkToOne(path.join(root, 'loop'))).toBe(false);
    fs.symlinkSync(path.join(root, 'nowhere'), path.join(root, 'dangling'));
    expect(folderIsEmpty(path.join(root, 'dangling'))).toBe(false);
    expect(folderIsEmpty(path.join(root, 'absent'))).toBe(true);
  });
});
