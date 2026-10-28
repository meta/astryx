// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Drawer.tsx
 * @input Uses React, StyleX, theme tokens, the shared layer text/structure resets and content boundary, the Dialog purpose type, shared focus/dismissal/depth primitives, container padding lowering, scroll locking/dialog presence, BaseProps, merged refs/props, themeProps
 * @output Exports Drawer component and DrawerProps
 * @position Core implementation; consumed by index.ts, tested by Drawer.test.tsx, demonstrated in Storybook
 *
 * Overlay panel for inspectors and detail views — the "click a table row,
 * see its details" pattern. Slides in from the inline start or end edge and
 * floats above the page content: unlike a docked panel it never reflows the
 * layout underneath, it overlays it (with or without a scrim).
 *
 * Inline axis only (start/end). Block-axis sheets are BottomSheet's job;
 * a drawer is always a full-height side panel.
 *
 * Sizing is viewport-aware: `width` is the desktop budget, and below
 * the mobile breakpoint it preserves a 56px reveal of the page behind, capped
 * by the requested width (or fills the viewport with the experimental
 * `experimental.isFullWidthOnMobile` option).
 *
 * Uses the native `<dialog>` element (same precedent as Dialog/MobileNav):
 * - `showModal()` when `hasScrim` (default) — top-layer rendering, focus
 *   trapping, `::backdrop`, no z-index management.
 * - `showPopover()` when `hasScrim={false}` — non-modal top-layer overlay;
 *   the page behind stays interactive (e.g. master-detail inspectors).
 *
 * Entry animation uses `@starting-style`; exit slides out before the active
 * modal-dialog or manual-popover host releases the top layer and focus returns
 * to the element that opened the drawer. React owns `display` for both legs
 * rather than a discrete `display` transition, so the panel stops painting in
 * the same commit as the host closes — see the `rendered` style for why.
 *
 * Sibling drawers use the shared layer dismissal stack for topmost-only Escape
 * handling and the browser top layer's chronological paint order.
 *
 * Dismissal follows Dialog: `purpose` decides whether Escape and a scrim click
 * request close, and Drawer renders no close button of its own. Compose
 * `DrawerHeader` with `onOpenChange` for a visible close action, as with
 * `DialogHeader`.
 *
 * The scrolling content area is the drawer's container, like Dialog's inner
 * box: the `padding` prop, else the theme's `padding` on `drawer`, insets it
 * through container tokens, defaulting to `--spacing-4` like Dialog, and the
 * applied inset is published so a lone Section child escapes it and a Layout
 * redistributes it to its regions. Compose `DrawerHeader` inside a `Layout`, as
 * `DialogHeader` is composed in Dialog, so the header is not padded twice. The
 * root dialog stays the overlay boundary (`overlayPaddingReset`).
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Drawer/Drawer.doc.mjs (props table, features, usage)
 * - /packages/core/src/Drawer/Drawer.test.tsx (tests for new/changed behavior)
 * - /packages/core/src/Drawer/Drawer.spec.md (component contract)
 * - /packages/core/src/Drawer/index.ts (exports if types change)
 * - /packages/cli/assets/templates/blocks/components/Drawer/ (showcase blocks)
 * - /apps/storybook/stories/Drawer.stories.tsx (examples and visual coverage)
 */

