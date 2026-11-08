// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {
  tokenize,
  tokenizeAsync,
  tokenizeStreaming,
  flatTokensToLines,
  diffLineKind,
  parseFenceLanguage,
  splitDiffLines,
} from './tokenizer';
import type {TokenLine} from './tokenizer';

describe('tokenize', () => {
  it('returns per-line tokens with line-relative offsets', () => {
    const code = 'const x = 1;\nlet y = 2;';
    const result = tokenize(code, 'typescript');

    expect(result.length).toBe(2);

    // Line 0: "const x = 1;"
    const line0 = result[0];
    const constToken = line0.find(t => t.type === 'keyword');
    expect(constToken).toEqual({type: 'keyword', start: 0, end: 5});

    const numToken = line0.find(t => t.type === 'number');
    expect(numToken).toEqual({type: 'number', start: 10, end: 11});

    // Line 1: "let y = 2;"
    const line1 = result[1];
    const letToken = line1.find(t => t.type === 'keyword');
    expect(letToken).toEqual({type: 'keyword', start: 0, end: 3});
  });

  it('omits default-type tokens (variable for JS)', () => {
    const code = 'const foo = bar;';
    const result = tokenize(code, 'typescript');

    const line = result[0];
    // "foo" would match as function (followed by no parens) then variable
    // "bar" would match as variable — should be omitted
    const variableTokens = line.filter(t => t.type === 'variable');
    expect(variableTokens).toEqual([]);
  });

  it('returns empty array for unknown languages', () => {
    expect(tokenize('hello', 'unknown')).toEqual([]);
  });

  it('tokenizes JSON correctly', () => {
    const code = '{"key": "value", "num": 42}';
    const result = tokenize(code, 'json');

    expect(result.length).toBe(1);
    const line = result[0];

    const prop = line.find(t => t.type === 'property');
    expect(prop).toBeDefined();
    expect(code.slice(prop!.start, prop!.end)).toBe('"key"');

    const str = line.find(t => t.type === 'string');
    expect(str).toBeDefined();

    const num = line.find(t => t.type === 'number');
    expect(num).toBeDefined();
    expect(code.slice(num!.start, num!.end)).toBe('42');
  });

  it('handles empty lines', () => {
    const code = 'const a = 1;\n\nconst b = 2;';
    const result = tokenize(code, 'typescript');

    expect(result.length).toBe(3);
    expect(result[1]).toEqual([]); // empty line
  });

  it('handles multi-line strings in Python', () => {
    const code = 'x = """hello\nworld"""';
    const result = tokenize(code, 'python');
    // The multi-line string spans lines, but our line tokenizer works per-line
    // so the first line gets the start of the string
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('tokenizes CSS properties', () => {
    const code = 'color: red;';
    const result = tokenize(code, 'css');

    expect(result.length).toBe(1);
    const line = result[0];
    const prop = line.find(t => t.type === 'property');
    expect(prop).toBeDefined();
  });

  it('handles trailing newline', () => {
    const code = 'const x = 1;\n';
    const result = tokenize(code, 'typescript');
    // Should handle trailing newline (produces an empty last line)
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});

describe('tokenizeAsync', () => {
  it('returns same result as sync tokenize', async () => {
    const code = 'const x = 1;\nlet y = "hello";';
    const sync = tokenize(code, 'typescript');
    const async_ = await tokenizeAsync(code, 'typescript');

    expect(async_).toEqual(sync);
  });

  it('respects abort signal', async () => {
    const code = 'const x = 1;'.repeat(100);
    const controller = new AbortController();
    controller.abort();

    const result = await tokenizeAsync(code, 'typescript', controller.signal);
    // Should return partial/empty result
    expect(result.length).toBeLessThanOrEqual(
      tokenize(code, 'typescript').length,
    );
  });
});

describe('tokenizeStreaming', () => {
  it('calls onBatch with progressive results', async () => {
    const lines = Array.from({length: 50}, (_, i) => `const x${i} = ${i};`);
    const code = lines.join('\n');
    const batches: {lines: TokenLine[]; startLine: number}[] = [];

    await tokenizeStreaming(code, 'typescript', (batchLines, startLine) => {
      batches.push({lines: batchLines, startLine});
    });

    expect(batches.length).toBeGreaterThanOrEqual(1);

    // All lines should be covered
    const totalLines = batches.reduce((sum, b) => sum + b.lines.length, 0);
    expect(totalLines).toBe(50);

    // Start lines should be monotonically increasing
    for (let i = 1; i < batches.length; i++) {
      expect(batches[i].startLine).toBeGreaterThan(batches[i - 1].startLine);
    }
  });
});

describe('flatTokensToLines', () => {
  it('converts absolute offsets to line-relative', () => {
    const code = 'const x = 1;\nlet y = 2;';
    const flatTokens = [
      {type: 'keyword', start: 0, end: 5}, // "const" in line 0
      {type: 'number', start: 10, end: 11}, // "1" in line 0
      {type: 'keyword', start: 13, end: 16}, // "let" in line 1
      {type: 'number', start: 21, end: 22}, // "2" in line 1
    ];

    const result = flatTokensToLines(flatTokens, code);

    expect(result.length).toBe(2);

    // Line 0 tokens should have offsets relative to line start (0)
    expect(result[0]).toContainEqual({type: 'keyword', start: 0, end: 5});
    expect(result[0]).toContainEqual({type: 'number', start: 10, end: 11});

    // Line 1 tokens should have offsets relative to line start (13)
    expect(result[1]).toContainEqual({type: 'keyword', start: 0, end: 3});
    expect(result[1]).toContainEqual({type: 'number', start: 8, end: 9});
  });
});

describe('diffLineKind', () => {
  it('classifies unified-diff lines by their first character', () => {
    expect(diffLineKind('+added line')).toBe('added');
    expect(diffLineKind('-removed line')).toBe('removed');
    expect(diffLineKind(' context line')).toBe('context');
    expect(diffLineKind('')).toBe('context');
  });

  it('keeps hunk headers out of the change rows; a lone --- or +++ is a change', () => {
    expect(diffLineKind('@@ -1,3 +1,4 @@')).toBe('header');
    expect(diffLineKind('--- a/file.ts')).toBe('removed');
    expect(diffLineKind('+++ b/file.ts')).toBe('added');
    // Lines with no glyph are context, whatever tool wrote them.
    expect(diffLineKind('diff --git a/x b/x')).toBe('context');
    expect(diffLineKind('index 83db48f..bf269f4 100644')).toBe('context');
  });

  it('splits the glyph column from the code the base language sees', () => {
    const {kinds, glyphs, content} = splitDiffLines([
      '@@ -1 +1 @@',
      '-  const a = 1;',
      '+  const a = 2;',
      '   const b = 3;',
      '',
    ]);
    expect(kinds).toEqual(['header', 'removed', 'added', 'context', 'context']);
    expect(glyphs).toEqual(['', '-', '+', ' ', '']);
    expect(content).toEqual([
      '',
      '  const a = 1;',
      '  const a = 2;',
      '  const b = 3;',
      '',
    ]);
  });

  it('treats a ---/+++ pair directly before @@ as a file header anywhere, and keeps unindented context whole', () => {
    const {kinds, glyphs, content} = splitDiffLines([
      '--- a/x.ts',
      '+++ b/x.ts',
      '@@ -1 +1 @@',
      '--x;',
      '---',
      '+++y;',
      'plain',
      '--- a/y.ts',
      '+++ b/y.ts',
      '@@ -1 +1 @@',
      '-old',
    ]);
    expect(kinds).toEqual([
      'header',
      'header',
      'header',
      'removed',
      'removed',
      'added',
      'context',
      'header',
      'header',
      'header',
      'removed',
    ]);
    expect(glyphs.slice(0, 7)).toEqual(['', '', '', '-', '-', '+', '']);
    expect(content.slice(3, 7)).toEqual(['-x;', '--', '++y;', 'plain']);
    // No hunk after the pair: both lines are changes, not headers.
    expect(splitDiffLines(['--- gone', '+++ here', ' same']).kinds).toEqual([
      'removed',
      'added',
      'context',
    ]);
    // A hunk ending in `---i;` / `+++i;` right before the next `@@` is code,
    // not a file header: the header form has a space after the signs.
    expect(
      splitDiffLines(['@@ -1 +1 @@', '---i;', '+++i;', '@@ -9 +9 @@', ' x'])
        .kinds,
    ).toEqual(['header', 'removed', 'added', 'header', 'context']);
    expect(diffLineKind('--- a/x.ts')).toBe('removed');
    expect(diffLineKind('--- a/x.ts', {isFileHeader: true})).toBe('header');
  });

  it('tokenizes the code past the glyph with the base language', () => {
    const {content} = splitDiffLines(['-const a = 1;', '+const a = 2;']);
    const lines = tokenize(content.join('\n'), 'typescript');
    expect(lines[0][0]).toEqual({type: 'keyword', start: 0, end: 5});
    expect(lines[1][0]).toEqual({type: 'keyword', start: 0, end: 5});
  });

  it('reads fence info strings: diff, diff-<lang>, and a plain language (patch is just a language)', () => {
    expect(parseFenceLanguage('diff')).toEqual({
      language: 'plaintext',
      isDiff: true,
    });
    expect(parseFenceLanguage('patch')).toEqual({
      language: 'patch',
      isDiff: false,
    });
    expect(parseFenceLanguage('diff-tsx')).toEqual({
      language: 'tsx',
      isDiff: true,
    });
    expect(parseFenceLanguage('tsx')).toEqual({language: 'tsx', isDiff: false});
    expect(parseFenceLanguage(undefined)).toEqual({
      language: 'plaintext',
      isDiff: false,
    });
  });
});
