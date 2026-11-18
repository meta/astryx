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

/** Fewest added plus removed lines between two texts, by dynamic programming. */
function minimalEditCount(a: string[], b: string[]): number {
  let previous = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const row = [0];
    for (let j = 1; j <= b.length; j++) {
      row[j] =
        a[i - 1] === b[j - 1]
          ? previous[j - 1] + 1
          : Math.max(previous[j], row[j - 1]);
    }
    previous = row;
  }
  return a.length + b.length - 2 * previous[b.length];
}

/** Seeded generator, so a failing case can be replayed. */
function createRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
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

  it('finds a minimal diff for many small texts', () => {
    // Few distinct lines make many ties and repeated lines.
    const random = createRandom(7);
    for (let run = 0; run < 2000; run++) {
      const alphabet = 1 + Math.floor(random() * 4);
      const text = () =>
        Array.from(
          {length: Math.floor(random() * 10)},
          () => `line ${Math.floor(random() * alphabet)}`,
        );
      const a = text();
      const b = text();
      const file = createDiffFile({
        oldValue: a.join('\n'),
        newValue: b.join('\n'),
        contextLines: 100,
      });
      const lines = file.hunks.flatMap(hunk => hunk.lines);
      const {oldSide, newSide} = sides(file);
      if (lines.length > 0) {
        expect(oldSide).toEqual(a);
        expect(newSide).toEqual(b);
      }
      expect(lines.filter(line => line.kind !== 'context')).toHaveLength(
        minimalEditCount(a, b),
      );
      // Each run of changes lists its removals before its additions.
      lines.forEach((line, i) => {
        if (line.kind === 'removed' && i > 0) {
          expect(lines[i - 1].kind).not.toBe('added');
        }
      });
    }
  });

  it('finds a minimal diff for texts with more than a thousand changes', () => {
    // Past a thousand changed lines a second, linear-space search takes over.
    const random = createRandom(11);
    for (let run = 0; run < 3; run++) {
      const text = () =>
        Array.from({length: 1200}, () => `line ${Math.floor(random() * 40)}`);
      const a = text();
      const b = text();
      const file = createDiffFile({
        oldValue: a.join('\n'),
        newValue: b.join('\n'),
        contextLines: 10_000,
      });
      const expected = minimalEditCount(a, b);
      expect(expected).toBeGreaterThan(1000);
      const {oldSide, newSide} = sides(file);
      expect(oldSide).toEqual(a);
      expect(newSide).toEqual(b);
      expect(
        file.hunks
          .flatMap(hunk => hunk.lines)
          .filter(line => line.kind !== 'context'),
      ).toHaveLength(expected);
    }
  });

  it('keeps a line diff for thousands of changes spread through a long file', () => {
    // 1,500 lines changed in place: 3,000 changed lines in a 20,000-line file.
    const base = Array.from({length: 20_000}, (_, i) => `line ${i}`);
    const next = base.map((line, i) =>
      i % 13 === 5 ? `${line} changed` : line,
    );
    const changedPairs = base.filter((_, i) => i % 13 === 5).length;
    const file = createDiffFile({
      oldValue: base.join('\n'),
      newValue: next.join('\n'),
      contextLines: 0,
    });
    expect(file.hunks.some(hunk => hunk.isReplacedBlock)).toBe(false);
    expect(file.hunks).toHaveLength(changedPairs);
    expect(file.hunks[0].header).toBe('@@ -6 +6 @@');
  });

  it('lowers the edit limit for a very long file', () => {
    // 4,000 changed lines through 150,000 lines: a line diff in a shorter
    // file, but past the work the search may spend on this one.
    const changes = (lineCount: number) => {
      const base = Array.from({length: lineCount}, (_, i) => `line ${i}`);
      const step = Math.floor(lineCount / 2000);
      const next = base.map((line, i) =>
        i % step === 1 ? `${line} changed` : line,
      );
      return createDiffFile({
        oldValue: base.join('\n'),
        newValue: next.join('\n'),
      });
    };
    expect(changes(20_000).hunks.some(hunk => hunk.isReplacedBlock)).toBe(
      false,
    );
    expect(changes(150_000).hunks[0].isReplacedBlock).toBe(true);
  });

  it('diffs up to 10,000 changed lines and replaces the block past that', () => {
    const rewrite = (lineCount: number) => {
      const oldLines = Array.from({length: lineCount}, (_, i) => `old ${i}`);
      const newLines = Array.from({length: lineCount}, (_, i) => `new ${i}`);
      return createDiffFile({
        oldValue: ['head', ...oldLines, 'tail'].join('\n'),
        newValue: ['head', ...newLines, 'tail'].join('\n'),
      });
    };
    expect(rewrite(5000).hunks[0].isReplacedBlock).toBeUndefined();
    expect(rewrite(5001).hunks[0].isReplacedBlock).toBe(true);
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
