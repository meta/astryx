// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MarkdownText never renders a link inside a link.
 *
 * A code span that names a component links to that component's page. The same
 * span in a link label must stay a plain chip. A browser splits a link nested
 * in a link while it parses the page, and the page then fails to hydrate.
 *
 * Renders the way the static build does (server markup) and reads each
 * anchor's destination and nesting depth.
 *
 * Run: pnpm -F @astryxdesign/docsite test
 */

import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it, vi} from 'vitest';
import {MarkdownText} from '../components/MarkdownText';
import {BestPracticesBlock} from '../components/docs/BestPracticesBlock';
import {linkifyDocSections} from '../components/docs/docsLinkify';

// The docsite's own StyleX is compiled by its Babel build, not by Vitest.
vi.mock('@stylexjs/stylex', () => ({
  create: <T,>(styles: T) => styles,
  props: () => ({}),
  firstThatWorks: <T,>(...values: T[]) => values[0],
  defineMarker: () => ({}),
  defineConsts: <T,>(values: T) => values,
  defineVars: <T,>(values: T) => values,
  keyframes: () => 'keyframes',
  when: {ancestor: () => ':hover', descendant: () => ':hover'},
}));

/** Each anchor in document order: its href, and how many anchors enclose it. */
function anchors(html: string): {href: string | null; depth: number}[] {
  const found: {href: string | null; depth: number}[] = [];
  let depth = 0;
  for (const [tag] of html.matchAll(/<a\b[^>]*>|<\/a>/g)) {
    if (tag === '</a>') {
      depth -= 1;
      continue;
    }
    found.push({href: /\shref="([^"]*)"/.exec(tag)?.[1] ?? null, depth});
    depth += 1;
  }
  return found;
}

function renderText(markdown: string): string {
  return renderToStaticMarkup(<MarkdownText>{markdown}</MarkdownText>);
}

describe('MarkdownText links', () => {
  it('keep a code span in a link label as a chip inside that one link', () => {
    const html = renderText('Wrap the section in [`Card`](/components/Card).');
    expect(anchors(html)).toEqual([{href: '/components/Card', depth: 0}]);
    expect(html).toMatch(/<code\b[^>]*>Card<\/code>/);
  });

  it('keep the authored destination when the label names another page', () => {
    const html = renderText('Read [`Card`](/docs/layout) first.');
    expect(anchors(html)).toEqual([{href: '/docs/layout', depth: 0}]);
  });

  it('still link a code span outside a link label', () => {
    const html = renderText('Use `Card`. See [the guide](/docs/layout).');
    expect(anchors(html)).toEqual([
      {href: '/components/Card', depth: 0},
      {href: '/docs/layout', depth: 0},
    ]);
  });
});

describe('guidance rows on a docs page', () => {
  it('render each auto-linked component name as one link', () => {
    const [section] = linkifyDocSections(
      [
        {
          title: 'Anti-Patterns',
          content: [
            {
              type: 'list',
              style: 'dont',
              items: ['Badge as decoration. Use StatusDot for status'],
            },
          ],
        },
      ],
      ['Badge', 'StatusDot'],
    );
    const items = (section.content[0].items ?? []).map(description => ({
      guidance: false,
      description,
    }));

    const html = renderToStaticMarkup(<BestPracticesBlock items={items} />);
    expect(anchors(html)).toEqual([
      {href: '/components/Badge', depth: 0},
      {href: '/components/StatusDot', depth: 0},
    ]);
  });
});
