// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Outline.tsx
 * @input Uses React, StyleX, Astryx link provider integration, Outline hooks/types, useListFocus
 * @output Exports Outline component and OutlineProps type
 * @position Core implementation; consumed by index.ts
 *
 * A table-of-contents navigation component with:
 * - Sliding indicator track (vertical divider + animated active bar)
 * - Density variant (default/compact)
 * - Scroll-spy active state when uncontrolled
 * - Roving-tabindex keyboard navigation (Arrow/Home/End, Enter/Space activate)
 * - onNavigateStart / onNavigateEnd callbacks around the smooth scroll
 * - Scroll scoping (offset, scrollContainerRef, hasScrollOnClick)
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Outline/Outline.doc.mjs
 * - /packages/core/src/Outline/index.ts
 * - /apps/storybook/stories/Outline.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/Outline/ (showcase blocks)
 */

import {useRef} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  durationVars,
  easeVars,
  radiusVars,
  spacingVars,
  typeScaleVars,
  fontWeightVars,
} from '../theme/tokens.stylex';
import {useLinkComponent} from '../Link/useLinkComponent';
import {useListFocus} from '../hooks/useListFocus';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {mergeProps} from '../utils';
import type {BaseProps} from '../BaseProps';
import {useScrollSpy} from './useScrollSpy';
import type {OutlineItem} from './types';
import {themeProps} from '../utils/themeProps';
import {focusOutlineProps} from '../utils/focusOutline.stylex';
import {interactionOverlayStyles} from '../utils/interactionOverlay.stylex';
import {usePressFeedback} from '../hooks/usePressFeedback';
import {useTranslator} from '../i18n';

import {useMergedRefs} from '../hooks/useMergedRefs';
export type {OutlineItem} from './types';

export interface OutlineProps extends BaseProps<HTMLElement> {
  /** Ref forwarded to the root nav element. */
  ref?: React.Ref<HTMLElement>;

  /** Ordered list of heading items to render. */
  items: OutlineItem[];

  /** ID of the currently active item. When provided, disables built-in scroll-spy. */
  activeId?: string;

  /** Called when the active item changes from scroll-spy or click. */
  onActiveIdChange?: (id: string) => void;

  /** Accessible label for the nav landmark. @default 'Table of contents' */
  label?: string;

  /**
   * Density variant controlling item padding.
   * - 'default': Standard spacing (default)
   * - 'compact': Reduced spacing for dense UIs
   * @default 'default'
   */
  density?: 'default' | 'compact';

  /**
   * Called when navigation to an item begins, before the scroll starts.
   * Receives the item `id`. Pair with `onNavigateEnd` to drive an arrival
   * effect (flash, ring, pulse) on the target heading.
   */
  onNavigateStart?: (id: string) => void;

  /**
   * Called once when navigation to an item resolves — when the smooth scroll
   * settles, or immediately-ish when reduced motion turns it into a jump.
   *
   * Fires exactly once for every `onNavigateStart`, including when the user
   * interrupts the scroll by scrolling manually, so a "navigating" state can
   * never leak. It does not fire if the Outline unmounts mid-scroll.
   */
  onNavigateEnd?: (id: string) => void;

  /**
   * Height in px of a fixed header overlaying the top of the scroll root.
   *
   * Shifts both the activation line *and* the scroll landing by the same
   * amount, so a heading activates exactly where navigating to it puts it —
   * below the header rather than hidden underneath it.
   *
   * It composes with each heading's own `scroll-margin-top` (the header, then
   * the breathing room below it) rather than replacing it. When nothing
   * overlays the content, leave this at 0 and let `scroll-margin-top` do the
   * work — the browser already honors it.
   *
   * @default 0
   */
  offset?: number;

  /**
   * Scroll container to track, instead of auto-detecting the nearest scrollable
   * ancestor. Use this when the content scrolls inside a split pane, modal, or
   * dashboard panel rather than the viewport.
   */
  scrollContainerRef?: React.RefObject<HTMLElement | null>;

