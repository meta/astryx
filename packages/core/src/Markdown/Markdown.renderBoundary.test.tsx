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
  it('renders an accepted pre-parsed destination as a link', () => {
    parsed.blocks = linkParagraph('data:image/png;base64,iVBORw0KGgo=');
    const {container} = render(<Markdown>{'ignored'}</Markdown>);
    expect(container.querySelector('a')?.getAttribute('href')).toBe(
      'data:image/png;base64,iVBORw0KGgo=',
    );
  });

  it.each([
    'javascript:alert(1)',
    'vbscript:MsgBox(1)',
    'data:text/html,<script>alert(1)</script>',
    'java\nscript:alert(1)',
  ])('renders a blocked pre-parsed destination %s as text', href => {
    parsed.blocks = linkParagraph(href);
    const {container} = render(<Markdown>{'ignored'}</Markdown>);
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('go');
  });

  it('does not hand a blocked destination to a custom link renderer', () => {
    parsed.blocks = linkParagraph('javascript:alert(1)');
    const link = vi.fn(({children}: {href: string; children?: unknown}) => (
      <a data-custom>{children as never}</a>
    ));
    render(<Markdown components={{link}}>{'ignored'}</Markdown>);
    expect(link).not.toHaveBeenCalled();
  });
});
