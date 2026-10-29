// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Banner.tsx
 * @input Uses React useState/useRef/useId, useCollapsible, Button, Icon (with registry string names), StyleX
 * @output Exports Banner component, BannerProps, BannerStatus, BannerContainer types
 * @position Core implementation; consumed by index.ts, tested by Banner.test.tsx
 *
 * Visual structure:
 * - Banner frame (themeProps 'banner-frame'): owns the resting elevation and,
 *   for elevated card banners, the outer radius that shapes that shadow
 * - Header area (themeProps 'banner'): colored status background with icon, title, description, actions, dismiss
 * - End area restores the ordinary text context for consumer `endContent`; built-in controls opt back into the status foreground
 * - Content area (themeProps 'banner-content'): card background for additional content (children)
 * - Status icon (themeProps 'banner-icon'): the target rides on the default
 *   <Icon> itself — the element that paints — so 'status:X' overrides reach
 *   the glyph (#4166); for a custom `icon` node it stays on the layout wrapper
 * - Description (themeProps 'banner-description'): the supporting line owns its
 *   own colour and type, and the space between it and the title
 * - The end area carries no target: it is a layout row (flex, wrap, edge
 *   compensation) rather than a painted surface, and a theme that wants the
 *   header to grow around its buttons sets `padding-block` on 'banner'
 * - No left border accent — color is expressed through the full header background
 * - Each visual area owns its own border-radius (no overflow:clip on the container)
 * - Children are collapsible by default: a toggle appears in the header end
 *   area and the content starts closed. `collapsible={false}` opts out and
 *   pins the content open with no toggle. The whole collapse axis (enabled /
 *   default / controlled) lives on that one prop and is driven by the shared
 *   `useCollapsible` hook rather than local state.
 *
 * Status controls visual treatment only. The root carries no live-region role by
 * default: an async outcome is announced from its transition handler through
 * `useAnnounce`, while a caller that needs a persistent semantic mirror may
 * provide `role="status"` through BaseProps. `role="alert"` is explicit and
 * reserved for genuinely urgent content that should interrupt current speech.
 *
 * Title and description render as <div> (not <p>): they accept arbitrary
 * ReactNode content, and <p> cannot legally contain block-level children
 * (the HTML parser reparents them, desyncing SSR markup from the hydrated
 * DOM). Using <div> keeps these slots composable with any content. Their
 * StyleX styles set margin: 0 and explicit typography, so the rendered
 * appearance is identical to the previous <p>.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Banner/Banner.doc.mjs (props table, features, implementation notes)
 * - /packages/core/src/Banner/Banner.test.tsx (tests for new/changed behavior)
 * - /packages/core/src/Banner/index.ts (exports if types change)
 * - /apps/storybook/stories/Banner.stories.tsx (storybook stories)
 * - /packages/cli/assets/templates/blocks/components/Banner/ (showcase blocks)
 */

import {useId, useRef, useState, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {BaseProps} from '../BaseProps';
import {Button} from '../Button';
import {Icon} from '../Icon';
import type {IconName, IconColor} from '../Icon';
import {
  colorVars,
  spacingVars,
  radiusVars,
  fontWeightVars,
  typeScaleVars,
  borderVars,
  durationVars,
  easeVars,
  shadowVars,
} from '../theme/tokens.stylex';
import {useCollapsible} from '../Collapsible/useCollapsible';
import type {CollapsibleConfig} from '../Collapsible/useCollapsible';
import {composeEventHandlers, isRenderable, mergeProps} from '../utils';
import type {Elevation} from '../utils/types';
import {edgeCompSlot} from '../Layout/edgeCompensation.stylex';
import {themeProps} from '../utils/themeProps';
import {useTranslator} from '../i18n';
import type {BannerStatusMap, BannerContainerMap} from './index';

// =============================================================================
// Types
// =============================================================================

/**
 * Status type controlling the banner's icon and color.
 * Extensible via module augmentation of BannerStatusMap.
 */
export type BannerStatus = keyof BannerStatusMap;

/**
 * Container type of the banner.
 * - `card`: standalone card with border-radius and shadow
 * - `section`: full-width section banner (no border-radius)
 *
 * Extensible via module augmentation of BannerContainerMap.
 */
export type BannerContainer = keyof BannerContainerMap;

export interface BannerProps extends BaseProps<HTMLDivElement> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLDivElement>;
  /**
   * Status type controlling the icon and color scheme.
   */
  status: BannerStatus;
  /**
   * Title text or ReactNode displayed prominently in the header area.
   */
  title: ReactNode;
  /**
   * Optional description text below the title in the header area.
   */
  description?: ReactNode;
  /**
   * Override the default status icon.
   */
  icon?: ReactNode;
  /**
   * Whether the banner can be dismissed.
   * When true, shows a close button and manages internal dismissed state
   * so the banner disappears even if `onDismiss` is not provided.
   * @default false
   */
  isDismissable?: boolean;
  /**
   * Called when the dismiss button is clicked.
   * The banner will hide itself regardless of whether this callback is provided.
   */
  onDismiss?: () => void;
  /**
   * Accessible name and visible tooltip for the dismiss button, replacing the default.
   * Pass an already-translated string.
   *
   * The default is "Dismiss {title}" when `title` is a string, so stacked
   * banners are told apart by a screen reader; a non-string `title` falls back
   * to "Dismiss" and should set this.
   */
  dismissLabel?: string;
  /**
   * Action button rendered in the header area (end-aligned).
   * Typically an Button with a secondary or ghost variant.
   *
   * When the header is too narrow to hold the actions and a readable text
   * column, the whole end area wraps to its own row below the text.
   *
   * @example
   * ```
   * endContent={<Button label="Retry" variant="ghost" onClick={handleRetry} />}
   * ```
   */
  endContent?: ReactNode;
  /**
   * Container type of the banner.
   * - `card`: standalone card with border-radius
   * - `section`: full-width section banner (no border-radius)
   * @default 'card'
   */
  container?: BannerContainer;
  /**
   * Resting elevation — the shadow depth the banner sits at. Use for a
   * floating banner that hovers above content. `none` is the default inline
   * banner.
   * @default 'none'
   */
  elevation?: Elevation;
  /**
   * Whether the content area (children) sits behind an expand/collapse toggle
   * in the header. On by default, so a banner with children behaves as it
   * always has.
   *
   * - omitted / `true` — collapsible, starts collapsed
   * - `{defaultIsOpen: true}` — collapsible, starts open
   * - `{isOpen, onOpenChange}` — controlled by the consumer
   * - `false` — not collapsible: children are always visible, with no toggle,
   *   no `aria-expanded`, and a content region that stays mounted
   *
   * Takes the shared `CollapsibleConfig` so a banner's disclosure is
   * configured exactly like `Collapsible`'s, rather than through a
   * Banner-only vocabulary. Banner's default differs from the hook's on one
   * point — it starts closed, not open — because a banner's message lives in
   * its header and the content is supplementary.
   *
   * @default true
   */
  collapsible?: boolean | CollapsibleConfig;
  /**
   * Extra content rendered below the header in a card-background area.
   * Use for rich content like lists, links, or detailed information.
   * Collapsed behind a toggle unless `collapsible={false}`.
   */
  children?: ReactNode;
}

// =============================================================================
// Status lookups
// =============================================================================

// `BannerStatus` is `keyof BannerStatusMap`, and index.ts documents augmenting
// that interface to add a status. Every lookup below is therefore partial: an
// augmented status the library has never heard of falls through to the base
// visual treatment: no status fill and no default glyph. Announcement semantics
// remain caller-owned for every status.

const defaultIconNames: Partial<Record<BannerStatus, IconName>> = {
  info: 'info',
  warning: 'warning',
  error: 'error',
  success: 'success',
};

const statusIconColor: Partial<Record<BannerStatus, IconColor>> = {
  info: 'inherit',
  warning: 'inherit',
  error: 'inherit',
  success: 'inherit',
};

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  // Root container — outer elevation and elevated-card radius painter
  root: {
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'inherit',
  },
  // When elevated, a card-container banner rounds its root so the shadow
  // follows the same silhouette as the header/content border-radius.
  rootElevatedCard: {
    borderRadius: `var(--_banner-radius, ${radiusVars['--radius-container']})`,
  },
  // Header area — colored status background with icon, title, description, actions
  // This is the primary theme target ('banner')
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    columnGap: spacingVars['--spacing-2'],
    // The end area carries a -4px block margin (see endArea), so the wrapped
    // row reads as one step of spacing rather than two.
    rowGap: spacingVars['--spacing-3'],
    paddingBlock: spacingVars['--spacing-3'],
    paddingInline: spacingVars['--spacing-4'],
  },
  // Border-radius for card container: all corners when standalone, top-only when content is visible
  headerCardStandalone: {
    borderRadius: `var(--_banner-radius, ${radiusVars['--radius-container']})`,
  },
  headerCardWithContent: {
    borderStartStartRadius: `var(--_banner-radius, ${radiusVars['--radius-container']})`,
    borderStartEndRadius: `var(--_banner-radius, ${radiusVars['--radius-container']})`,
    borderEndStartRadius: 0,
    borderEndEndRadius: 0,
  },
  // When there's only a title (no description) and actions, center everything vertically
  headerCentered: {
    alignItems: 'center',
  },
  // Text content area within the header
  headerContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    flex: 1,
    minWidth: 0,
  },
  // The wrap threshold, applied only when there is `endContent` to wrap. Flex
  // breaks a line when the items no longer fit at their base size, so this
  // basis is what moves the end area to its own row instead of letting it hold
  // the header and squeeze the title down to one word per line. In rem so it
  // tracks the user's font size. The dismiss and expand controls alone are
  // narrow enough never to need it.
  headerContentWithEndContent: {
    flexBasis: '8rem',
  },
  title: {
    margin: 0,
    fontFamily: 'inherit',
    fontSize: typeScaleVars['--text-label-size'],
    fontWeight: fontWeightVars['--font-weight-semibold'],
    lineHeight: typeScaleVars['--text-label-leading'],
    color: colorVars['--color-text-primary'],
    // A single unbroken token (a URL, an ID, a German compound) otherwise sets
    // the flex item's min-content width and pushes the page into horizontal
    // scrolling at 320px, which is a WCAG 1.4.10 reflow failure.
    overflowWrap: 'anywhere',
  },
  description: {
    margin: 0,
    fontFamily: 'inherit',
    fontSize: typeScaleVars['--text-supporting-size'],
    fontWeight: fontWeightVars['--font-weight-normal'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    color: colorVars['--color-text-secondary'],
    overflowWrap: 'anywhere',
  },
  // Built-in status title, description, and icon inherit the header's on-muted
  // color. Built-in controls receive the same context on their Button element
  // only, so the sibling tooltip bubble keeps the theme's ordinary text color.
  statusForeground: {
    color: 'inherit',
  },
  iconWrapper: {
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  endArea: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: spacingVars['--spacing-2'],
    flexShrink: 0,
    // The status surface owns an inherited on-muted foreground, but consumer
    // endContent does not. Reset the end area's ordinary text context, then let
    // the built-in controls below opt back into the status foreground.
    color: colorVars['--color-text-primary'],
    // Bounded so a group of actions wider than the row wraps within itself
    // rather than pushing the banner past the viewport (WCAG 1.4.10).
    maxWidth: '100%',
    marginInlineStart: 'auto',
    marginBlock: `calc(-1 * (${spacingVars['--spacing-3']} - ${spacingVars['--spacing-2']}))`,
  },
  // Content area — theme target ('banner-content')
  contentArea: {
    backgroundColor: colorVars['--color-background-card'],
    paddingBlock: spacingVars['--spacing-3'],
    paddingInline: spacingVars['--spacing-4'],
    borderInlineStartWidth: borderVars['--border-width'],
    borderInlineEndWidth: borderVars['--border-width'],
    borderBlockEndWidth: borderVars['--border-width'],
    borderInlineStartStyle: 'solid',
    borderInlineEndStyle: 'solid',
    borderBlockEndStyle: 'solid',
    borderInlineStartColor: colorVars['--color-border'],
    borderInlineEndColor: colorVars['--color-border'],
    borderBlockEndColor: colorVars['--color-border'],
  },
  contentAreaCard: {
    borderEndStartRadius: `var(--_banner-radius, ${radiusVars['--radius-container']})`,
    borderEndEndRadius: `var(--_banner-radius, ${radiusVars['--radius-container']})`,
  },
  // Applied to the chevron <Icon> itself (via `xstyle`) rather than a wrapper,
  // so the element that rotates is the element a theme targets.
  chevron: {
    transitionProperty: 'transform',
    transitionDuration: {
      default: durationVars['--duration-fast'],
      '@media (prefers-reduced-motion: reduce)': '0s',
    },
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  chevronExpanded: {
    transform: 'rotate(180deg)',
  },
});