  /**
   * Whether activating an item smooth-scrolls to it. Set to false to own the
   * scrolling yourself (virtualized content, a router) — the Outline still
   * updates the active item, the hash, and the navigate callbacks, but performs
   * no scroll and suppresses the anchor's default jump.
   * @default true
   */
  hasScrollOnClick?: boolean;

  /** Test ID for testing frameworks. */
  'data-testid'?: string;
}

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'row',
    position: 'relative',
    gap: spacingVars['--spacing-0-5'],
    width: '100%',
  },
  track: {
    position: 'relative',
    width: '2px',
    flexShrink: 0,
    order: -1,
  },
  dividerLine: {
    position: 'absolute',
    insetBlockStart: 0,
    insetBlockEnd: 0,
    insetInlineStart: 0,
    width: '2px',
    backgroundColor: colorVars['--color-border'],
    borderRadius: radiusVars['--radius-full'],
    pointerEvents: 'none',
  },
  indicator: {
    position: 'absolute',
    insetInlineStart: 0,
    width: '2px',
    backgroundColor: colorVars['--color-icon-primary'],
    borderRadius: radiusVars['--radius-full'],
    pointerEvents: 'none',
    zIndex: 1,
    positionAnchor: '--outline-active',
    top: 'anchor(--outline-active top, 0px)',
    height: 'anchor-size(--outline-active height, 0px)',
    transitionProperty: 'top, height',
    transitionDuration: durationVars['--duration-fast-min'],
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  activeAnchor: {
    anchorName: '--outline-active',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-0-5'],
    margin: 0,
    padding: 0,
    listStyle: 'none',
    flex: 1,
    minWidth: 0,
  },
  item: {
    listStyleType: 'none',
    margin: 0,
    padding: 0,
  },
  link: {
    alignItems: 'center',
    borderRadius: radiusVars['--radius-element'],
    boxSizing: 'border-box',
    color: colorVars['--color-text-secondary'],
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    display: 'flex',
    fontWeight: fontWeightVars['--font-weight-normal'],
    position: 'relative',
    textAlign: 'start',
    textDecoration: 'none',
    transitionDuration: durationVars['--duration-fast'],
    transitionProperty: 'background-color, color',
    transitionTimingFunction: easeVars['--ease-standard'],
    width: '100%',
    fontSize: typeScaleVars['--text-body-size'],
    lineHeight: typeScaleVars['--text-body-leading'],
    ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
      '@media (hover: hover)': {
        color: colorVars['--color-text-primary'],
      },
    },
  },
  activeLink: {
    color: colorVars['--color-text-primary'],
    fontWeight: fontWeightVars['--font-weight-semibold'],
  },
  label: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
});

const densityStyles = stylex.create({
  compact: {
    paddingBlock: spacingVars['--spacing-1'],
    paddingInlineEnd: spacingVars['--spacing-2'],
  },
  default: {
    paddingBlock: spacingVars['--spacing-2'],
    paddingInlineEnd: spacingVars['--spacing-2'],
  },
});

const indentStyles = stylex.create({
  level1: {paddingInlineStart: spacingVars['--spacing-3']},
  level2: {paddingInlineStart: spacingVars['--spacing-7']},
  level3: {paddingInlineStart: spacingVars['--spacing-11']},
  level4: {paddingInlineStart: spacingVars['--spacing-12']},
});

function getIndentStyle(level: number) {
  // Map heading levels 1-6 to visual indent levels 1-4
  // Level 1 (h1) = indent 1, Level 2 (h2) = indent 1, Level 3 (h3) = indent 2, etc.
  const indentLevel = Math.max(1, Math.min(4, level - 1 || 1));
  switch (indentLevel) {
    case 1:
      return indentStyles.level1;
    case 2:
      return indentStyles.level2;
    case 3:
      return indentStyles.level3;
    default:
      return indentStyles.level4;
  }
}

/**
 * A followed in-page link moves the sequential focus starting point to its
 * target, so the next Tab continues inside that section. Outline cancels the
 * link's default to scroll itself, so it restores that by focusing the target
 * without scrolling (WCAG 2.4.3). A target that is not focusable becomes
 * programmatically focusable only.
 */
