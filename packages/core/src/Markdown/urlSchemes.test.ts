// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The parser's URL scheme check for links and images.
 * @input Markdown with link and image destinations in every syntax form
 * @output Which destinations the public parser APIs keep as links or images
 * @position Parser-level regression tests for Markdown's shared URL rule
 */

import {describe, expect, it} from 'vitest';
import {
  createIncrementalState,
  parseInline,
  parseMarkdown,
  parseMarkdownIncremental,
} from './parser';

/** Every link and image URL anywhere in a parser result. */
function urlsIn(result: unknown): string[] {
  const found: string[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value == null || typeof value !== 'object') {
      return;
    }
    const node = value as Record<string, unknown>;
    if (node.type === 'link' || node.type === 'image') {
      const url = node.href ?? node.src ?? node.url;
      found.push(String(url));
    }
    Object.values(node).forEach(visit);
  };
  visit(result);
  return found;
}

/**
 * Kept URLs whose scheme is unsafe once control characters and outer
 * whitespace are removed and case is ignored, as a browser reads the scheme.
 * A destination the syntax splits into a harmless fragment is not one.
 */
function unsafeUrlsIn(result: unknown): string[] {
  return urlsIn(result).filter(url =>
    /^(?:javascript|vbscript|data):/i.test(
      // eslint-disable-next-line no-control-regex -- controls are the case under test
      url.replace(/[\x00-\x1f\x7f]/g, '').trim(),
    ),
  );
}

/** Each way a destination reaches the parser, as link and as image. */
const FORMS: ReadonlyArray<[string, (url: string) => string]> = [
  ['inline link', url => `[x](<${url}>)`],
  ['inline image', url => `![x](<${url}>)`],
  ['reference link', url => `[x][r]\n\n[r]: <${url}>\n`],
  ['reference image', url => `![x][r]\n\n[r]: <${url}>\n`],
  ['standalone image', url => `![x](<${url}>)\n`],
];

/** The public parser entry points, each returning everything it parsed. */
const PARSERS: ReadonlyArray<[string, (markdown: string) => unknown]> = [
  ['parseMarkdown', markdown => parseMarkdown(markdown)],
  [
    'parseMarkdownIncremental',
    markdown => {
      const state = createIncrementalState();
      for (let end = 1; end < markdown.length; end++) {
        parseMarkdownIncremental(markdown.slice(0, end), state);
      }
      return parseMarkdownIncremental(markdown, state);
    },
  ],
];

const REJECTED = [
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  'vbscript:MsgBox(1)',
  'data:image/png;base64,iVBORw0KGgo=',
  'data:image/svg+xml,%3Csvg%3E%3C/svg%3E',
  'data:image/gif;base64,R0lGODlh',
  'data:text/plain,hello',
  'data:text/html,hello',
  'data:text/html;base64,PGI+eDwvYj4=',
  'data:,hello',
  'DATA:image/png;base64,iVBORw0KGgo=',
  'Data:Image/Png;base64,iVBORw0KGgo=',
  ' data:image/png;base64,iVBORw0KGgo=',
  'da\tta:image/png;base64,iVBORw0KGgo=',
  'da\nta:image/png;base64,iVBORw0KGgo=',
  'da\u0000ta:image/png;base64,iVBORw0KGgo=',
  'java\tscript:alert(1)',
  'java\u0000script:alert(1)',
  '&#100;ata:image/png;base64,iVBORw0KGgo=',
  'd&#x61;ta:image/png;base64,iVBORw0KGgo=',
  'jav&#x61;script:alert(1)',
  '&#106;avascript:alert(1)',
  'data&colon;image/png;base64,iVBORw0KGgo=',
];

const KEPT = [
  'https://example.com/a.png',
  'http://example.com',
  '/images/a.png',
  'images/a.png',
  '#section',
  'mailto:a@example.com',
  'tel:+15555550100',
];

describe('the parser rejects unsafe URL schemes in links and images', () => {
  describe.each(PARSERS)('%s', (_name, parse) => {
    describe.each(FORMS)('%s', (_form, markdownFor) => {
      it.each(REJECTED)('keeps no link or image for %j', url => {
        expect(unsafeUrlsIn(parse(markdownFor(url)))).toEqual([]);
      });

      it.each(KEPT)('keeps %j', url => {
        expect(urlsIn(parse(markdownFor(url)))).toEqual([url]);
      });
    });
  });

  describe('parseInline', () => {
    it.each(REJECTED)('keeps no link or image for %j', url => {
      expect(unsafeUrlsIn(parseInline(`[x](<${url}>)`))).toEqual([]);
      expect(unsafeUrlsIn(parseInline(`![x](<${url}>)`))).toEqual([]);
    });

    it('keeps the source as text for a rejected link or image', () => {
      const link = '[x](data:image/png;base64,iVBORw0KGgo=)';
      const image = '![x](data:image/png;base64,iVBORw0KGgo=)';
      expect(parseInline(link)).toEqual([{type: 'text', content: link}]);
      expect(parseInline(image)).toEqual([{type: 'text', content: image}]);
    });

    it.each(KEPT)('keeps %j', url => {
      expect(urlsIn(parseInline(`[x](<${url}>)`))).toEqual([url]);
    });
  });

  it.each(['< >', '&#9;', '<&#10;>', '&#32;'])(
    'gives a blank destination %j an empty URL',
    destination => {
      expect(urlsIn(parseMarkdown(`[x](${destination})`))).toEqual(['']);
      expect(urlsIn(parseMarkdown(`![x](${destination})\n`))).toEqual(['']);
      expect(urlsIn(parseInline(`![x](${destination})`))).toEqual(['']);
    },
  );

  it('stores a padded destination in its normalized form', () => {
    expect(urlsIn(parseMarkdown('[x](< https://example.com/x >)'))).toEqual([
      'https://example.com/x',
    ]);
    expect(urlsIn(parseMarkdown('[x][r]\n\n[r]: < /docs >\n'))).toEqual([
      '/docs',
    ]);
    expect(urlsIn(parseMarkdown('![x](< /a.png >)\n'))).toEqual(['/a.png']);
    expect(urlsIn(parseInline('![x](< /a.png >)'))).toEqual(['/a.png']);
  });

  describe('GFM autolinks', () => {
    const gfm = {autolink: 'gfm'} as const;

    it.each([
      'data:image/png;base64,iVBORw0KGgo=',
      'data:text/plain,hello',
      'DATA:image/png;base64,iVBORw0KGgo=',
      'javascript:alert(1)',
    ])('keeps no link for the angle-bracket autolink <%s>', url => {
      expect(urlsIn(parseMarkdown(`see <${url}> here`, gfm))).toEqual([]);
      expect(urlsIn(parseInline(`see <${url}> here`, gfm))).toEqual([]);
    });

    it('stores a bare URL with a control character in its normalized form', () => {
      expect(
        urlsIn(parseMarkdown('see https://exa\u0001mple.com/x here', gfm)),
      ).toEqual(['https://example.com/x']);
    });

    it('keeps a safe angle-bracket autolink', () => {
      expect(
        urlsIn(parseMarkdown('see <https://example.com/x> here', gfm)),
      ).toEqual(['https://example.com/x']);
    });
  });
});
