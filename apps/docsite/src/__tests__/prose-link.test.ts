// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Unit tests for the shared prose-link treatment.
 *
 * Every inline link in docs prose — authored links, linkified code chips,
 * prop-description links — must carry the styles from proseLink.ts. These
 * tests pin the wiring by inspecting the element trees the renderers return;
 * the components involved are hook-free, so no DOM is needed.
 *
 * StyleX is mocked because this suite runs without the StyleX compiler:
 * create() passes raw style objects through and props() records which ones it
 * was handed. That keeps the assertions about *which* partials reach *which*
 * elements exact, which is the contract worth pinning here — the CSS itself
 * is the compiler's job.
 *
 * Run: pnpm -F @astryxdesign/docsite test
 */

import {describe, it, expect, vi} from 'vitest';
import {isValidElement, type ReactElement, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';

vi.mock('@stylexjs/stylex', async importOriginal => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    create: <T>(styles: T) => styles,
    props: (...styleList: unknown[]) => ({
      className: JSON.stringify(styleList.filter(Boolean)),
    }),
  };
});

import {Link} from '@astryxdesign/core/Link';
import {Markdown} from '@astryxdesign/core/Markdown';
import {proseLinkStyles} from '../components/proseLink';
import {InlineCode} from '../components/InlineCode';
import {MarkdownText} from '../components/MarkdownText';
import {renderInlineMarkdown} from '../components/docs/inlineMarkdown';

/**
 * Depth-first search for the first matching element. Walks props.children
 * without invoking function components, so only elements the renderer under
 * test returned directly are reachable.
 */
function findElement(
  node: ReactNode,
  match: (el: ReactElement) => boolean,
): ReactElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, match);
      if (found != null) {
        return found;
      }
    }
    return null;
  }
  if (!isValidElement(node)) {
    return null;
  }
  if (match(node)) {
    return node;
  }
  const {children} = node.props as {children?: ReactNode};
  return children == null ? null : findElement(children, match);
}

describe('linkified code chips', () => {
  it('wrap a resolvable span in Link with the shared treatment', () => {
    const el = InlineCode({children: 'astryx docs tokens'});
    expect(el.type).toBe(Link);

    const props = el.props as React.ComponentProps<typeof Link>;
    expect(props.href).toBe('/docs/tokens');
    expect(props.hasUnderline).toBe(true);
    expect(props.xstyle).toContain(proseLinkStyles.underline);
    expect(props.xstyle).toContain(proseLinkStyles.color);
    expect(props.xstyle).toContain(proseLinkStyles.chipOffset);
  });

  it('leave an unrecognized span as a plain chip', () => {
    const el = InlineCode({children: 'not a command'});
    expect(el.type).not.toBe(Link);
    expect((el.props as {children: string}).children).toBe('not a command');
  });
});

describe('authored docs links', () => {
  it('render anchors with the shared treatment', () => {
    const anchor = findElement(
      renderInlineMarkdown('see [the guide](/docs/styling)'),
      el => el.type === 'a',
    );
    expect(anchor).not.toBeNull();
    expect(anchor!.props).toMatchObject({
      href: '/docs/styling',
      ...stylex.props(
        proseLinkStyles.underline,
        proseLinkStyles.color,
        proseLinkStyles.focusRing,
      ),
    });
  });

  it('give chip-labeled links the chip underline offset', () => {
    const anchor = findElement(
      renderInlineMarkdown('use [`Table`](/components/Table)'),
      el => el.type === 'a',
    );
    expect(anchor).not.toBeNull();
    expect(anchor!.props).toMatchObject(
      stylex.props(
        proseLinkStyles.underline,
        proseLinkStyles.color,
        proseLinkStyles.focusRing,
        proseLinkStyles.chipOffset,
      ),
    );
  });
});

describe('prop-description links', () => {
  it('route through Link with the shared treatment', () => {
    const markdown = findElement(
      MarkdownText({children: 'see [theming](/docs/theme)'}),
      el => el.type === Markdown,
    );
    expect(markdown).not.toBeNull();

    const {components} = markdown!.props as {
      components: {
        link: (props: {href: string; children: ReactNode}) => ReactElement;
      };
    };
    const linkEl = components.link({href: '/docs/theme', children: 'theming'});
    expect(linkEl.type).toBe(Link);

    const props = linkEl.props as React.ComponentProps<typeof Link>;
    expect(props.href).toBe('/docs/theme');
    expect(props.hasUnderline).toBe(true);
    expect(props.xstyle).toContain(proseLinkStyles.underline);
    expect(props.xstyle).toContain(proseLinkStyles.color);
  });
});
