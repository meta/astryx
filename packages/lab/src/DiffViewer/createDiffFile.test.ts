// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {createDiffFile} from './createDiffFile';
import type {DiffViewerFile} from './diffTypes';

/** Rebuild both sides from the hunks of a full-context diff. */
function sides(file: DiffViewerFile) {
  const oldSide: string[] = [];
  const newSide: string[] = [];
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.kind !== 'added') {
        oldSide.push(line.content);
      }
      if (line.kind !== 'removed') {
        newSide.push(line.content);
      }
    }
  }
  return {oldSide, newSide};
}

describe('createDiffFile', () => {
  it('returns no hunks for identical text', () => {
    const file = createDiffFile({oldValue: 'a\nb\n', newValue: 'a\nb\n'});
    expect(file).toMatchObject({status: 'modified', hunks: []});
  });

  it('finds a minimal change with numbered lines and a header', () => {
    const file = createDiffFile({
      oldValue: 'a\nb\nc\n',
      newValue: 'a\nB\nc\n',
      path: 'x.txt',
    });
    expect(file.oldPath).toBe('x.txt');
    expect(file.newPath).toBe('x.txt');
    expect(file.hunks).toHaveLength(1);
    const [hunk] = file.hunks;
    expect(hunk.header).toBe('@@ -1,3 +1,3 @@');
    expect(
      hunk.lines.map(l => [
        l.kind,
        l.content,
        l.oldLineNumber,
        l.newLineNumber,
      ]),
    ).toEqual([
      ['context', 'a', 1, 1],
      ['removed', 'b', 2, null],
      ['added', 'B', null, 2],
      ['context', 'c', 3, 3],
    ]);
  });

  it('round-trips both texts with enough context', () => {
    const oldValue = 'one\ntwo\nthree\nfour\nfive\nsix\n';
    const newValue = 'zero\none\nthree\nfour\n4.5\nfive\nsix\nseven\n';
    const file = createDiffFile({oldValue, newValue, contextLines: 100});
    const {oldSide, newSide} = sides(file);
    expect(oldSide).toEqual(oldValue.trimEnd().split('\n'));
    expect(newSide).toEqual(newValue.trimEnd().split('\n'));
  });

  it('splits distant changes into separate hunks', () => {
    const base = Array.from({length: 30}, (_, i) => `line ${i + 1}`);
    const next = [...base];
    next[1] = 'changed 2';
    next[25] = 'changed 26';
    const file = createDiffFile({
      oldValue: base.join('\n'),
      newValue: next.join('\n'),
      contextLines: 2,
    });
    expect(file.hunks.map(h => h.header)).toEqual([
      '@@ -1,4 +1,4 @@',
      '@@ -24,5 +24,5 @@',
    ]);
  });

  it('marks added and deleted files from a null path', () => {
    const added = createDiffFile({
      oldValue: '',
      newValue: 'a\nb\n',
      oldPath: null,
      newPath: 'new.txt',
    });
    expect(added).toMatchObject({status: 'added', oldPath: null});
    expect(added.hunks[0].header).toBe('@@ -0,0 +1,2 @@');

    const deleted = createDiffFile({
      oldValue: 'a\n',
      newValue: '',
      oldPath: 'old.txt',
      newPath: null,
    });
    expect(deleted).toMatchObject({status: 'deleted', newPath: null});
    expect(deleted.hunks[0].header).toBe('@@ -1 +0,0 @@');
  });

  it('keeps a minimal diff when changes sit between long shared runs', () => {
    const base = Array.from({length: 3000}, (_, i) => `line ${i + 1}`);
    const next = [...base];
    next[999] = 'changed 1000';
    next.splice(2000, 1);
    const file = createDiffFile({
      oldValue: base.join('\n'),
      newValue: next.join('\n'),
      contextLines: 0,
    });
    expect(file.hunks.map(h => h.header)).toEqual([
      '@@ -1000 +1000 @@',
      '@@ -2001 +2000,0 @@',
    ]);
  });

  it('shows a rewrite too large to search as one replaced block', () => {
    // Fully different 6000-line texts: past the search cap, the changed middle
    // is every old line removed, then every new line added.
    const lineCount = 6000;
    const oldLines = Array.from({length: lineCount}, (_, i) => `old ${i}`);
    const newLines = Array.from({length: lineCount}, (_, i) => `new ${i}`);
    const file = createDiffFile({
      oldValue: ['head', ...oldLines, 'tail'].join('\n'),
      newValue: ['head', ...newLines, 'tail'].join('\n'),
      contextLines: 1,
    });
    expect(file.hunks).toHaveLength(1);
    const [hunk] = file.hunks;
    expect(hunk.header).toBe(`@@ -1,${lineCount + 2} +1,${lineCount + 2} @@`);
    const kinds = hunk.lines.map(line => line.kind);
    expect(kinds.filter(kind => kind === 'removed')).toHaveLength(lineCount);
    expect(kinds.filter(kind => kind === 'added')).toHaveLength(lineCount);
    // Shared lines are still context, and every removal precedes the additions.
    expect(kinds[0]).toBe('context');
    expect(kinds[kinds.length - 1]).toBe('context');
    expect(kinds.indexOf('added')).toBe(lineCount + 1);
    expect(hunk.isReplacedBlock).toBe(true);
    const {oldSide, newSide} = sides(file);
    expect(oldSide).toEqual(['head', ...oldLines, 'tail']);
    expect(newSide).toEqual(['head', ...newLines, 'tail']);
  });

  it('does not mark a minimal diff as a replaced block', () => {
    const file = createDiffFile({oldValue: 'a\nb\n', newValue: 'a\nB\n'});
    expect(file.hunks[0].isReplacedBlock).toBeUndefined();
  });

  it('keeps a long one-sided change minimal, not a replaced block', () => {
    // Only additions: adding every new line is already the minimal diff.
    const lineCount = 6000;
    const added = Array.from({length: lineCount}, (_, i) => `new ${i}`);
    const file = createDiffFile({
      oldValue: ['head', 'tail'].join('\n'),
      newValue: ['head', ...added, 'tail'].join('\n'),
    });
    expect(file.hunks).toHaveLength(1);
    expect(file.hunks[0].isReplacedBlock).toBeUndefined();
    expect(file.hunks[0].newLines).toBe(lineCount + 2);
  });

  it('handles a very long text changed only at both ends', () => {
    // Every line in between is matched by the search, so the edit script
    // holds one op per line: more than a call can take as spread arguments.
    const lineCount = 150_000;
    const base = Array.from({length: lineCount}, (_, i) => `line ${i}`);
    const next = [...base];
    next[0] = 'first changed';
    next[lineCount - 1] = 'last changed';
    const file = createDiffFile({
      oldValue: base.join('\n'),
      newValue: next.join('\n'),
      contextLines: 1,
    });
    expect(file.hunks.map(h => h.header)).toEqual([
      '@@ -1,2 +1,2 @@',
      `@@ -${lineCount - 1},2 +${lineCount - 1},2 @@`,
    ]);
  });

  it('uses the default context when contextLines is NaN', () => {
    const file = createDiffFile({
      oldValue: 'a\nb\nc',
      newValue: 'a\nB\nc',
      contextLines: NaN,
    });
    expect(file.hunks.map(h => h.header)).toEqual(['@@ -1,3 +1,3 @@']);
  });

  it('marks a rename when the paths differ', () => {
    const file = createDiffFile({
      oldValue: 'a',
      newValue: 'a',
      oldPath: 'a.ts',
      newPath: 'b.ts',
    });
    expect(file.status).toBe('renamed');
  });
});