import {useCallback, useRef, useState, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {BaseProps} from '../BaseProps';
import {
  borderVars,
  colorVars,
  durationVars,
  easeVars,
  shadowVars,
} from '../theme/tokens.stylex';
import type {DialogPurpose} from '../Dialog';
import {useFocusTrap, useMergedRefs, useScrollLock} from '../hooks';
import {LayerDepthProvider, useLayerDismissal} from '../Layer';
import {layerTextReset} from '../Layer/layerTextReset.stylex';
import {layerStructureReset} from '../Layer/layerStructureReset.stylex';
import {LayerContentBoundary} from '../Layer/layerScopedContext';
import {ModalAnnounceProvider} from '../hooks/ModalAnnounceProvider';
import {composeEventHandlers, mergeProps, themeProps} from '../utils';
import {container, overlayPaddingReset} from '../Layout';
import {
  containerPaddingBlockEndVarStyles,
  containerPaddingBlockStartVarStyles,
  containerPaddingInlineVarStyles,
  paddingStyles,
  spacingStepToToken,
} from '../Layout/padding.stylex';
import type {SpacingStep, SpacingToken} from '../Layout';
import {useDrawerDialogPresence} from './useDrawerDialogPresence';

// =============================================================================
// Styles
// =============================================================================

// Below this viewport width the drawer preserves a fixed reveal of the page
// behind instead of growing proportionally with the viewport. 640px is the
// repo's mobile breakpoint.
const MOBILE_BREAKPOINT = 640;

// Material's established mobile drawer pattern leaves a 56dp reveal. Using
// the same value in CSS pixels gives the overlay a stable visual relationship
// to the page behind while the requested width remains an upper bound.
const MOBILE_PAGE_REVEAL = 56;
const MOBILE_WIDTH_FULL = '100dvw';

const styles = stylex.create({
  dialog: {
    // Reset native <dialog> defaults — the dialog element IS the panel.
    // The layer text baseline comes from the shared `layerTextReset`, applied
    // with the structural reset ahead of these styles on the root below.
    position: 'fixed',
    margin: 0,
    padding: 0,
    borderWidth: 0,
    borderStyle: 'none',
    // Square corners: the drawer is flush with the viewport edge on three
    // sides, so a radius would only ever cut the two edge-adjacent corners.
    borderRadius: 0,
    maxWidth: 'none',
    maxHeight: 'none',
    boxSizing: 'border-box',
    flexDirection: 'column',
    backgroundColor: colorVars['--color-background-surface'],
    boxShadow: shadowVars['--shadow-high'],
    overflow: 'hidden',
    overscrollBehavior: 'contain',
    outline: 'none',
    // Full-height side panel, pinned across the block axis.
    insetBlockStart: 0,
    insetBlockEnd: 0,
    height: '100dvh',
    // Closed state. `display` is owned by React (see `rendered`), not by a
    // discrete `display` transition, so only `transform` animates here.
    display: 'none',
    transitionProperty: 'transform',
    transitionDuration: durationVars['--duration-medium'],
    transitionTimingFunction: easeVars['--ease-standard'],
    '@media (prefers-reduced-motion: reduce)': {
      transitionDuration: '0.01s',
    },
  },
  // Rendered while the drawer is open AND while it slides out. Applied from
  // React state, not from a discrete `display` transition: leaving either
  // native top-layer host drops the panel back into its ordinary containing
  // context, and any ancestor that establishes a containing block for fixed
  // positioning (transform, filter, container-type, contain) then becomes the
  // origin for the panel's `position: fixed`. A panel still painting after host
  // release therefore snaps back INTO the layout and covers the page for the
  // rest of the hold. Owning `display` lets the hide land in the same commit, so
  // no frame is ever painted outside the top layer.
  //
  // Applied via the isOpen/exit state, not :where([open]) — attribute
  // selectors have zero specificity and can lose to default styles
  // depending on CSS source order (same rationale as Dialog/MobileNav).
  rendered: {
    display: 'flex',
  },
  // DOM directionality comes from the nearest effective `dir` attribute. A
  // local override and an inherited region therefore agree with the logical
  // edge the panel is anchored to.
  end: {
    insetInlineEnd: 0,
    insetInlineStart: 'auto',
    borderInlineStartWidth: borderVars['--border-width'],
    borderInlineStartStyle: 'solid',
    borderInlineStartColor: colorVars['--color-border'],
    transform: {
      default: 'translateX(100%)',
      ':dir(rtl)': 'translateX(-100%)',
    },
  },
  endOpen: {
    transform: {
      default: 'translateX(0)',
      '@starting-style': {
        default: 'translateX(100%)',
        ':dir(rtl)': 'translateX(-100%)',
      },
    },
  },
  start: {
    insetInlineStart: 0,
    insetInlineEnd: 'auto',
    borderInlineEndWidth: borderVars['--border-width'],
    borderInlineEndStyle: 'solid',
    borderInlineEndColor: colorVars['--color-border'],
    transform: {
      default: 'translateX(-100%)',
      ':dir(rtl)': 'translateX(100%)',
    },
  },
  startOpen: {
    transform: {
      default: 'translateX(0)',
      '@starting-style': {
        default: 'translateX(-100%)',
        ':dir(rtl)': 'translateX(100%)',
      },
    },
  },
  // Scrim via the browser's ::backdrop pseudo-element (top layer).
  scrim: {
    '::backdrop': {
      backgroundColor: colorVars['--color-overlay'],
      backdropFilter: 'blur(2px)',
      opacity: 0,
      transitionProperty: 'opacity',
      transitionDuration: durationVars['--duration-medium'],
      transitionTimingFunction: easeVars['--ease-standard'],
    },
    '@media (prefers-reduced-motion: reduce)': {
      '::backdrop': {
        transitionDuration: '0.01s',
      },
    },
  },
  scrimOpen: {
    '::backdrop': {
      opacity: {
        default: 1,
        '@starting-style': 0,
      },
    },
  },
  // Scrollable content area, and the drawer's container: it carries the
  // container padding (--spacing-4 unless the `padding` prop or the theme sets
  // it, as in Dialog) and publishes it, so a lone Section child escapes it
  // exactly as in Dialog and a Layout picks it up for its regions.
  // touch-action + overscroll containment keep momentum scrolling inside
  // the panel on touch devices.
  content: {
    flexGrow: 1,
    minHeight: 0,
    width: '100%',
    overflowY: 'auto',
    overflowX: 'hidden',
    overscrollBehavior: 'contain',
    touchAction: 'pan-y',
    outline: 'none',
    // The scrolling area paints the surface itself, covering the panel's whole
    // inner box. Without it the panel's edge is not uniform: a theme that packs
    // an inset ring into --shadow-high (the bundled themes all add one in dark
    // mode) draws that ring just inside the dialog, where an opaque content
    // wrapper such as Section paints over it — so the ring shows only in the
    // gap below where the content ends, and the panel's edges appear to change
    // partway down. Painting the surface here hides the ring evenly, leaving
    // the anchored-side border as the drawer's one edge (same treatment as
    // BottomSheetPanel's body, #5305).
    backgroundColor: colorVars['--color-background-surface'],
  },
  // Block-end inset of the content area = container padding + the home
  // indicator's safe area, so the last row of content stays clear of the
  // indicator in every padding mode. Applied after container()'s own padding so this
  // composed value wins on the block-end edge; the published
  // --container-padding-block-end keeps the safe area OUT, so a bleed child
  // subtracts only the container inset and the safe area survives below it.
  contentSafeArea: {
    paddingBlockEnd:
      'calc(var(--container-padding-block-end, 0px) + env(safe-area-inset-bottom, 0px))',
  },
});

const dynamicStyles = stylex.create({
  // Width budget: the `width` prop on desktop, a share of the viewport below
  // the mobile breakpoint. maxWidth keeps a large desktop budget from
  // overflowing a narrow window.
  inlineSize: (desktopWidth: string, mobileWidth: string) => ({
    width: {
      default: desktopWidth,
      [`@media (max-width: ${MOBILE_BREAKPOINT}px)`]: mobileWidth,
    },
    maxWidth: '100dvw',
  }),
});

// =============================================================================
// Types
// =============================================================================

export interface DrawerProps extends BaseProps<HTMLDialogElement> {
  /** Ref forwarded to the root <dialog> element */
  ref?: React.Ref<HTMLDialogElement>;

  /**
   * Whether the drawer is open. Fully controlled — pair with `onOpenChange`.
   */
  isOpen: boolean;

  /**
   * Called when the drawer requests an open-state change. Escape and a scrim
   * click call it with `false` as `purpose` allows; a `DrawerHeader` close
   * button calls it when you pass the same callback to the header. The caller
   * owns the open state. When sibling drawers are open, Escape only closes the
   * top (last-opened) drawer.
   */
  onOpenChange: (isOpen: boolean) => void;

  /**
   * Which edge the drawer slides from.
   * - `'end'` — inline-end edge (right in LTR) — the inspector convention
   * - `'start'` — inline-start edge (left in LTR)
   * @default 'end'
   */
  side?: 'start' | 'end';

  /**
   * Desktop width budget. A number is pixels; a string is any CSS length
   * (`'50%'`, `'32rem'`). Below the mobile breakpoint (640px), this
   * remains the maximum while the drawer preserves a 56px reveal of the page
   * behind — see `experimental.isFullWidthOnMobile`.
   * @default 400
   */
  width?: number | string;

  /**
   * Experimental options, outside the stable compatibility promise: anything
   * in this object may change or be removed in a patch release. Omit it for
   * the stable behavior.
   * @experimental
   */
  experimental?: {
    /**
     * Cover the full viewport width on mobile (below 640px) instead of
     * preserving the default 56px reveal of the page behind. The reveal makes
     * the drawer read as an overlay rather than a navigation.
     * @experimental
     * @default false
     */
    isFullWidthOnMobile?: boolean;
  };

  /**
   * Accessible label for the drawer (required — the drawer has no
   * built-in heading to derive a name from).
   */
  label: string;

  /**
   * Whether to render a modal scrim behind the drawer.
   * - `true` (default) — `showModal()`: top layer, focus trap, body scroll
   *   lock, click-outside-to-close.
   * - `false` — `showPopover()`: non-modal top-layer overlay; the page behind
   *   stays interactive. Escape still closes through the shared layer stack.
   * @default true
   */
  hasScrim?: boolean;

  /**
   * Configures how the drawer enables dismissals, matching Dialog.
   * - required: Disables Escape and scrim click (for mandatory flows); a
   *   modal required drawer is exposed as an `alertdialog`
   * - form: Prevents scrim click, allows the Escape key
   * - info: Allows Escape and scrim click
   *
   * A non-modal drawer has no scrim, so `form` and `info` behave the same.
   * @default 'info'
   */
  purpose?: DialogPurpose;

  /**
   * Internal padding of the drawer content using the spacing scale, matching
   * Dialog. Accepts numeric spacing steps: 0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8,
   * 10. When omitted, uses the theme default for drawers (`--spacing-4`, 16px,
   * unless the theme sets `padding` on `drawer`), as Dialog does. Pass `0` for
   * a full-bleed content area. The content area is a container: a Section that
   * is its only child escapes the padding, bleed children such as Table and
   * Divider compensate against it, and a Layout picks it up for its regions.
   */
  padding?: SpacingStep;

  /**
   * Drawer content. Rendered inside a full-height scrollable area.
   * Focus the element with `data-autofocus` on open, if present.
   */
  children: ReactNode;

  /**
   * Test ID for the root element.
   */
  'data-testid'?: string;
}

// =============================================================================
// Component
// =============================================================================

/**
 * An overlay panel for inspectors and detail views.
 *
 * Slides in from the logical start or end edge and floats above the page
 * using the native `<dialog>` element: modal with a scrim by default, or a
 * non-modal overlay with `hasScrim={false}` that leaves the page behind
 * interactive. `width` is the desktop budget; below 640px the panel preserves
 * a 56px page reveal without exceeding that budget (or fills the viewport
 * with the experimental `experimental.isFullWidthOnMobile`). Escape
 * closes the top-most open drawer; focus returns to the element that
 * opened it.
 *
 * Dismissal matches Dialog: `purpose` decides whether Escape and a scrim click
 * close the drawer, and `DrawerHeader` renders a close button when given
 * `onOpenChange`.
 *
 * Like Dialog, the drawer is a container: `padding` (or a theme's `padding`
 * on `drawer`) insets the content area, a lone Section child escapes that
 * inset, and a Layout inside picks it up for its header, content, and footer
 * regions. The default inset is `--spacing-4`, matching Dialog.
 *
 * @example
 * ```
 * const [selected, setSelected] = useState(null);
 * const handleOpenChange = isOpen => !isOpen && setSelected(null);
 * <Drawer
 *   isOpen={selected != null}
 *   onOpenChange={handleOpenChange}
 *   label={`Details: ${selected?.name}`}>
 *   <Layout
 *     header={<DrawerHeader title={selected?.name} onOpenChange={handleOpenChange} />}
 *     content={<LayoutContent><HostDetails host={selected} /></LayoutContent>}
 *   />
 * </Drawer>
 * ```
 */
export function Drawer({
  isOpen,
  onOpenChange,
  side = 'end',
  width = 400,
  experimental,
  label,
  hasScrim = true,
  purpose = 'info',
  padding,
  children,
  xstyle,
  className,
  style,
  onClick: onClickProp,
  onKeyDown: onKeyDownProp,
  ref,
  ...props
}: DrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const {containerRef: focusTrapRef} = useFocusTrap<HTMLDialogElement>({
    isActive: isOpen && hasScrim,
  });
  const mergedDialogRef = useMergedRefs(ref, dialogRef, focusTrapRef);
  // Derive dismissal behavior from purpose, as Dialog does.
  const allowEscape = purpose !== 'required';
  const allowScrimClick = purpose === 'info';
  // Same lowering as Dialog: with no padding prop the content area reads the
  // theme's --astryx-drawer-padding chain (--spacing-4 when unset), else the
  // explicit step.
  const usesThemePadding = padding == null;
  const effectivePadding = padding ?? 4;
  const paddingToken = spacingStepToToken[effectivePadding] as SpacingToken;
  // Whether the panel paints: true while open and for the whole slide-out.
  const [isRendered, setIsRendered] = useState(isOpen);

  // Adjusted during render, not in an effect: the panel has to be rendered in
  // the same commit that targets the open transform, or @starting-style has
  // nothing to animate from.
  if (isOpen && !isRendered) {
    setIsRendered(true);
  }

  useDrawerDialogPresence({
    dialogRef,
    isOpen,
    isModal: hasScrim,
    setIsRendered,
  });

  const handleDismiss = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  // The shared stack owns Escape delivery across every overlay family. The
  // provider below gives layers opened from Drawer content a greater logical
  // depth even when they render elsewhere in the DOM or browser top layer.
  const {shouldDismissOnCloseRequest} = useLayerDismissal({
    // The native host stays present through the slide-out. Keep this entry on
    // the stack until the same commit that hides the host, so a second Escape
    // cannot fall through to a lower layer during the exit animation.
    isActive: isRendered,
    // A `required` drawer consumes Escape without closing, so the press cannot
    // fall through and dismiss a layer behind it either.
    escapeBehavior: allowEscape ? 'close' : 'block',
    onDismiss: handleDismiss,
    getContainer: () => dialogRef.current,
  });

  // Lock body scroll while a modal drawer is open (iOS Safari workaround).
  useScrollLock(isOpen && hasScrim);

  // A modal dialog's native cancel event is a platform close request (for
  // example Android Back). Keep controlled state authoritative and apply the
  // same top-most/IME rules as the shared Escape listener.
  const handleCancel = useCallback(
    (event: React.SyntheticEvent<HTMLDialogElement>) => {
      event.preventDefault();
      if (shouldDismissOnCloseRequest() && allowEscape) {
        handleDismiss();
      }
    },
    [allowEscape, handleDismiss, shouldDismissOnCloseRequest],
  );

  // Clicks on the ::backdrop target the <dialog> element itself; clicks on
  // drawer content always target a child (the content area fills the panel).
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLDialogElement>) => {
      if (event.target === event.currentTarget && hasScrim && allowScrimClick) {
        onOpenChange(false);
      }
    },
    [allowScrimClick, hasScrim, onOpenChange],
  );

  const widthValue = typeof width === 'number' ? `${width}px` : width;
  const isFullWidthOnMobile = experimental?.isFullWidthOnMobile ?? false;
  const mobileWidth = isFullWidthOnMobile
    ? MOBILE_WIDTH_FULL
    : `min(${widthValue}, calc(100dvw - ${MOBILE_PAGE_REVEAL}px))`;

  // The side the panel is ANCHORED to, which is the side it must slide back
  // out to. Latched at open, because a consumer commonly derives `side` from
  // the same state that drives `isOpen` (`side={selected?.side ?? 'end'}`):
  // that state clears on close, so the live prop flips mid-exit and the panel
  // teleports to the other edge and slides out the wrong way. Children stay
  // mounted for the exit for the same reason; so does the anchor.
  const exitSideRef = useRef(side);
  if (isOpen) {
    exitSideRef.current = side;
  }
  const anchoredSide = isOpen ? side : exitSideRef.current;

  const sideStyle = anchoredSide === 'start' ? styles.start : styles.end;
  const sideOpenStyle =
    anchoredSide === 'start' ? styles.startOpen : styles.endOpen;

  // Filter out native `open` to prevent InvalidStateError when passed
  const {open: _open, ...safeProps} = props as Record<string, unknown>;

  return (
    <dialog
      ref={mergedDialogRef}
      {...mergeProps(
        themeProps('drawer', {side: anchoredSide}),
        stylex.props(
          layerTextReset.reset,
          layerStructureReset.reset,
          styles.dialog,
          overlayPaddingReset.reset,
          sideStyle,
          dynamicStyles.inlineSize(widthValue, mobileWidth),
          isRendered && styles.rendered,
          isOpen && sideOpenStyle,
          hasScrim && styles.scrim,
          hasScrim && isOpen && styles.scrimOpen,
          xstyle,
        ),
        className,
        style,
      )}
      {...safeProps}
      popover={hasScrim ? undefined : 'manual'}
      aria-label={label}
      aria-modal={hasScrim ? 'true' : undefined}
      {...(purpose === 'required' && hasScrim
        ? {role: 'alertdialog'}
        : undefined)}
      onClick={composeEventHandlers(onClickProp, handleClick)}
      onKeyDown={onKeyDownProp}
      onCancel={handleCancel}>
      <ModalAnnounceProvider dialogRef={dialogRef} isOpen={isOpen && hasScrim}>
        <LayerDepthProvider>
          <LayerContentBoundary>
            {/* Scrollable content area — tabIndex so the dialog's focusing steps
              land on the panel body rather than the first button inside. */}
            <div
              tabIndex={-1}
              {...stylex.props(
                styles.content,
                ...container(
                  usesThemePadding
                    ? {useThemeDefault: 'drawer'}
                    : {
                        paddingInnerX: paddingToken,
                        paddingInnerY: paddingToken,
                        paddingOuterX: paddingToken,
                        paddingOuterY: paddingToken,
                      },
                ),
                !usesThemePadding &&
                  effectivePadding !== 4 &&
                  paddingStyles[effectivePadding],
                !usesThemePadding &&
                  effectivePadding !== 4 &&
                  containerPaddingInlineVarStyles[effectivePadding],
                !usesThemePadding &&
                  effectivePadding !== 4 &&
                  containerPaddingBlockStartVarStyles[effectivePadding],
                !usesThemePadding &&
                  effectivePadding !== 4 &&
                  containerPaddingBlockEndVarStyles[effectivePadding],
                styles.contentSafeArea,
              )}>
              {children}
            </div>
          </LayerContentBoundary>
        </LayerDepthProvider>
      </ModalAnnounceProvider>
    </dialog>
  );
}

Drawer.displayName = 'Drawer';
