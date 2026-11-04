// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Code.tsx
 * @input Uses React, StyleX, theme tokens
 * @output Exports Code component for inline code styling
 * @position Core implementation; lives in own Code/ dir, re-exported by CodeBlock/
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Code/Code.doc.mjs (consumer API and theming metadata)
 * - /docs/specs/components/Code/Code.spec.md (behavior and verification map)
 * - /packages/core/src/CodeBlock/index.ts (compatibility re-exports if types change)
 * - /packages/cli/assets/templates/blocks/components/Code/ (showcase blocks)
 * - /packages/cli/assets/templates/blocks/components/CodeBlock/ (showcase blocks)
 */

import type {ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  spacingVars,
  radiusVars,
  typographyVars,
  typeScaleVars,
} from '../theme/tokens.stylex';
import {mergeProps} from '../utils';
import type {BaseProps} from '../BaseProps';
import {themeProps} from '../utils/themeProps';

const styles = stylex.create({
  base: {
    fontFamily: typographyVars['--font-family-code'],
    fontSize: typeScaleVars['--text-code-size'],
    lineHeight: 'inherit',
    backgroundColor: colorVars['--color-background-muted'],
    paddingInline: spacingVars['--spacing-1'],
    paddingBlock: spacingVars['--spacing-0'],
    borderRadius: radiusVars['--radius-inner'],
    // Prevent code from breaking parent layout
    overflowWrap: 'break-word',
    wordBreak: 'break-word',
  },
});

const colorStyles = stylex.create({
  primary: {
    color: colorVars['--color-text-primary'],
  },
  secondary: {
    color: colorVars['--color-text-secondary'],
  },
  inherit: {
    color: 'inherit',
  },
});

const sizeStyles = stylex.create({
  // Adopt the surrounding text's font-size and line-height, for inline code
  // that should match differently-sized text around it.
  inherit: {
    fontSize: 'inherit',
    lineHeight: 'inherit',
  },
});

/** Text color for {@link Code}, mirroring the primary/secondary/inherit subset of Text. */
export type CodeColor = 'primary' | 'secondary' | 'inherit';

/** Font size for {@link Code}. `'inherit'` adopts the surrounding text size. */
export type CodeSize = 'inherit';

export interface CodeProps extends BaseProps<HTMLElement> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLElement>;
  /**
   * Text color. Mirrors the Text color subset.
   * @default 'primary'
   */
  color?: CodeColor;
  /**
   * Font size. Set to `'inherit'` to adopt the surrounding text's font-size
   * and line-height (useful for inline code inside larger/smaller text).
   */
  size?: CodeSize;
  /** Code content */
  children: ReactNode;
}

/**
 * Inline code element. Renders a styled `<code>` with monospace font,
 * muted background, and design-system-consistent sizing.
 *
 * For fenced code blocks with syntax highlighting, use `CodeBlock`.
 *
 * @example
 * ```
 * <Text type="body">
 *   Use <Code>const x = 1</Code> to declare a variable.
 * </Text>
 * ```
 */
export function Code({
  children,
  color = 'primary',
  size,
  xstyle,
  className,
  style,
  ref,
  ...props
}: CodeProps) {
  return (
    <code
      ref={ref}
      {...props}
      {...mergeProps(
        themeProps('code', {color}),
        stylex.props(
          styles.base,
          colorStyles[color],
          size && sizeStyles[size],
          xstyle,
        ),
        className,
        style,
      )}>
      {children}
    </code>
  );
}

Code.displayName = 'Code';