function moveFocusTo(id: string) {
  const target = document.getElementById(id);
  if (target == null) {
    return;
  }
  // A target that already takes focus (a link, a button) keeps its place in
  // the Tab order; only one that refuses focus is made focusable by script.
  target.focus({preventScroll: true});
  // A caller's own tabindex is never overwritten.
  if (document.activeElement !== target && !target.hasAttribute('tabindex')) {
    target.setAttribute('tabindex', '-1');
    target.focus({preventScroll: true});
  }
}

// =============================================================================
// Component
// =============================================================================

/**
 * A table-of-contents navigation component for document headings.
 *
 * Outline accepts a flat `items` array and renders anchor links with
 * indentation based on each heading level. Features a sliding indicator
 * track that animates to the active item.
 *
 * When `activeId` is omitted, it tracks scroll position and marks the last
 * heading whose top has passed its activation line — which is exactly where
 * navigating to that heading lands it: `offset` (a fixed header overlaying the
 * scroll root) plus the heading's own `scroll-margin-top`. It defaults to the
 * first item at the top and the last at the bottom.
 *
 * Keyboard: the list is a single tab stop (roving tabindex), seated on the
 * active heading. Arrow keys move between headings, Home/End jump to the ends,
 * and Enter/Space activate — so a long table of contents costs one Tab press,
 * not one per heading.
 *
 * @example
 * ```
 * <Outline
 *   items={[
 *     {id: 'intro', label: 'Introduction', level: 1},
 *     {id: 'features', label: 'Features', level: 2},
 *     {id: 'api', label: 'API Reference', level: 1},
 *   ]}
 * />
 * ```
 *
 * Scoped to a custom scroll container, under a fixed header:
 *
 * @example
 * ```
 * const scrollContainerRef = useRef<HTMLDivElement>(null);
 * <div ref={scrollContainerRef} style={{overflowY: 'auto'}}>...</div>
 * <Outline
 *   items={items}
 *   scrollContainerRef={scrollContainerRef}
 *   offset={64}
 *   onNavigateEnd={id => flashHeading(id)}
 * />
 * ```
 */
