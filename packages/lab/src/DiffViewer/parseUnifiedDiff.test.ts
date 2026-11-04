// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {parseUnifiedDiff} from './parseUnifiedDiff';

const GIT_PATCH = `diff --git a/src/math.ts b/src/math.ts
index 3b18e51..a9c2f7d 100644
--- a/src/math.ts
+++ b/src/math.ts
@@ -1,5 +1,6 @@
 export function add(a: number, b: number) {
-  return a + b;
+  const sum = a + b;
+  return sum;
 }
 
 export const ZERO = 0;
@@ -10,3 +11,3 @@ export function sub(a: number, b: number) {
 // trailing
-const old = 1;
+const next = 1;
 // end
diff --git a/README.md b/README.md
new file mode 100644
index 0000000..e69de29
--- /dev/null
+++ b/README.md
@@ -0,0 +1,2 @@
+# Title
+Body
diff --git a/old/name.ts b/new/name.ts
similarity index 100%
rename from old/name.ts
rename to new/name.ts
diff --git a/logo.png b/logo.png
index 1111111..2222222 100644
Binary files a/logo.png and b/logo.png differ
diff --git a/gone.txt b/gone.txt
deleted file mode 100644
index e69de29..0000000
--- a/gone.txt
+++ /dev/null
@@ -1 +0,0 @@
-bye
`;

