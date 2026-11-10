// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Markdown.renderBoundary.test.tsx
 * @input Uses vitest, @testing-library/react, Markdown with a mocked parser
 * @output Tests for the render-side navigation check in Markdown
 * @position Testing; the parser already rejects blocked destinations, so
 *   these tests bypass it and hand the renderer a pre-parsed link node.
 *   That pins the render boundary on its own: it must apply the shared
 *   navigation rule (utils/safeUrl.ts) even when a link node arrives with a
 *   destination the parser never saw.
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {cleanup, render} from '@testing-library/react';
import {Markdown} from './Markdown';
import type * as Parser from './parser';
import type {MarkdownAstBlockContent} from './ast';

const parsed: {blocks: MarkdownAstBlockContent[]} = {blocks: []};

vi.mock('./parser', async importOriginal => {
  const actual = await importOriginal<typeof Parser>();
  return {
    ...actual,
    parseMarkdownAst: () => ({type: 'root', children: parsed.blocks}),
  };
});

function linkParagraph(url: string): MarkdownAstBlockContent[] {
  return [
    {
      type: 'paragraph',
      children: [{type: 'link', url, children: [{type: 'text', value: 'go'}]}],
    },
  ];
}

afterEach(() => {
  cleanup();
});

describe('Markdown render boundary — link destinations', () => {
  it.each([
    'https://example.com/page',
    '/page',
    '#section',
    'mailto:a@example.com',
  ])('renders an accepted pre-parsed destination %s as a link', href => {
    parsed.blocks = linkParagraph(href);
    const {container} = render(<Markdown>{'ignored'}</Markdown>);
    expect(container.querySelector('a')?.getAttribute('href')).toBe(href);
  });

  it.each([
    'javascript:alert(1)',
    'vbscript:MsgBox(1)',
    'data:text/html,<script>alert(1)</script>',
    'java\nscript:alert(1)',
    'data:image/png;base64,iVBORw0KGgo=',
    'data:text/plain,hello',
    'DATA:image/png;base64,iVBORw0KGgo=',
    ' data:image/png;base64,iVBORw0KGgo=',
    'da\tta:image/png;base64,iVBORw0KGgo=',
  ])('renders a blocked pre-parsed destination %s as text', href => {
    parsed.blocks = linkParagraph(href);
    const {container} = render(<Markdown>{'ignored'}</Markdown>);
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('go');
  });

  it.each(['javascript:alert(1)', 'data:image/png;base64,iVBORw0KGgo='])(
    'does not hand the blocked destination %s to a custom link renderer',
    href => {
      parsed.blocks = linkParagraph(href);
      const link = vi.fn(({children}: {href: string; children?: unknown}) => (
        <a data-custom>{children as never}</a>
      ));
      render(<Markdown components={{link}}>{'ignored'}</Markdown>);
      expect(link).not.toHaveBeenCalled();
    },
  );
});