export function Outline({
  items,
  activeId,
  onActiveIdChange,
  label: labelFromProps,
  density = 'default',
  onNavigateStart,
  onNavigateEnd,
  offset = 0,
  scrollContainerRef,
  hasScrollOnClick = true,
  xstyle,
  className,
  style,
  ref,
  'data-testid': testId,
  ...props
}: OutlineProps) {
  const pressable = usePressFeedback();
  const t = useTranslator();
  const label = labelFromProps ?? t('@astryx.outline.label');
  const rootRef = useRef<HTMLElement | null>(null);
  const LinkComponent = useLinkComponent();
  const {activeId: resolvedActiveId, scrollTo} = useScrollSpy({
    activeId,
    items,
    onActiveIdChange,
    rootRef,
    offset,
    scrollContainerRef,
    hasScrollOnClick,
    onNavigateStart,
    onNavigateEnd,
  });

  // Roving tabindex over the links: the whole outline is one tab stop, and
  // arrows move between headings. The hook owns `tabindex` on the items.
  const {
    listRef,
    handleKeyDown: handleListKeyDown,
    handleFocus,
  } = useListFocus<HTMLUListElement>({
    itemSelector: 'a[href]',
    orientation: 'vertical',
    hasRovingTabIndex: true,
  });

  // Seat the tab stop on the *active* heading. WAI-ARIA puts the single tab
  // stop on the current item, so tabbing into a table of contents while
  // reading section 7 lands on section 7 — not back at section 1, which is
  // where useListFocus would otherwise leave it (it promotes the first item on
  // mount and then keeps whichever item already holds the stop).
  //
  // Only while focus is outside the list: once the reader has arrowed to an
  // item, the stop is theirs and scroll-spy must not yank it away. Sets
  // `tabindex` only — it never steals focus. Registered after useListFocus so
  // it runs after the hook's own layout effect and wins; on later commits the
  // hook then finds this item already holding the stop and keeps it.
  useIsomorphicLayoutEffect(() => {
    const list = listRef.current;
    if (list == null || list.contains(document.activeElement)) {
      return;
    }
    const links = Array.from(list.querySelectorAll<HTMLElement>('a[href]'));
    const active = links.find(
      link => link.getAttribute('aria-current') === 'location',
    );
    if (active == null) {
      return;
    }
    for (const link of links) {
      const tabIndex = link === active ? '0' : '-1';
      if (link.getAttribute('tabindex') !== tabIndex) {
        link.setAttribute('tabindex', tabIndex);
      }
    }
  });

  /**
   * The single navigation path, shared by click and keyboard activation:
   * push the hash, then hand off to the scroll-spy's `scrollTo`, which fires
   * the navigate callbacks and moves the indicator when the scroll settles.
   */
  const navigate = (id: string) => {
    if (scrollTo(id)) {
      window.history.pushState(null, '', `#${id}`);
      moveFocusTo(id);
    }
  };

  /** Whether an event carries a modifier chord we must leave to the browser. */
  const hasModifier = (
    event: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>,
  ) => event.metaKey || event.altKey || event.ctrlKey || event.shiftKey;

  const handleClick =
    (id: string) => (event: React.MouseEvent<HTMLElement>) => {
      // Let the browser handle modified clicks (open in new tab, etc.) without
      // touching the active state.
      if (event.defaultPrevented || hasModifier(event)) {
        return;
      }

      // With no target in the DOM — lazily-rendered or virtualized content —
      // there is nothing to scroll to and nothing to make active. Leave the
      // anchor to the browser's native fragment navigation (which still
      // updates the URL) rather than swallowing the click into a dead link.
      if (document.getElementById(id) == null) {
        return;
      }

      // Suppress the anchor's default jump: we own the scroll (or, with
      // `hasScrollOnClick={false}`, deliberately leave it to the consumer).
      event.preventDefault();
      navigate(id);
    };

  const handleKeyDown =
    (id: string) => (event: React.KeyboardEvent<HTMLElement>) => {
      // Enter is a link's native activation and already produces a click.
      // Space is not, so wire it up here to match the button-like affordance.
      if (event.key !== ' ' && event.key !== 'Spacebar') {
        return;
      }
      if (event.defaultPrevented || hasModifier(event)) {
        return;
      }

      // preventDefault does double duty: it stops the page from scrolling, and
      // it tells useScrollSpy this Space is an activation, not a manual scroll.
      event.preventDefault();
      navigate(id);
    };

  return (
    <nav
      {...props}
      ref={useMergedRefs(rootRef, ref)}
      aria-label={label}
      data-testid={testId}
      {...mergeProps(
        themeProps('outline', {density}),
        stylex.props(styles.root, xstyle),
        className,
        style,
      )}>
      <ul
        {...stylex.props(styles.list)}
        ref={listRef}
        role="list"
        onKeyDown={handleListKeyDown}
        onFocus={handleFocus}>
        {items.map(item => {
          const isActive = item.id === resolvedActiveId;

          return (
            <li key={item.id} {...stylex.props(styles.item)} role="listitem">
              <LinkComponent
                href={`#${item.id}`}
                aria-current={isActive ? 'location' : undefined}
                onClick={handleClick(item.id)}
                onKeyDown={handleKeyDown(item.id)}
                {...pressable}
                {...mergeProps(
                  themeProps('outline-item', {
                    active: isActive ? 'active' : null,
                    level: item.level,
                  }),
                  focusOutlineProps.focusVisible(
                    styles.link,
                    interactionOverlayStyles.backgroundColor,
                    densityStyles[density],
                    getIndentStyle(item.level),
                    isActive && styles.activeLink,
                    isActive && styles.activeAnchor,
                  ),
                )}>
                <span {...stylex.props(styles.label)}>{item.label}</span>
              </LinkComponent>
            </li>
          );
        })}
      </ul>

      {/* Track divider. Rendered after the list so the active anchor appears
          earlier in DOM order; `order: -1` keeps the track visually before it. */}
      <div {...stylex.props(styles.track)} aria-hidden="true">
        <span {...stylex.props(styles.dividerLine)} />
      </div>
      <span
        {...mergeProps(
          themeProps('outline-indicator'),
          stylex.props(styles.indicator),
        )}
        aria-hidden="true"
      />
    </nav>
  );
}

Outline.displayName = 'Outline';