const statusStyles = stylex.create({
  info: {
    backgroundColor: colorVars['--color-info-muted'],
    color: colorVars['--color-on-info-muted'],
    // Forced colors replace status fills with Canvas; this boundary keeps the
    // fill's shape visible (architecture:theme-tokens INV11).
    outlineWidth: {default: null, '@media (forced-colors: active)': '1px'},
    outlineStyle: {default: null, '@media (forced-colors: active)': 'solid'},
    outlineColor: {
      default: null,
      '@media (forced-colors: active)': 'CanvasText',
    },
    outlineOffset: {default: null, '@media (forced-colors: active)': '-1px'},
  },
  warning: {
    backgroundColor: colorVars['--color-warning-muted'],
    color: colorVars['--color-on-warning-muted'],
    // Forced colors replace status fills with Canvas; this boundary keeps the
    // fill's shape visible (architecture:theme-tokens INV11).
    outlineWidth: {default: null, '@media (forced-colors: active)': '1px'},
    outlineStyle: {default: null, '@media (forced-colors: active)': 'solid'},
    outlineColor: {
      default: null,
      '@media (forced-colors: active)': 'CanvasText',
    },
    outlineOffset: {default: null, '@media (forced-colors: active)': '-1px'},
  },
  error: {
    backgroundColor: colorVars['--color-error-muted'],
    color: colorVars['--color-on-error-muted'],
    // Forced colors replace status fills with Canvas; this boundary keeps the
    // fill's shape visible (architecture:theme-tokens INV11).
    outlineWidth: {default: null, '@media (forced-colors: active)': '1px'},
    outlineStyle: {default: null, '@media (forced-colors: active)': 'solid'},
    outlineColor: {
      default: null,
      '@media (forced-colors: active)': 'CanvasText',
    },
    outlineOffset: {default: null, '@media (forced-colors: active)': '-1px'},
  },
  success: {
    backgroundColor: colorVars['--color-success-muted'],
    color: colorVars['--color-on-success-muted'],
    // Forced colors replace status fills with Canvas; this boundary keeps the
    // fill's shape visible (architecture:theme-tokens INV11).
    outlineWidth: {default: null, '@media (forced-colors: active)': '1px'},
    outlineStyle: {default: null, '@media (forced-colors: active)': 'solid'},
    outlineColor: {
      default: null,
      '@media (forced-colors: active)': 'CanvasText',
    },
    outlineOffset: {default: null, '@media (forced-colors: active)': '-1px'},
  },
});

