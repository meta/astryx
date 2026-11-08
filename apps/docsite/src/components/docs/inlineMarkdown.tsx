// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file inlineMarkdown.tsx
 * @input Authored docs prose containing the inline markdown subset.
 * @output React nodes: plain text, code chips via InlineCode, and links
 *   carrying the shared prose-link treatment from proseLink.ts.
 * @position Inline renderer for /docs page prose, lists, and table cells.
 */

import {Fragment, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Code} from '@astryxdesign/core/CodeBlock';
import {InlineCode} from '../InlineCode';
import {proseLinkStyles} from '../proseLink';
import {tokenizeInline, type InlineToken} from './inlineTokens';

type LinkToken = Extract<InlineToken, {type: 'link'}>;

function renderLink(token: LinkToken): ReactNode {
  const isExternal = /^https?:\/\//.test(token.href);
  return (
    <a
      href={token.href}
      rel={isExternal ? 'noreferrer' : undefined}
      target={isExternal ? '_blank' : undefined}
      {...stylex.props(
        proseLinkStyles.underline,
        proseLinkStyles.color,
        proseLinkStyles.focusRing,
        token.isCodeLabel && proseLinkStyles.chipOffset,
      )}>
      {token.isCodeLabel ? (
        // color="inherit" keeps the link's accent color on the code span;
        // Code's default `primary` would read as body text inside the anchor.
        <Code color="inherit">{token.label}</Code>
      ) : (
        token.label
      )}
    </a>
  );
}

// Render a small inline markdown subset for authored docs: code spans, links,
// and a code span used as a whole link label ([`Name`](href)).
export function renderInlineMarkdown(text: string) {
  return tokenizeInline(text).map((token, i) => (
    <Fragment key={i}>
      {token.type === 'code' ? (
        <InlineCode>{token.value}</InlineCode>
      ) : token.type === 'link' ? (
        renderLink(token)
      ) : (
        token.value
      )}
    </Fragment>
  ));
}