describe('parseUnifiedDiff', () => {
  it('splits a git patch into one file per diff header', () => {
    const files = parseUnifiedDiff(GIT_PATCH);
    expect(files.map(f => f.status)).toEqual([
      'modified',
      'added',
      'renamed',
      'modified',
      'deleted',
    ]);
  });

  it('numbers lines from the hunk header on each side', () => {
    const [math] = parseUnifiedDiff(GIT_PATCH);
    expect(math.oldPath).toBe('src/math.ts');
    expect(math.newPath).toBe('src/math.ts');
    expect(math.hunks).toHaveLength(2);
    const [first, second] = math.hunks;
    expect(first.header).toBe('@@ -1,5 +1,6 @@');
    expect(
      first.lines.map(l => [l.kind, l.oldLineNumber, l.newLineNumber]),
    ).toEqual([
      ['context', 1, 1],
      ['removed', 2, null],
      ['added', null, 2],
      ['added', null, 3],
      ['context', 3, 4],
      ['context', 4, 5],
      ['context', 5, 6],
    ]);
    expect(first.lines[1].content).toBe('  return a + b;');
    // An empty context line keeps an empty content string.
    expect(first.lines[5].content).toBe('');
    expect(second.header).toBe(
      '@@ -10,3 +11,3 @@ export function sub(a: number, b: number) {',
    );
    expect(second.lines[1]).toEqual({
      kind: 'removed',
      content: 'const old = 1;',
      oldLineNumber: 11,
      newLineNumber: null,
    });
  });

  it('reads added, renamed, binary, and deleted files', () => {
    const [, added, renamed, binary, deleted] = parseUnifiedDiff(GIT_PATCH);
    expect(added).toMatchObject({oldPath: null, newPath: 'README.md'});
    expect(added.hunks[0].lines.map(l => l.newLineNumber)).toEqual([1, 2]);

    expect(renamed).toMatchObject({
      oldPath: 'old/name.ts',
      newPath: 'new/name.ts',
      hunks: [],
    });

    expect(binary).toMatchObject({isBinary: true, hunks: []});

    expect(deleted).toMatchObject({oldPath: 'gone.txt', newPath: null});
    expect(deleted.hunks[0].lines).toEqual([
      {kind: 'removed', content: 'bye', oldLineNumber: 1, newLineNumber: null},
    ]);
  });

  it('reads classic diff -u output with timestamps', () => {
    const files = parseUnifiedDiff(
      [
        '--- a.txt\t2024-01-01 00:00:00.000000000 +0000',
        '+++ b.txt\t2024-01-02 00:00:00.000000000 +0000',
        '@@ -1 +1 @@',
        '-one',
        '+uno',
      ].join('\n'),
    );
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({
      oldPath: 'a.txt',
      newPath: 'b.txt',
      status: 'modified',
    });
  });

  it('marks a file renamed only from git rename lines', () => {
    const files = parseUnifiedDiff(
      [
        // diff -ruN between two trees: an edit and an -N creation.
        'diff -ruN old/app.ini new/app.ini',
        '--- old/app.ini\t2024-01-01 00:00:00.000000000 +0000',
        '+++ new/app.ini\t2024-01-02 00:00:00.000000000 +0000',
        '@@ -1 +1 @@',
        '-debug=false',
        '+debug=true',
        'diff -ruN old/extra.ini new/extra.ini',
        '--- old/extra.ini\t1970-01-01 00:00:00.000000000 +0000',
        '+++ new/extra.ini\t2024-01-02 00:00:00.000000000 +0000',
        '@@ -0,0 +1 @@',
        '+level=2',
        // git diff --no-index between two unrelated files.
        'diff --git a/before.txt b/after.txt',
        'index 1111111..2222222 100644',
        '--- a/before.txt',
        '+++ b/after.txt',
        '@@ -1 +1 @@',
        '-x',
        '+y',
      ].join('\n'),
    );
    expect(
      files.map(file => [file.oldPath, file.newPath, file.status]),
    ).toEqual([
      ['old/app.ini', 'new/app.ini', 'modified'],
      ['old/extra.ini', 'new/extra.ini', 'modified'],
      ['before.txt', 'after.txt', 'modified'],
    ]);
  });

  it.each([
    ['no closing differ', `Binary files ${'a and '.repeat(33_000)}tail`],
    ['a CR before differ', `Binary files ${'a and '.repeat(33_000)}\r differ`],
    [
      'a U+2028 before differ',
      `Binary files ${'a and '.repeat(33_000)}\u2028 differ`,
    ],
  ])(
    'parses a long crafted binary-looking line with %s in linear time',
    (_, crafted) => {
      // A commit-message line in `git format-patch` output, before any diff.
      // A backtracking pattern takes seconds on lines like these.
      const start = performance.now();
      const files = parseUnifiedDiff(
        [
          'Subject: [PATCH] update x',
          '',
          crafted,
          '---',
          'diff --git a/x.ts b/x.ts',
          '--- a/x.ts',
          '+++ b/x.ts',
          '@@ -1 +1 @@',
          '-a',
          '+b',
        ].join('\n'),
      );
      expect(performance.now() - start).toBeLessThan(500);
      // A line that ends in ` differ` has the binary-line shape, so it may
      // read as a binary entry of its own; the real file is unaffected.
      expect(files.at(-1)).toMatchObject({
        newPath: 'x.ts',
        isBinary: false,
      });
      expect(files.at(-1)?.hunks).toHaveLength(1);
    },
  );

  it('reads copies from their copy lines, paths with spaces included', () => {
    // An exact copy has no ---/+++ lines, so only the copy lines name it.
    const files = parseUnifiedDiff(
      [
        'diff --git a/my file.ts b/my copy.ts',
        'similarity index 100%',
        'copy from my file.ts',
        'copy to my copy.ts',
        'diff --git a/notes.txt "b/caf\\303\\251 notes.txt"',
        'similarity index 100%',
        'copy from notes.txt',
        'copy to "caf\\303\\251 notes.txt"',
      ].join('\n'),
    );
    expect(
      files.map(file => [file.oldPath, file.newPath, file.status]),
    ).toEqual([
      ['my file.ts', 'my copy.ts', 'modified'],
      ['notes.txt', 'café notes.txt', 'modified'],
    ]);
  });

  it('reads a headerless binary line from diff -r as a file of its own', () => {
    const files = parseUnifiedDiff(
      [
        'Binary files old/first.png and new/first.png differ',
        'diff -ruN old/a.txt new/a.txt',
        '--- old/a.txt\t2024-01-01 00:00:00.000000000 +0000',
        '+++ new/a.txt\t2024-01-02 00:00:00.000000000 +0000',
        '@@ -1 +1 @@',
        '-one',
        '+uno',
        'Binary files old/x.png and new/x.png differ',
        'Binary files /dev/null and new/y.png differ',
        'diff -ruN old/z.txt new/z.txt',
        '--- old/z.txt\t2024-01-01 00:00:00.000000000 +0000',
        '+++ new/z.txt\t2024-01-02 00:00:00.000000000 +0000',
        '@@ -1 +1 @@',
        '-two',
        '+dos',
      ].join('\n'),
    );
    expect(
      files.map(file => [
        file.oldPath,
        file.newPath,
        file.status,
        file.isBinary,
        file.hunks.length,
      ]),
    ).toEqual([
      ['old/first.png', 'new/first.png', 'modified', true, 0],
      ['old/a.txt', 'new/a.txt', 'modified', false, 1],
      ['old/x.png', 'new/x.png', 'modified', true, 0],
      [null, 'new/y.png', 'added', true, 0],
      ['old/z.txt', 'new/z.txt', 'modified', false, 1],
    ]);
  });

  it('starts a new file at each ---/+++ pair after a hunk', () => {
    const files = parseUnifiedDiff(
      [
        '--- a/x.ts',
        '+++ b/x.ts',
        '@@ -1 +1 @@',
        '-a',
        '+b',
        '--- a/y.ts',
        '+++ b/y.ts',
        '@@ -1 +1 @@',
        '-c',
        '+d',
      ].join('\n'),
    );
    expect(files.map(f => f.newPath)).toEqual(['x.ts', 'y.ts']);
  });

  it('keeps a removed line that starts with -- inside a hunk', () => {
    const [file] = parseUnifiedDiff(
      ['@@ -1,2 +1 @@', '--- a comment', '+++ b', '-x', ''].join('\n'),
    );
    expect(file.hunks[0].lines.map(l => [l.kind, l.content])).toEqual([
      ['removed', '-- a comment'],
      ['added', '++ b'],
      ['removed', 'x'],
    ]);
  });

  it('reads a bare hunk with no file header', () => {
    const [file] = parseUnifiedDiff('@@ -3,2 +3,2 @@\n a\n-b\n+c\n');
    expect(file).toMatchObject({
      oldPath: null,
      newPath: null,
      status: 'modified',
    });
    expect(file.hunks[0].lines).toHaveLength(3);
  });

  it('skips "No newline at end of file" markers', () => {
    const [file] = parseUnifiedDiff(
      '@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+b\n\\ No newline at end of file\n',
    );
    expect(file.hunks[0].lines.map(l => l.kind)).toEqual(['removed', 'added']);
  });

  it('accepts CRLF line endings', () => {
    const [file] = parseUnifiedDiff('@@ -1 +1 @@\r\n-a\r\n+b\r\n');
    expect(file.hunks[0].lines.map(l => l.content)).toEqual(['a', 'b']);
  });

  it('reads a path with spaces from the git header when no other line names it', () => {
    const files = parseUnifiedDiff(
      [
        'diff --git a/assets/my logo.png b/assets/my logo.png',
        'index 1111111..2222222 100644',
        'Binary files a/assets/my logo.png and b/assets/my logo.png differ',
        'diff --git a/scripts/run me.sh b/scripts/run me.sh',
        'old mode 100644',
        'new mode 100755',
        'diff --git a/no space.txt b/no space.txt',
        'deleted file mode 100644',
        'index e69de29..0000000',
      ].join('\n'),
    );
    expect(files).toEqual([
      {
        oldPath: 'assets/my logo.png',
        newPath: 'assets/my logo.png',
        status: 'modified',
        isBinary: true,
        hunks: [],
      },
      {
        oldPath: 'scripts/run me.sh',
        newPath: 'scripts/run me.sh',
        status: 'modified',
        isBinary: false,
        hunks: [],
      },
      {
        oldPath: 'no space.txt',
        newPath: null,
        status: 'deleted',
        isBinary: false,
        hunks: [],
      },
    ]);
  });

  it('takes a renamed path with spaces from its rename lines', () => {
    const [file] = parseUnifiedDiff(
      [
        'diff --git a/old name.ts b/new name.ts',
        'similarity index 100%',
        'rename from old name.ts',
        'rename to new name.ts',
      ].join('\n'),
    );
    expect(file).toMatchObject({
      oldPath: 'old name.ts',
      newPath: 'new name.ts',
      status: 'renamed',
    });
  });

  it('decodes git-quoted paths with non-ASCII and escaped characters', () => {
    const files = parseUnifiedDiff(
      [
        'diff --git "a/docs/caf\\303\\251.md" "b/docs/caf\\303\\251.md"',
        'index 1111111..2222222 100644',
        '--- "a/docs/caf\\303\\251.md"',
        '+++ "b/docs/caf\\303\\251.md"',
        '@@ -1 +1 @@',
        '-old',
        '+new',
        'diff --git "a/img/\\346\\227\\245 \\"one\\".png" "b/img/\\346\\227\\245 \\"one\\".png"',
        'Binary files "a/img/\\346\\227\\245 \\"one\\".png" and "b/img/\\346\\227\\245 \\"one\\".png" differ',
        'diff --git a/notes.txt "b/caf\\303\\251 notes.txt"',
        'similarity index 100%',
        'rename from notes.txt',
        'rename to "caf\\303\\251 notes.txt"',
      ].join('\n'),
    );
    expect(
      files.map(file => [file.oldPath, file.newPath, file.status]),
    ).toEqual([
      ['docs/café.md', 'docs/café.md', 'modified'],
      ['img/日 "one".png', 'img/日 "one".png', 'modified'],
      ['notes.txt', 'café notes.txt', 'renamed'],
    ]);
    expect(files[1].isBinary).toBe(true);
  });

  it('returns no files for text that is not a diff', () => {
    expect(parseUnifiedDiff('')).toEqual([]);
    expect(parseUnifiedDiff('hello\nworld')).toEqual([]);
  });
});
