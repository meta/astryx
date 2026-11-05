// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file HeadingLinksRenderer.tsx
 * @input A built-in semantic heading and its module-owned identity projection
 * @output Inline heading-permalink copy composition with isolated control geometry
 * @position Internal renderer owned by module:Markdown/headingLinks
 */

import {useCallback} from 'react';
import type {MouseEvent, ReactElement} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {StyleXStyles} from '@stylexjs/stylex';
import {Button} from '../../Button/Button';
import {Icon} from '../../Icon';
import {useClipboard} from '../../hooks/useClipboard';
import {useContainerReveal} from '../../hooks/useContainerReveal';
import {colorVars, sizeVars, spacingVars} from '../../theme/tokens.stylex';
import {mergeProps, rtlStyles} from '../../utils';
import {
  registerEnglishFallback,
  useComponentTranslator,
} from '../../i18n/useComponentTranslator';
import english from '../../i18n/generated-english/Markdown/plugins/HeadingLinksRenderer.generated';

registerEnglishFallback(english);

const COPY_FEEDBACK_MS = 1500;
const COARSE_TARGET = '24px';

const ALIGN_MARGIN = {
  start: '0',
  center: 'auto',
} as const;

const dynamicStyles = stylex.create({
  proseWidth: (maxWidth: string) => ({maxWidth}),
  proseAlign: (marginInline: string) => ({marginInline}),
});

const styles = stylex.create({
  row: {
    display: 'flex',
    alignItems: 'last baseline',
    minWidth: 0,
    maxWidth: '100%',
    overflow: 'visible',
    isolation: 'isolate',
  },
  heading: {
    flex: '0 1 auto',
    minWidth: 0,
    marginBlock: 0,
  },
  controlSlot: {
    position: 'relative',
    display: 'inline-block',
    flexShrink: 0,
    zIndex: 1,
    inlineSize: {
      default: sizeVars['--size-element-sm'],
      '@media (any-pointer: coarse)': COARSE_TARGET,
    },
    marginInlineStart: spacingVars['--spacing-1-5'],
    color: colorVars['--color-text-secondary'],
    fontFamily: 'inherit',
    fontSize: 'inherit',
    fontWeight: 'inherit',
    lineHeight: 'inherit',
  },
  baselineProbe: {
    visibility: 'hidden',
  },
  copyButton: {
    position: 'absolute',
    insetBlockStart: '50%',
    inlineSize: {
      default: sizeVars['--size-element-sm'],
      '@media (any-pointer: coarse)': COARSE_TARGET,
    },
    blockSize: {
      default: sizeVars['--size-element-sm'],
      '@media (any-pointer: coarse)': COARSE_TARGET,
    },
    paddingBlock: 0,
    paddingInline: 0,
    color: 'inherit',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    fontWeight: 'inherit',
    lineHeight: 'inherit',
  },
  glyph: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    inlineSize: '1em',
    blockSize: '1em',
  },
});

/** @internal Applied only while this module owns the built-in heading row. */
export const headingLinksHeadingStyle = styles.heading;

interface HeadingLinksRendererProps {
  readonly children: ReactElement;
  readonly headingId: string;
  readonly headingLabel: string;
  readonly permalinkUrl: string;
  readonly contentWidth: string | null;
  readonly contentAlign: 'start' | 'center';
  readonly headingTextStyle: StyleXStyles;
  readonly blockSpacingStyle: StyleXStyles;
}

function isUnmodifiedPrimaryActivation(
  event: MouseEvent<HTMLButtonElement>,
): boolean {
  return (
    event.button === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}

/** @internal Portable renderer composed by Markdown for built-in headings only. */
export function HeadingLinksRenderer({
  children,
  headingId,
  headingLabel,
  permalinkUrl,
  contentWidth,
  contentAlign,
  headingTextStyle,
  blockSpacingStyle,
}: HeadingLinksRendererProps): ReactElement {
  const t = useComponentTranslator();
  const copiedLabel = t('@astryx.markdownHeadingLinks.copied');
  const copyLabel = t('@astryx.markdownHeadingLinks.copy', {
    heading: headingLabel || headingId,
  });
  const {copy, isCopied} = useClipboard({
    announce: copiedLabel,
    resetAfterMs: COPY_FEEDBACK_MS,
  });
  const {getContainerProps, getContentRevealProps} = useContainerReveal();
  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      if (!isUnmodifiedPrimaryActivation(event)) {
        return;
      }
      // This is deliberately an honest copy button rather than an anchor: the
      // heading remains an incoming fragment target, while activating the #
      // never mutates location, scrolls, or implies open-in-new-tab semantics.
      void copy(new URL(permalinkUrl, window.location.href).href);
    },
    [copy, permalinkUrl],
  );

  return (
    <div
      {...mergeProps(
        getContainerProps(),
        stylex.props(
          styles.row,
          headingTextStyle,
          blockSpacingStyle,
          contentWidth != null ? dynamicStyles.proseWidth(contentWidth) : null,
          contentAlign !== 'start'
            ? dynamicStyles.proseAlign(ALIGN_MARGIN[contentAlign])
            : null,
        ),
      )}>
      {children}
      <span {...stylex.props(styles.controlSlot)}>
        <span aria-hidden="true" {...stylex.props(styles.baselineProbe)}>
          #
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          label={isCopied ? copiedLabel : copyLabel}
          icon={
            <span aria-hidden="true" {...stylex.props(styles.glyph)}>
              {isCopied ? <Icon icon="check" size="sm" color="inherit" /> : '#'}
            </span>
          }
          isIconOnly
          onClick={handleClick}
          xstyle={[styles.copyButton, rtlStyles.centerInline('-50%')]}
          {...getContentRevealProps({isLayoutPreserved: true})}
        />
      </span>
    </div>
  );
}
