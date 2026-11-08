// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file InlineCode.tsx
 * @input The text content of an inline code span.
 * @output A `Code` chip, or a link-wrapped chip when a linkifier recognizes
 *   the span as a reference to a page this site serves.
 * @position Renders every inline code span on the docs site — /docs pages go
 *   through inlineMarkdown.tsx, component pages through MarkdownText.tsx's
 *   `inlineCode` override.
 *
 * Spans no linkifier claims — every other backticked prop name, token, and
 * snippet — render as an ordinary code chip.
 */

import type {StyleXStyles} from '@stylexjs/stylex';
import {Code} from '@astryxdesign/core/CodeBlock';
import {Link} from '@astryxdesign/core/Link';
import {linkifyCode} from './codeLinkifiers';
import {proseLinkStyles} from './proseLink';

export function InlineCode({children}: {children: string}) {
  const href = linkifyCode(children);
  if (href == null) {
    return <Code>{children}</Code>;
  }

  // Linked chips carry the standard prose-link treatment (proseLink.ts): an
  // accent underline at rest, matching the chip-labeled links renderLink
  // already draws for bare component names. The anchor's color paints the
  // underline while Code keeps its own text color, so the chip itself is
  // unchanged. `type="inherit"` keeps the surrounding text's metrics.
  return (
    <Link
      href={href}
      type="inherit"
      hasUnderline
      xstyle={
        // Cast because the partials guard their hover states behind
        // @media (hover: hover), a nesting StyleXStyles cannot express.
        [
          proseLinkStyles.underline,
          proseLinkStyles.color,
          proseLinkStyles.chipOffset,
        ] as unknown as StyleXStyles
      }>
      <Code>{children}</Code>
    </Link>
  );
}
