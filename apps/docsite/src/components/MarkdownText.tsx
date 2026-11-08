// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file MarkdownText.tsx
 * @input Markdown-authored prose from component docs (prop descriptions,
 *   dos and don'ts, theming notes).
 * @output Text-wrapped paragraphs whose code spans run the site's linkifiers
 *   and whose links carry the shared prose-link treatment from proseLink.ts.
 * @position Prose renderer for component detail pages, over core Markdown.
 */

import type {ComponentProps, ReactNode} from 'react';
import type {StyleXStyles} from '@stylexjs/stylex';
import {Markdown} from '@astryxdesign/core/Markdown';
import type {MarkdownComponents} from '@astryxdesign/core/Markdown';
import {VStack} from '@astryxdesign/core/Layout';
import {Link} from '@astryxdesign/core/Link';
import {Text} from '@astryxdesign/core/Text';
import {InlineCode} from './InlineCode';
import {proseLinkStyles} from './proseLink';

type TextProps = ComponentProps<typeof Text>;

// Authored [label](href) links, restyled from core Markdown's plain underline
// to the docsite's prose-link treatment (proseLink.ts). External links open in
// a new tab like renderLink's do; internal ones keep router navigation through
// core Link's useLinkComponent.
function MarkdownLink({href, children}: {href: string; children: ReactNode}) {
  const isExternal = /^https?:\/\//.test(href);
  return (
    <Link
      href={href}
      type="inherit"
      hasUnderline
      target={isExternal ? '_blank' : undefined}
      rel={isExternal ? 'noreferrer' : undefined}
      xstyle={
        // Cast because the partials guard their hover states behind
        // @media (hover: hover), a nesting StyleXStyles cannot express.
        [
          proseLinkStyles.underline,
          proseLinkStyles.color,
        ] as unknown as StyleXStyles
      }>
      {children}
    </Link>
  );
}

// Component-page prose (prop descriptions, dos and don'ts, theming notes)
// cites doc topics the same way /docs prose does, e.g. "Icon name — see
// `astryx docs icons`". Route those spans through the same linkifiers, and
// links through the same treatment.
const MARKDOWN_COMPONENTS: MarkdownComponents = {
  inlineCode: InlineCode,
  link: MarkdownLink,
};

interface MarkdownTextProps {
  children: string;
  type?: TextProps['type'];
  color?: TextProps['color'];
  weight?: TextProps['weight'];
  style?: TextProps['style'];
}

export function MarkdownText({
  children,
  type = 'body',
  color,
  weight,
  style,
}: MarkdownTextProps) {
  const paragraphs = splitMarkdownParagraphs(children);

  if (paragraphs.length === 0) {
    return null;
  }

  if (paragraphs.length === 1) {
    return (
      <Text
        as="p"
        type={type}
        color={color}
        weight={weight}
        display="block"
        style={style}>
        <Markdown display="inline" components={MARKDOWN_COMPONENTS}>
          {paragraphs[0]}
        </Markdown>
      </Text>
    );
  }

  return (
    <VStack gap={2} style={style}>
      {paragraphs.map((paragraph, index) => (
        <Text
          key={index}
          as="p"
          type={type}
          color={color}
          weight={weight}
          display="block">
          <Markdown display="inline" components={MARKDOWN_COMPONENTS}>
            {paragraph}
          </Markdown>
        </Text>
      ))}
    </VStack>
  );
}

function splitMarkdownParagraphs(markdown: string): string[] {
  return markdown
    .trim()
    .split(/\n{2,}/)
    .map(block => block.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
}