// Scope status text context to each built-in Button. Its tooltip is a sibling,
// so it does not inherit these control-only variables.
const statusControlStyles = stylex.create({
  info: {
    '--color-text-primary': colorVars['--color-on-info-muted'],
  },
  warning: {
    '--color-text-primary': colorVars['--color-on-warning-muted'],
  },
  error: {
    '--color-text-primary': colorVars['--color-on-error-muted'],
  },
  success: {
    '--color-text-primary': colorVars['--color-on-success-muted'],
  },
});

/**
 * Narrows an augmented `BannerStatus` to one the style map actually carries,
 * so an unknown status renders with no status fill rather than crashing the
 * lookup. StyleX style maps cannot be declared `Partial`, hence the guard.
 */
function hasStatusStyle(
  status: BannerStatus,
): status is BannerStatus & keyof typeof statusStyles {
  return Object.prototype.hasOwnProperty.call(statusStyles, status);
}

// Resting elevation for the banner. Applied to the root so the shadow wraps
// the whole banner (header + optional content). 'none' is the default and
// leaves the layout-only root untouched. For the `card` container the root is
// rounded (rootElevatedCard) so the shadow follows the card silhouette; the
// full-width `section` container stays square.
const elevationStyles = stylex.create({
  none: {boxShadow: 'none'},
  low: {boxShadow: shadowVars['--shadow-low']},
  med: {boxShadow: shadowVars['--shadow-med']},
  high: {boxShadow: shadowVars['--shadow-high']},
});

