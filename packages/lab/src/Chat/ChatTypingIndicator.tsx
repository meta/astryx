// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ChatTypingIndicator.tsx
 * @input Uses React, i18n (useTranslator/useLocale), StyleX (keyframes), theme tokens
 * @output Exports ChatTypingIndicator component and ChatTypingIndicatorProps
 * @position Animated "X is typing…" hint above a chat composer
 *
 * Three staggered bouncing dots (stylex.keyframes, reduced-motion safe)
 * with a grammar-aware label: "Ana is typing…", "Ana and Ben are typing…",
 * or "Ana and 2 others are typing…". The label is announced once per change
 * through the shared polite channel (`useAnnounce`), or left to an enclosing
 * live container such as a chat log; the element itself carries no live role
 * (spec:AST-086 FR2, FR4). Renders dots only when no names are provided.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/lab/src/Chat/index.ts (exports)
 * - /packages/lab/src/Chat/ChatTypingIndicator.doc.mjs
 * - /apps/storybook/stories/ChatAdditions.stories.tsx (examples)
 */

import {useEffect, useMemo, useRef} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  spacingVars,
  radiusVars,
  durationVars,
  typographyVars,
  typeScaleVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import type {BaseProps} from '@astryxdesign/core';
import {mergeProps, mergeRefs} from '@astryxdesign/core/utils';
import {useAnnounce} from '@astryxdesign/core/hooks';
import {themeProps} from '@astryxdesign/core/utils';
import {useLocale, useTranslator} from '@astryxdesign/core/i18n';
import type {TranslatorFn} from '@astryxdesign/core/i18n';

export interface ChatTypingIndicatorProps extends BaseProps<HTMLDivElement> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLDivElement>;

  /**
   * Names of people currently typing. Drives the label:
   * one name → "Ana is typing…", two → "Ana and Ben are typing…",
   * more → "Ana and 2 others are typing…". When omitted or empty,
   * only the animated dots render.
   */
  names?: string[];
}

// =============================================================================
// Styles
// =============================================================================

const bounceKeyframes = stylex.keyframes({
  '0%': {transform: 'translateY(0)', opacity: 0.35},
  '30%': {transform: 'translateY(-3px)', opacity: 1},
  '60%': {transform: 'translateY(0)', opacity: 0.35},
  '100%': {transform: 'translateY(0)', opacity: 0.35},
});

const styles = stylex.create({
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    minHeight: 20,
  },
  dots: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: 'var(--astryx-chat-typing-indicator-dots-column-width, auto)',
    gap: spacingVars['--spacing-0-5'],
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: radiusVars['--radius-full'],
    backgroundColor: colorVars['--color-icon-secondary'],
    animationName: bounceKeyframes,
    animationDuration: durationVars['--duration-slow'],
    animationIterationCount: 'infinite',
    animationTimingFunction: 'ease-in-out',
    '@media (prefers-reduced-motion: reduce)': {
      animationName: 'none',
    },
  },
  dot2: {
    animationDelay: '160ms',
  },
  dot3: {
    animationDelay: '320ms',
  },
  label: {
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-supporting-size'],
    color: colorVars['--color-text-secondary'],
  },
});

/**
 * Builds the status sentence for the people currently typing.
 *
 * Every phrase comes from the translation catalog, and the names themselves are
 * joined by `Intl.ListFormat` for the active locale rather than an English
 * "and". Three or more people collapse to the first name plus a translated
 * overflow phrase, which is then joined the same way — so the conjunction, the
 * separator, and their order all follow the locale instead of this file.
 */
function typingLabel(
  names: string[] | undefined,
  t: TranslatorFn,
  listFormat: Intl.ListFormat,
): string | null {
  if (names == null || names.length === 0) {
    return null;
  }
  if (names.length === 1) {
    return t('@astryx.chatTypingIndicator.one', {name: names[0]});
  }
  const parts =
    names.length === 2
      ? [names[0], names[1]]
      : [
          names[0],
          t('@astryx.chatTypingIndicator.others', {count: names.length - 1}),
        ];
  return t('@astryx.chatTypingIndicator.many', {
    names: listFormat.format(parts),
  });
}

/**
 * An enclosing live container (a chat transcript's role="log", or any element
 * the page made live) already delivers content added inside it, so the
 * indicator must not announce the same words again (spec:AST-086 FR4).
 */
const LIVE_CONTAINER_SELECTOR =
  '[role="log"], [role="status"], [role="alert"], [aria-live="polite"], [aria-live="assertive"]';

// =============================================================================
// Component
// =============================================================================

/**
 * Animated three-dot typing hint with a name-aware label.
 *
 * The dots bounce with staggered delays (disabled under
 * prefers-reduced-motion). Each new label is announced politely to screen
 * readers through the shared announcement channel, unless an enclosing live
 * container such as a chat log delivers it.
 *
 * @example
 * ```
 * <ChatTypingIndicator names={['Ana']} />
 * <ChatTypingIndicator names={['Ana', 'Ben', 'Casey']} />
 * ```
 */
export function ChatTypingIndicator({
  names,
  xstyle,
  className,
  style: styleProp,
  'data-testid': testId,
  ref,
}: ChatTypingIndicatorProps) {
  const t = useTranslator();
  const locale = useLocale();
  const listFormat = useMemo(
    () => new Intl.ListFormat(locale, {style: 'long', type: 'conjunction'}),
    [locale],
  );
  const label = typingLabel(names, t, listFormat);

  const rootRef = useRef<HTMLDivElement>(null);
  const mergedRef = useMemo(() => mergeRefs(rootRef, ref), [ref]);
  const announce = useAnnounce();
  // The label last announced, so a rerender or a StrictMode effect replay does
  // not repeat it; cleared when nobody is typing, so the same people starting
  // again is a new occasion (spec:AST-086 FR6).
  const announcedLabelRef = useRef<string | null>(null);
  useEffect(() => {
    if (label == null) {
      announcedLabelRef.current = null;
      return;
    }
    if (announcedLabelRef.current === label) {
      return;
    }
    announcedLabelRef.current = label;
    const isInsideLiveContainer =
      rootRef.current?.parentElement?.closest(LIVE_CONTAINER_SELECTOR) != null;
    if (!isInsideLiveContainer) {
      announce(label, 'polite');
    }
  }, [announce, label]);

  return (
    <div
      ref={mergedRef}
      data-testid={testId}
      {...mergeProps(
        themeProps('chat-typing-indicator'),
        stylex.props(styles.root, xstyle),
        className,
        styleProp,
      )}>
      <span aria-hidden="true" {...stylex.props(styles.dots)}>
        <span {...stylex.props(styles.dot)} />
        <span {...stylex.props(styles.dot, styles.dot2)} />
        <span {...stylex.props(styles.dot, styles.dot3)} />
      </span>
      {label != null && <span {...stylex.props(styles.label)}>{label}</span>}
    </div>
  );
}

ChatTypingIndicator.displayName = 'ChatTypingIndicator';
