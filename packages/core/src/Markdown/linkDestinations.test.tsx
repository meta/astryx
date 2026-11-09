// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {render} from '@testing-library/react';
import {Markdown} from './Markdown';
import {parseMarkdownAst} from './parser';

type Json = {
  readonly type: string;
  readonly url?: string;
  readonly value?: string;
  readonly alt?: string;
  readonly children?: ReadonlyArray<Json>;
};

/** Every link and image in `markdown`: kind, destination, and text. */
function targets(markdown: string): [string, string, string][] {
  const found: [string, string, string][] = [];
  const text = (node: Json): string =>
    node.type === 'text'
      ? (node.value ?? '')
      : (node.children ?? []).map(text).join('');
  const visit = (node: Json) => {
    if (node.type === 'link') {
      found.push(['link', node.url ?? '', text(node)]);
    } else if (node.type === 'image') {
      found.push(['image', node.url ?? '', node.alt ?? '']);
    }
    (node.children ?? []).forEach(visit);
  };
  (
    parseMarkdownAst(markdown).children as unknown as ReadonlyArray<Json>
  ).forEach(visit);
  return found;
}

describe('link destinations (CommonMark 0.31 §6.3, spec:AST-061 FR7)', () => {
  it.each([
    ['[x](https://a.com/?a=1&amp;b=2)', 'https://a.com/?a=1&b=2'],
    ['[x](https://a.com/&#106;s)', 'https://a.com/js'],
    ['[x](a\\)b)', 'a)b'],
    ['[x](a\\(b)', 'a(b'],
    ['[x](https://e.com/\\(bar\\))', 'https://e.com/(bar)'],
    ['[x](https://e.com/foo(bar))', 'https://e.com/foo(bar)'],
    ['[x](https://e.com/\\&amp;)', 'https://e.com/&amp;'],
    ['[x](C:\\Users\\ada)', 'C:\\Users\\ada'],
    ['[x](https://e.com/a_b "Title &amp; more")', 'https://e.com/a_b'],
  ])('reads %j as a link to %j', (markdown, url) => {
    expect(targets(markdown)).toEqual([['link', url, 'x']]);
  });

  it('decodes reference definitions and image sources the same way', () => {
    expect(
      targets(
        '[x][r] and ![pic](b&amp;c)\n\n[r]: https://a.com/?a=1&amp;b=2\n',
      ),
    ).toEqual([
      ['link', 'https://a.com/?a=1&b=2', 'x'],
      ['image', 'b&c', 'pic'],
    ]);
  });

  it('closes link text at an unescaped bracket', () => {
    expect(targets('[a\\]b](u)')).toEqual([['link', 'u', 'a]b']]);
    expect(targets('![a\\]b](u)')).toEqual([['image', 'u', 'a]b']]);
  });
});

describe('decoded destinations stay safe', () => {
  it.each([
    '[x](&#106;avascript:alert(1))',
    '[x](&#x6A;avascript:alert(1))',
    '[x](java&#115;cript:alert(1))',
    '[x](javascript&colon;alert(1))',
    '[x](&#106;avascript&#58;alert&#40;1&#41;)',
  ])('refuses %j, whose decoded scheme is javascript:', markdown => {
    expect(targets(markdown)).toEqual([]);
    const {container} = render(<Markdown>{markdown}</Markdown>);
    expect(container.querySelector('a')).toBeNull();
  });

  it('refuses an encoded unsafe scheme in a reference definition or image', () => {
    expect(targets('[x][r]\n\n[r]: &#106;avascript:alert(1)\n')).toEqual([]);
    expect(targets('![pic](&#106;avascript:alert(1))')).toEqual([]);
  });
});

describe('a data URL with spaces before its media type stays unsafe', () => {
  const html = 'text/html;base64,PHNjcmlwdD4=';
  it.each([
    `[x](<data: ${html}>)`,
    `[x](<data:   ${html}>)`,
    `[x](<DATA: TEXT/HTML,hi>)`,
    `[x](data:&#32;${html})`,
    `[x](data:&#x20;${html})`,
    `[x](data:&#32;&#32;${html})`,
    `[x][r]\n\n[r]: <data: ${html}>\n`,
  ])('refuses the link %j', markdown => {
    expect(targets(markdown)).toEqual([]);
    const {container} = render(<Markdown>{markdown}</Markdown>);
    expect(container.querySelector('a')).toBeNull();
  });

  it.each([`![x](<data: ${html}>)`, `![x](data:&#32;${html})`])(
    'refuses the image %j',
    markdown => {
      expect(targets(markdown)).toEqual([]);
    },
  );

  it.each([`<data:&#32;${html}>`, `<data:&#x20;${html}>`])(
    'refuses the angle autolink %j',
    markdown => {
      const nodes = parseMarkdownAst(markdown, {autolink: 'gfm'})
        .children as unknown as ReadonlyArray<Json>;
      const links: string[] = [];
      const visit = (node: Json) => {
        if (node.type === 'link') {
          links.push(node.url ?? '');
        }
        (node.children ?? []).forEach(visit);
      };
      nodes.forEach(visit);
      expect(links).toEqual([]);
    },
  );
});