// =============================================================================
// Component
// =============================================================================

/**
 * A persistent status notification banner for info, warning, error, or success messages.
 *
 * Two-part visual structure:
 * - Header: colored status background with icon, title, description, and actions
 * - Content (optional): card background area for additional rich content
 *
 * When children are provided, a chevron toggle appears in the header end area
 * (to the left of the dismiss button if present) and the content starts
 * collapsed. Pass `collapsible={false}` for content that is always visible,
 * or a config object to change the initial state or control it.
 *
 * Manages its own dismissed state internally — the banner hides on dismiss
 * even if `onDismiss` is not provided, so product teams don't need to wire
 * up state management for basic dismiss behavior.
 *
 * Status controls visual meaning only. The component adds no live-region role;
 * announce async outcomes from their transition handler with `useAnnounce`, or
 * pass an explicit role when a persistent semantic mirror is appropriate.
 *
 * @example
 * ```
 * <Banner status="info" title="New update available" />
 * <Banner
 *   status="error"
 *   title="Something went wrong"
 *   description="Please try again later."
 *   isDismissable
 *   onDismiss={() => logDismiss()}
 * />
 * <Banner
 *   status="error"
 *   title="Multiple errors found"
 *   description="The following issues need to be resolved:"
 *   isDismissable>
 *   <ul>
 *     <li>Email address is invalid</li>
 *     <li>Password must be at least 8 characters</li>
 *   </ul>
 * </Banner>
 * <Banner
 *   status="warning"
 *   title="Configuration changes"
 *   collapsible={{defaultIsOpen: true}}>
 *   <p>Details here...</p>
 * </Banner>
 * <Banner status="error" title="3 fields need attention" collapsible={false}>
 *   <ul>
 *     <li>Email address is invalid</li>
 *   </ul>
 * </Banner>
 * ```
 */
