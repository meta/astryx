// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Citation.tsx
 * @input Uses React, StyleX, theme tokens, and the shared navigation policy
 * @output Exports Citation with safe navigation and named inert-reference states
 * @position Core implementation; consumed by index.ts
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Citation/index.ts (exports if types change)
 * - /packages/core/src/Citation/Citation.doc.mjs (props table, features)
 * - /packages/core/src/Citation/Citation.test.tsx (tests for new/changed behavior)
 * - /apps/storybook/stories/Citation.stories.tsx (storybook stories)
 * - /packages/cli/assets/templates/blocks/components/Citation/ (showcase blocks)
 */

import type React from 'react';
import type {ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  spacingVars,
  radiusVars,
  typeScaleVars,
  fontWeightVars,
  borderVars,
  durationVars,
  easeVars,
} from '../theme/tokens.stylex';
import {mergeProps} from '../utils';
import {isSafeUrl} from '../utils/safeUrl';
import type {BaseProps} from '../BaseProps';
import {themeProps} from '../utils/themeProps';
import {renderIconSlot} from '../Icon';
import {
  registerEnglishFallback,
  useComponentTranslator,
} from '../i18n/useComponentTranslator';
import english from '../i18n/generated-english/Citation/Citation.generated';

registerEnglishFallback(english);

export interface CitationSource {
  title?: string;
  url?: string;
  /**
   * Image URL for a favicon or source logo, rendered as `<img src>` inside the
   * icon circle. This is the idiomatic field for image sources (mirrors
   * `Avatar`/`Thumbnail` `src`). When both `src` and a non-string `icon` are
   * provided, `icon` wins.
   */
  src?: string;
  /**
   * Source icon shown before the label text (label variant only). Accepts:
   * - a React node / Astryx `<Icon>` / SVG element — rendered as-is, or
   * - a string image URL — rendered as `<img src>` for backward compatibility
   *   with callers that passed a favicon URL here.
   *
   * Note: unlike icon slots elsewhere in the system, a bare string is treated
   * as an image URL (not a semantic icon name) to preserve the original
   * favicon behavior. Pass an Astryx `<Icon>` (or other node) for a real icon.
   */
  icon?: ReactNode;
}

export interface CitationProps extends BaseProps<HTMLElement> {
  ref?: React.Ref<HTMLElement>;
  source: CitationSource;
  number: number;
  variant?: 'label' | 'number';
}

const styles = stylex.create({
  label: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
    verticalAlign: 'baseline',
    height: spacingVars['--spacing-5'],
    fontSize: typeScaleVars['--text-supporting-size'],
    fontWeight: typeScaleVars['--text-supporting-weight'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    color: colorVars['--color-text-secondary'],
    borderRadius: radiusVars['--radius-element'],
    borderWidth: borderVars['--border-width'],
    borderStyle: 'solid',
    borderColor: colorVars['--color-border'],
    paddingInline: spacingVars['--spacing-2'],
    marginInlineStart: spacingVars['--spacing-0-5'],
    textDecoration: 'none',
    transitionProperty: 'background-color, border-color, color',
    transitionDuration: durationVars['--duration-fast-max'],
    transitionTimingFunction: easeVars['--ease-standard'],
    maxWidth: '15em',
    overflow: 'hidden',
  },
  labelWithIcon: {
    paddingInlineStart: spacingVars['--spacing-0-5'],
  },
  labelText: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
  },
  labelInteractive: {
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
  labelHover: {
    backgroundColor: {
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        '@media (hover: hover)': colorVars['--color-overlay-hover'],
      },
    },
    color: {
      // Explicit default: without it, this hover-only conditional replaces
      // the base secondary color from `label` (last-wins property merge),
      // leaving linked citations to inherit the surrounding text color.
      default: colorVars['--color-text-secondary'],
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        '@media (hover: hover)': colorVars['--color-text-primary'],
      },
    },
  },
  number: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    verticalAlign: 'super',
    fontSize: typeScaleVars['--text-supporting-size'],
    fontWeight: fontWeightVars['--font-weight-semibold'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    color: colorVars['--color-text-secondary'],
    backgroundColor: colorVars['--color-accent-muted'],
    borderRadius: radiusVars['--radius-full'],
    minWidth: spacingVars['--spacing-5'],
    height: spacingVars['--spacing-5'],
    paddingInline: spacingVars['--spacing-1'],
    textDecoration: 'none',
    transitionProperty: 'background-color',
    transitionDuration: durationVars['--duration-fast-max'],
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  numberInteractive: {
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
  numberHover: {
    backgroundColor: {
      // Explicit default for the same reason as labelHover's color: a
      // hover-only conditional replaces the base accent-muted pill from
      // `number` on merge, leaving linked badges transparent.
      default: colorVars['--color-accent-muted'],
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        '@media (hover: hover)': colorVars['--color-overlay-hover'],
      },
    },
  },
  iconWrap: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: spacingVars['--spacing-4'],
    height: spacingVars['--spacing-4'],
    borderRadius: radiusVars['--radius-full'],
    backgroundColor: colorVars['--color-background-surface'],
    borderWidth: borderVars['--border-width'],
    borderStyle: 'solid',
    borderColor: colorVars['--color-border'],
    overflow: 'hidden',
    flexShrink: 0,
  },
  icon: {
    width: spacingVars['--spacing-3'],
    height: spacingVars['--spacing-3'],
  },
});

