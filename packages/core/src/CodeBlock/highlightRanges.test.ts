// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {applyHighlightRangesChunked} from './highlightRanges';
import type {TokenLine} from './tokenizer';

// Mock CSS Highlight API. `escape` is real behavior, not a mock: the code
// under test escapes generated names with it, so jsdom's implementation is
// carried over when the CSS global is replaced.
class MockHighlight extends Set<Range> {}
const mockHighlightsMap = new Map<string, MockHighlight>();
const realCssEscape = globalThis.CSS.escape;

beforeEach(() => {
  mockHighlightsMap.clear();

  globalThis.CSS = {
    escape: realCssEscape,
    highlights: {
      get: (name: string) => mockHighlightsMap.get(name),
      set: (name: string, h: MockHighlight) => mockHighlightsMap.set(name, h),
    } as unknown as HighlightRegistry,
  } as typeof CSS;

  // @ts-expect-error - mocking global Highlight
  globalThis.Highlight = MockHighlight;

  // Mock requestAnimationFrame
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
    fn(0);
    return 0;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function createCodeElement(lines: string[]): HTMLElement {
  const code = document.createElement('code');
  for (let i = 0; i < lines.length; i++) {
    const div = document.createElement('div');
    div.setAttribute('data-line', String(i + 1));
    div.textContent = lines[i] || '\u200b';
    code.appendChild(div);
  }
  return code;
}

/**
 * The dynamic stylesheet is module-level state shared by every test in this
 * file, so each test drives unique token types and looks its rules up by the
 * escaped name rather than by position.
 */
function dynamicRules(): CSSStyleRule[] {
  const dynamicSheet = document.querySelector<HTMLStyleElement>(
    'style[data-astryx-highlight-dynamic]',
  );
  return Array.from(dynamicSheet?.sheet?.cssRules ?? []) as CSSStyleRule[];
}

/**
 * Exactly the two highlight selectors and nothing else: an escaped ident may
 * contain any character, but only behind a backslash, so an unescaped `)`
 * that closed the function early (and the `, body` after it) cannot match.
 */
const HIGHLIGHT_ONLY_SELECTOR =
  /^\.astryx-code-block code::highlight\((?:[^()\\]|\\.)+\), \.astryx-codeeditor code::highlight\((?:[^()\\]|\\.)+\)$/;

function highlightRule(name: string): string {
  return `.astryx-code-block code::highlight(${name}), .astryx-codeeditor code::highlight(${name})`;
}

describe('applyHighlightRangesChunked', () => {
  it('creates ranges for tokens on each line', () => {
    const codeEl = createCodeElement(['const x = 1;', 'let y = 2;']);
    const tokenLines: TokenLine[] = [
      [{type: 'keyword', start: 0, end: 5}], // "const"
      [{type: 'keyword', start: 0, end: 3}], // "let"
    ];

    // Need to inject the style element mock
    const mockStyle = document.createElement('style');
    mockStyle.setAttribute('data-astryx-highlight-styles', '');
    document.head.appendChild(mockStyle);

    const cleanup = applyHighlightRangesChunked(codeEl, tokenLines);

    const kwHighlight = mockHighlightsMap.get('astryx-keyword');
    expect(kwHighlight).toBeDefined();
    expect(kwHighlight!.size).toBe(2);

    cleanup();
    expect(kwHighlight!.size).toBe(0);
  });

  it('keeps every parser-accepted tokenizer type coloured under its raw name', () => {
    // The dotted type that crashed the block, plus names a narrow allowlist
    // would wrongly reject even though the CSS parser accepts them all.
    const types = ['keyword.control.sql', '_private', 'キーワード', '9start'];
    const codeEl = createCodeElement(types.map(() => 'line'));
    const tokenLines: TokenLine[] = types.map(type => [
      {type, start: 0, end: 4},
    ]);

    const mockStyle = document.createElement('style');
    mockStyle.setAttribute('data-astryx-highlight-styles', '');
    document.head.appendChild(mockStyle);
    const insertRule = vi.spyOn(CSSStyleSheet.prototype, 'insertRule');

    const cleanup = applyHighlightRangesChunked(codeEl, tokenLines);

    // Ranges register under the RAW names: a ::highlight() selector matches
    // by ident value, so the escaped rule below still paints them.
    for (const type of types) {
      expect(mockHighlightsMap.get(`astryx-${type}`)?.size).toBe(1);
    }

    // One rule per type, with only the characters that need it escaped.
    expect(insertRule.mock.calls.map(([rule]) => rule)).toEqual([
      `${highlightRule('astryx-keyword\\.control\\.sql')} { color: var(--color-syntax-keyword\\.control\\.sql, currentColor); }`,
      `${highlightRule('astryx-_private')} { color: var(--color-syntax-_private, currentColor); }`,
      `${highlightRule('astryx-キーワード')} { color: var(--color-syntax-キーワード, currentColor); }`,
      `${highlightRule('astryx-9start')} { color: var(--color-syntax-9start, currentColor); }`,
    ]);

    cleanup();
  });

  it('escapes the highlight name so a token type cannot leave its ::highlight() selector', () => {
    // Unescaped, this type closes ::highlight() early and the CSS parser
    // accepts what follows as a valid second selector plus a declaration
    // block, with the trailing comment opener swallowing the rest of the
    // generated rule text. The result is a rule that styles <body>.
    const type = 'sel), body { background: red } /*';
    const escapedName =
      'astryx-sel\\)\\,\\ body\\ \\{\\ background\\:\\ red\\ \\}\\ \\/\\*';
    const codeEl = createCodeElement(['line']);
    const tokenLines: TokenLine[] = [[{type, start: 0, end: 4}]];

    const mockStyle = document.createElement('style');
    mockStyle.setAttribute('data-astryx-highlight-styles', '');
    document.head.appendChild(mockStyle);
    const insertRule = vi.spyOn(CSSStyleSheet.prototype, 'insertRule');

    const cleanup = applyHighlightRangesChunked(codeEl, tokenLines);

    expect(mockHighlightsMap.get(`astryx-${type}`)?.size).toBe(1);

    // The exact rule text handed to the engine: both generated names fully
    // escaped, one colour declaration, nothing of the payload's making.
    expect(insertRule).toHaveBeenCalledTimes(1);
    expect(insertRule).toHaveBeenCalledWith(
      `${highlightRule(escapedName)} { color: var(--color-syntax-sel\\)\\,\\ body\\ \\{\\ background\\:\\ red\\ \\}\\ \\/\\*, currentColor); }`,
    );

    // And as parsed: the rule for this type keeps the payload inside the
    // ident, and no rule in the sheet has any selector beyond the two
    // highlight selectors.
    const rules = dynamicRules();
    const rule = rules.find(r => r.selectorText.includes('astryx-sel'));
    expect(rule?.selectorText).toBe(highlightRule(escapedName));
    for (const r of rules) {
      expect(r.selectorText).toMatch(HIGHLIGHT_ONLY_SELECTOR);
    }

    cleanup();
  });

  it('escapes the custom property so a token type cannot add declarations', () => {
    // Unescaped, this type closes var() early and the CSS parser accepts
    // what follows as two more valid declarations.
    const type = 'p); background: red; --x: var(--y';
    const escapedName =
      'astryx-p\\)\\;\\ background\\:\\ red\\;\\ --x\\:\\ var\\(--y';
    const escapedColor =
      'var(--color-syntax-p\\)\\;\\ background\\:\\ red\\;\\ --x\\:\\ var\\(--y, currentColor)';
    const codeEl = createCodeElement(['line']);
    const tokenLines: TokenLine[] = [[{type, start: 0, end: 4}]];

    const mockStyle = document.createElement('style');
    mockStyle.setAttribute('data-astryx-highlight-styles', '');
    document.head.appendChild(mockStyle);
    const insertRule = vi.spyOn(CSSStyleSheet.prototype, 'insertRule');

    const cleanup = applyHighlightRangesChunked(codeEl, tokenLines);

    expect(mockHighlightsMap.get(`astryx-${type}`)?.size).toBe(1);

    expect(insertRule).toHaveBeenCalledTimes(1);
    expect(insertRule).toHaveBeenCalledWith(
      `${highlightRule(escapedName)} { color: ${escapedColor}; }`,
    );

    // As parsed: exactly one declaration, `color`, whose value is the
    // escaped custom property with its fallback.
    const rule = dynamicRules().find(r => r.selectorText.includes('astryx-p'));
    expect(rule).toBeDefined();
    expect(rule!.selectorText).toBe(highlightRule(escapedName));
    const declared = Array.from({length: rule!.style.length}, (_, i) =>
      rule!.style.item(i),
    );
    expect(declared).toEqual(['color']);
    expect(rule!.style.getPropertyValue('color')).toBe(escapedColor);
    expect(rule!.style.getPropertyValue('background')).toBe('');
    expect(rule!.style.getPropertyValue('--x')).toBe('');

    cleanup();
  });

  it('handles empty token lines', () => {
    const codeEl = createCodeElement(['', 'const x = 1;']);
    const tokenLines: TokenLine[] = [[], [{type: 'keyword', start: 0, end: 5}]];

    const mockStyle = document.createElement('style');
    mockStyle.setAttribute('data-astryx-highlight-styles', '');
    document.head.appendChild(mockStyle);

    const cleanup = applyHighlightRangesChunked(codeEl, tokenLines);

    const kwHighlight = mockHighlightsMap.get('astryx-keyword');
    expect(kwHighlight).toBeDefined();
    expect(kwHighlight!.size).toBe(1);

    cleanup();
  });

  it('returns cleanup that removes all ranges', () => {
    const codeEl = createCodeElement(['const x = 1;']);
    const tokenLines: TokenLine[] = [
      [
        {type: 'keyword', start: 0, end: 5},
        {type: 'number', start: 10, end: 11},
      ],
    ];

    const mockStyle = document.createElement('style');
    mockStyle.setAttribute('data-astryx-highlight-styles', '');
    document.head.appendChild(mockStyle);

    const cleanup = applyHighlightRangesChunked(codeEl, tokenLines);

    const kwHighlight = mockHighlightsMap.get('astryx-keyword');
    const numHighlight = mockHighlightsMap.get('astryx-number');
    expect(kwHighlight!.size).toBe(1);
    expect(numHighlight!.size).toBe(1);

    cleanup();
    expect(kwHighlight!.size).toBe(0);
    expect(numHighlight!.size).toBe(0);
  });
});