export function Banner({
  status,
  title,
  description,
  icon,
  isDismissable = false,
  onDismiss,
  dismissLabel,
  endContent,
  container = 'card',
  elevation = 'none',
  collapsible = true,
  children,
  xstyle,
  className,
  style,
  ref,
  onFocusCapture,
  onPointerDownCapture,
  ...rest
}: BannerProps) {
  const t = useTranslator();
  const [isDismissed, setIsDismissed] = useState(false);
  // The disclosure state machine is the shared one — Banner owns no collapse
  // state of its own. `collapsible={false}` disables it, and that is what
  // makes the content permanently visible.
  //
  // The one place Banner departs from the hook's defaults: `useCollapsible`
  // opens by default, a banner starts closed. Its header already carries the
  // message, so the content is supplementary — and this is the behaviour
  // Banner has always had.
  const collapsibleConfig =
    collapsible != null && typeof collapsible === 'object' ? collapsible : {};
  const {
    isEnabled: isCollapsible,
    isOpen: isExpanded,
    toggle: handleToggleExpand,
  } = useCollapsible({
    isCollapsible: collapsible !== false && {
      ...collapsibleConfig,
      defaultIsOpen: collapsibleConfig.defaultIsOpen ?? false,
    },
  });
  // The element focus came from before it entered the banner. Dismissing
  // unmounts the whole banner, dismiss button included, so without a handoff
  // the browser drops focus to <body> and a keyboard user loses their place.
  // ToastViewport makes the same handoff when a focused toast is dismissed.
  const focusOriginRef = useRef<HTMLElement | null>(null);
  // Links the expand/collapse toggle to the content region it shows/hides so
  // assistive tech can move from the button to its controlled content
  // (disclosure pattern). The region is conditionally rendered, so aria-controls
  // below is set only while it's mounted to avoid a dangling reference. A
  // non-collapsible banner has no toggle, so neither end of the link is used.
  const contentId = useId();
  const defaultIconName = defaultIconNames[status];
  const iconColor = statusIconColor[status];
  const hasChildren = isRenderable(children);
  // Keep the default tooltip concise while the accessible name identifies
  // the banner; an explicit translated override names both surfaces.
  const dismiss = t('@astryx.banner.dismiss');
  const dismissTooltip = dismissLabel ?? dismiss;
  const dismissName =
    dismissLabel ??
    (typeof title === 'string'
      ? t('@astryx.banner.dismissTitled', {dismiss, title})
      : dismiss);

  if (isDismissed) {
    return null;
  }

  // `focusin` reports the element focus came *from* as relatedTarget; on
  // pointerdown focus has not moved yet, so document.activeElement is it.
  const rememberFocusOrigin = (candidate: EventTarget | null, root: Node) => {
    if (
      candidate instanceof HTMLElement &&
      candidate !== document.body &&
      !root.contains(candidate)
    ) {
      focusOriginRef.current = candidate;
    }
  };

  const handleFocusCapture = (event: React.FocusEvent<HTMLDivElement>) => {
    rememberFocusOrigin(event.relatedTarget, event.currentTarget);
  };

  const handlePointerDownCapture = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    rememberFocusOrigin(document.activeElement, event.currentTarget);
  };

  const handleDismiss = () => {
    const origin = focusOriginRef.current;
    setIsDismissed(true);
    onDismiss?.();
    // Move focus before React removes the subtree, so the browser never has a
    // frame where the focused node is gone.
    if (origin?.isConnected) {
      origin.focus();
    }
  };

  // The toggle exists only for a collapsible banner that actually has content
  // to disclose.
  const hasToggle = isCollapsible && hasChildren;
  // Show the end area if there are actions, dismiss, or a collapsible toggle
  const showEndArea = isRenderable(endContent) || isDismissable || hasToggle;
  // Center items vertically when there's only a title (no description)
  // and the banner has action buttons
  const hasActions = isRenderable(endContent) || isDismissable;
  const isSingleLine = !isRenderable(description) && hasActions;

  // Non-collapsible children are always shown; collapsible ones follow the
  // hook's open state.
  const showContent = hasChildren && (!isCollapsible || isExpanded);
  const isCard = container === 'card';

  return (
    <div
      ref={ref}
      onFocusCapture={composeEventHandlers(onFocusCapture, handleFocusCapture)}
      onPointerDownCapture={composeEventHandlers(
        onPointerDownCapture,
        handlePointerDownCapture,
      )}
      {...mergeProps(
        themeProps('banner-frame', {container, elevation}),
        stylex.props(
          styles.root,
          elevationStyles[elevation],
          isCard && elevation !== 'none' && styles.rootElevatedCard,
          xstyle,
        ),
        className,
        style,
      )}
      {...rest}>
      {/* Header: colored status background — primary theme target ('banner') */}
      <div
        {...mergeProps(
          themeProps('banner', {container, status}),
          stylex.props(
            styles.header,
            isSingleLine && styles.headerCentered,
            hasStatusStyle(status) && statusStyles[status],
            isCard &&
              (showContent
                ? styles.headerCardWithContent
                : styles.headerCardStandalone),
          ),
        )}>
        {/* The 'banner-icon' target rides on the element that paints: the
            default <Icon> below, or this wrapper when a custom `icon` node
            is passed (core never injects props into consumer elements, so
            overrides reach it via inheritance). The wrapper itself stays
            layout-only. */}
        <div
          {...(isRenderable(icon)
            ? mergeProps(
                themeProps('banner-icon', {status}),
                stylex.props(styles.iconWrapper),
              )
            : stylex.props(styles.iconWrapper))}
          aria-hidden="true">
          {isRenderable(icon) ? (
            icon
          ) : defaultIconName != null ? (
            // Applied to the status <Icon> itself rather than the wrapper, so
            // the element that paints the glyph is the element a theme
            // targets — a 'banner-icon' 'status:X' color override beats the
            // Icon's own variant from @layer astryx-theme (#4166).
            <Icon
              icon={defaultIconName}
              size="md"
              color={iconColor}
              {...themeProps('banner-icon', {status})}
            />
          ) : null}
        </div>
        <div
          {...stylex.props(
            styles.headerContent,
            isRenderable(endContent) && styles.headerContentWithEndContent,
          )}>
          <div
            {...stylex.props(
              styles.title,
              hasStatusStyle(status) && styles.statusForeground,
            )}>
            {title}
          </div>
          {isRenderable(description) && (
            <div
              {...mergeProps(
                themeProps('banner-description'),
                stylex.props(
                  styles.description,
                  hasStatusStyle(status) && styles.statusForeground,
                ),
              )}>
              {description}
            </div>
          )}
        </div>
        {showEndArea && (
          <div
            {...stylex.props(
              styles.endArea,
              edgeCompSlot.inset(spacingVars['--spacing-2']),
            )}>
            {endContent}
            {hasToggle && (
              <Button
                variant="ghost"
                size="sm"
                label={
                  isExpanded
                    ? t('@astryx.banner.collapse')
                    : t('@astryx.banner.expand')
                }
                tooltip={
                  isExpanded
                    ? t('@astryx.banner.collapse')
                    : t('@astryx.banner.expand')
                }
                icon={
                  <Icon
                    icon="chevronDown"
                    size="sm"
                    color="inherit"
                    xstyle={[
                      styles.chevron,
                      isExpanded && styles.chevronExpanded,
                    ]}
                  />
                }
                onClick={handleToggleExpand}
                className={
                  hasStatusStyle(status)
                    ? stylex.props(statusControlStyles[status]).className
                    : undefined
                }
                aria-expanded={isExpanded}
                aria-controls={showContent ? contentId : undefined}
                isIconOnly
              />
            )}
            {isDismissable && (
              <Button
                variant="ghost"
                size="sm"
                label={dismissName}
                tooltip={dismissTooltip}
                icon={<Icon icon="close" size="sm" color="inherit" />}
                onClick={handleDismiss}
                className={
                  hasStatusStyle(status)
                    ? stylex.props(statusControlStyles[status]).className
                    : undefined
                }
                isIconOnly
              />
            )}
          </div>
        )}
      </div>
      {/* Content area: collapsible card background — theme target ('banner-content') */}
      {showContent && (
        <div
          id={hasToggle ? contentId : undefined}
          {...mergeProps(
            themeProps('banner-content', {container, status}),
            stylex.props(styles.contentArea, isCard && styles.contentAreaCard),
          )}>
          {children}
        </div>
      )}
    </div>
  );
}

Banner.displayName = 'Banner';