export function Citation({
  ref,
  source,
  number,
  variant = 'label',
  xstyle,
  className,
  style,
  'data-testid': testId,
  ...rest
}: CitationProps): React.ReactElement {
  const t = useComponentTranslator();
  const title = source.title ?? String(number);
  const href =
    source.url != null && isSafeUrl(source.url) ? source.url : undefined;

  // Resolve the source icon. A non-string `icon` node renders as-is (an Astryx
  // <Icon>, SVG, avatar, etc.). Otherwise fall back to an image URL: `src`, or
  // a legacy string passed to `icon` (back-compat — favicon URLs still render
  // as <img>). The icon is decorative; the accessible name comes solely from
  // the element's aria-label, so nothing is double-announced.
  const iconNode =
    source.icon != null && typeof source.icon !== 'string' ? source.icon : null;
  const imageSrc =
    source.src ?? (typeof source.icon === 'string' ? source.icon : undefined);
  const hasIcon = iconNode != null || imageSrc != null;

  const Tag = href ? 'a' : 'span';
  // `doc-noteref` is a link role and is not permitted on the inert span. Give
  // that span a supported naming role so the component-authored aria-label
  // still identifies number-only citations to assistive technology.
  const noteRole = href ? ('doc-noteref' as const) : ('group' as const);
  const linkProps = href
    ? {
        href,
        target: '_blank' as const,
        rel: 'noopener noreferrer' as const,
        title,
      }
    : {title};

  // Both <a> and <span> extend HTMLElement — narrow via intersection
  const elementRef = ref as React.Ref<HTMLAnchorElement> &
    React.Ref<HTMLSpanElement>;

  if (variant === 'number') {
    return (
      <Tag
        {...rest}
        ref={elementRef}
        role={noteRole}
        aria-label={t('@astryx.citation.label', {number, title})}
        data-testid={testId}
        {...linkProps}
        {...mergeProps(
          themeProps('citation', {variant}),
          stylex.props(
            styles.number,
            href != null && styles.numberHover,
            href != null && styles.numberInteractive,
            xstyle,
          ),
          className,
          style,
        )}>
        {number}
      </Tag>
    );
  }

  return (
    <Tag
      {...rest}
      ref={elementRef}
      role={noteRole}
      aria-label={t('@astryx.citation.label', {number, title})}
      data-testid={testId}
      {...linkProps}
      {...mergeProps(
        themeProps('citation', {variant}),
        stylex.props(
          styles.label,
          hasIcon && styles.labelWithIcon,
          href != null && styles.labelHover,
          href != null && styles.labelInteractive,
          xstyle,
        ),
        className,
        style,
      )}>
      {hasIcon && (
        <span aria-hidden="true" {...stylex.props(styles.iconWrap)}>
          {iconNode != null ? (
            renderIconSlot(iconNode, {size: 'sm'})
          ) : (
            <img src={imageSrc} alt="" {...stylex.props(styles.icon)} />
          )}
        </span>
      )}
      <span {...stylex.props(styles.labelText)}>{title}</span>
    </Tag>
  );
}

Citation.displayName = 'Citation';
