// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file MobileNav.tsx
 * @input Uses React, useEffect, useRef, useCallback, ReactNode, StyleX
 * @output Exports MobileNav component and MobileNavProps
 * @position Core implementation; consumed by index.ts
 *
 * Full-height slide-out drawer overlay for mobile navigation.
 * The mobile counterpart to SideNav — accepts the same children
 * (SideNavSection, SideNavItem, or any ReactNode). The drawer is never wider
 * than 85% of the viewport, so a strip of the page stays beside it to tap.
 *
 * Uses the native `<dialog>` element with `showModal()` for top-layer rendering.
 * This eliminates z-index stacking issues — the drawer renders above everything
 * without manual z-index management. The browser provides:
 * - Top layer promotion (no z-index needed)
 * - `::backdrop` pseudo-element
 * - Body scroll lock
 * - Focus trapping
 *
 * Escape is owned by the shared dismissal stack (`useLayerDismissal`), so a
 * drawer opened over another layer takes the press and nothing behind it
 * closes. The native `cancel` event still handles the dismissals the browser
 * starts itself, such as the Android back gesture.
 *
 * Focus RESTORATION is not delegated to the browser. The drawer captures the
 * element that opened it and refocuses it once the native dialog has closed,
 * mirroring Dialog: the implicit `<dialog>` restore has been observed dropping
 * focus to `<body>`. The close itself is deferred past the slide-out, and the
 * restore has to follow it. Until close() runs the rest of the document is
 * inert and focus() on the opener is silently dropped.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/MobileNav/index.ts (exports if types change)
 * - /packages/core/src/Layer/useLayerDismissal.ts (dismissal stack)
 * - /packages/core/src/hooks/scrollbarGutter.ts (shared scroll-lock gutter)
 * - /packages/cli/assets/templates/blocks/components/MobileNav/ (showcase blocks)
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  borderVars,
  colorVars,
  durationVars,
  easeVars,
  spacingVars,
} from '../theme/tokens.stylex';
import {Button} from '../Button';
import {Icon} from '../Icon';
import {Heading} from '../Heading/Heading';
import {useAppShellMobile} from '../AppShell/AppShellMobileContext';
import {
  holdScrollbarGutter,
  type ScrollbarGutterHold,
} from '../hooks/scrollbarGutter';
import {mergeProps, composeEventHandlers} from '../utils';
import {layerTextReset} from '../Layer/layerTextReset.stylex';
import {layerStructureReset} from '../Layer/layerStructureReset.stylex';
import {LayerContentBoundary} from '../Layer/layerScopedContext';
import {overlayPaddingReset} from '../Layout/padding.stylex';
import {LayerDepthProvider} from '../Layer/LayerDepthContext';
import {useLayerDismissal} from '../Layer/useLayerDismissal';
import type {BaseProps} from '../BaseProps';
import {themeProps} from '../utils/themeProps';
import {useTranslator} from '../i18n';

import {useMergedRefs} from '../hooks/useMergedRefs';
// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  dialog: {
    // Reset native <dialog> defaults
    position: 'fixed',
    margin: 0,
    padding: 0,
    borderWidth: 0,
    borderStyle: 'none',
    maxWidth: 'none',
    maxHeight: 'none',
    // Full viewport overlay — the dialog itself is the full-screen container
    inset: 0,
    width: '100vw',
    height: '100dvh',
    backgroundColor: 'transparent',
    // `clip`, not `hidden`. Both clip the off-screen drawer, but `hidden` makes
    // the dialog a SCROLL CONTAINER, and a scroll container in the top layer
    // whose subtree holds another scroller (the drawer's content area) does not
    // paint a @starting-style entry transition for its descendants in Chromium:
    // the transition ticks in the CSSOM while every painted frame shows the
    // end value, so the drawer appears fully open. `clip` clips without
    // creating a scroll container and the slide-in paints normally. The dialog
    // never scrolls anyway — its child is absolutely positioned — so nothing
    // depended on it being a scroll container.
    overflow: 'clip',
    overscrollBehavior: 'contain',
    // Stop pans passing through (pull-to-refresh, background scroll), but
    // leave pinch to the browser: the open nav covers the whole viewport, and
    // pinch-zoom is how phone readers resize text (WCAG 1.4.4).
    touchAction: 'pinch-zoom',
    outline: 'none',
    // Native <dialog> uses display:none when closed.
    // Open state applied via isOpen prop to avoid :where([open]) specificity issues.
    // `display` participates in the transition with allow-discrete so it flips
    // to none only after the slide-out finishes. That also keeps the dialog
    // rendered until close() has actually run: an open modal dialog that isn't
    // rendered still blocks the whole document, and a browser that fails to
    // un-block it on close leaves the page inert with no error (#4290).
    // Deliberately not shortened under reduced motion: `display` is discrete,
    // so a long hold animates nothing — it is only the window the close has to
    // land inside. The visible transitions (the drawer's transform and the
    // backdrop's opacity) are the ones that respect the preference.
    display: 'none',
    transitionProperty: 'display',
    transitionDuration: durationVars['--duration-medium'],
    transitionBehavior: 'allow-discrete',
  },
  open: {
    display: 'flex',
  },
  // ::backdrop is provided by the browser's top layer
  backdrop: {
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
  backdropOpen: {
    '::backdrop': {
      // The ::backdrop only exists once showModal() has put the dialog in the
      // top layer, so its first rendered frame already has the open opacity.
      // Without a starting style there is no earlier value to transition from
      // and the scrim snaps in — @starting-style supplies that value.
      opacity: {
        default: 1,
        '@starting-style': 0,
      },
    },
  },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: colorVars['--color-background-surface'],
    boxSizing: 'border-box',
    overflow: 'hidden',
    transitionProperty: 'transform',
    transitionDuration: durationVars['--duration-medium'],
    transitionTimingFunction: easeVars['--ease-standard'],
    outline: 'none',
    '@media (prefers-reduced-motion: reduce)': {
      transitionDuration: '0.01s',
    },
  },
  drawerStart: {
    insetInlineStart: 0,
    borderInlineEndWidth: borderVars['--border-width'],
    borderInlineEndStyle: 'solid',
    borderInlineEndColor: colorVars['--color-border'],
    transform: {
      default: 'translateX(-100%)',
      ':is([dir="rtl"] *)': 'translateX(100%)',
    },
  },
  drawerStartOpen: {
    // The whole dialog is `display: none` while closed, so the drawer is not
    // rendered and the open transform is the only value it has ever had — a
    // transition needs a previous value to run from. @starting-style gives the
    // first rendered frame the off-screen transform, so the slide-in plays.
    transform: {
      default: 'translateX(0)',
      '@starting-style': {
        default: 'translateX(-100%)',
        ':is([dir="rtl"] *)': 'translateX(100%)',
      },
    },
  },
  drawerEnd: {
    insetInlineEnd: 0,
    borderInlineStartWidth: borderVars['--border-width'],
    borderInlineStartStyle: 'solid',
    borderInlineStartColor: colorVars['--color-border'],
    transform: {
      default: 'translateX(100%)',
      ':is([dir="rtl"] *)': 'translateX(-100%)',
    },
  },
  drawerEndOpen: {
    // See drawerStartOpen — same starting style, mirrored edge.
    transform: {
      default: 'translateX(0)',
      '@starting-style': {
        default: 'translateX(100%)',
        ':is([dir="rtl"] *)': 'translateX(-100%)',
      },
    },
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: spacingVars['--spacing-12'],
    paddingInline: spacingVars['--spacing-2'],
    flexShrink: 0,
    borderBlockEndWidth: borderVars['--border-width'],
    borderBlockEndStyle: 'solid',
    borderBlockEndColor: colorVars['--color-border'],
  },
  headerNoTitle: {
    justifyContent: 'flex-end',
  },
  headerText: {
    marginInlineStart: spacingVars['--spacing-1'],
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden',
    overscrollBehavior: 'contain',
    // Re-enable vertical touch scrolling inside the drawer content (the
    // dialog root allows only pinch-zoom, to block pull-to-refresh)
    touchAction: 'pan-y pinch-zoom',
    paddingInline: spacingVars['--spacing-2'],
    paddingBlock: spacingVars['--spacing-2'],
  },
});

const dynamicStyles = stylex.create({
  // The requested width, never more than 85 % of the viewport: on a narrow
  // phone a strip of the page stays visible beside the drawer, as a target
  // for the tap that closes it.
  width: (w: number) => ({
    width: `${w}px`,
    maxWidth: '85vw',
  }),
});

// =============================================================================
// Close timing
// =============================================================================

/**
 * Longest the drawer will wait before closing, however long the hold is.
 *
 * Exported so `AppShell` can defer hiding this drawer's `Activity` boundary
 * by at least this long too (`ACTIVITY_HIDE_BUFFER_MS` in AppShell.tsx) —
 * otherwise Activity's `display: none !important` lands before this delay's
 * own scheduled `dialog.close()` has a chance to run (#5701).
 */
export const MAX_CLOSE_DELAY_MS = 250;
/** Fraction of the hold to close at, so the close never lands on its boundary. */
const CLOSE_WITHIN_HOLD = 0.6;

/**
 * Shortest duration in a `transition-duration` list, in ms; null if unreadable.
 *
 * Browsers serialise computed `<time>` values in seconds — an authored `410ms`
 * reads back as `"0.41s"` and a list as `"0.41s, 0.12s"` — so the seconds branch
 * is the one that runs outside tests. jsdom echoes an inline `250ms` back as-is
 * and never resolves `var()`, so both units and the unreadable case are covered
 * directly in MobileNavCloseTiming.test.ts rather than through the component.
 *
 * @internal Exported for unit tests.
 */
export function parseShortestDurationMs(value: string): number | null {
  const durations = value
    .split(',')
    .map(part => {
      const trimmed = part.trim();
      const ms = Number.parseFloat(trimmed);
      if (!Number.isFinite(ms)) {
        return null;
      }
      return trimmed.endsWith('ms')
        ? ms
        : trimmed.endsWith('s')
          ? ms * 1000
          : null;
    })
    .filter((ms): ms is number => ms !== null);

  return durations.length ? Math.min(...durations) : null;
}

/**
 * How long to wait before closing the native dialog.
 *
 * The drawer is only rendered for as long as its `display` transition runs, and
 * closing an unrendered modal dialog is what leaves the page inert (#4290). So
 * the close has to land inside that hold. The hold is `--duration-medium`,
 * which themes rewrite — the shipped y2k theme sets it to exactly 250ms — so
 * read the hold in effect rather than assuming it.
 */
function resolveCloseDelay(dialog: HTMLDialogElement): number {
  // Reduced motion makes the close sooner; it must not make the hold shorter.
  // Shrinking both leaves no slack — one slow frame between the commit and this
  // macrotask and the drawer has already stopped being rendered.
  const cap = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 0
    : MAX_CLOSE_DELAY_MS;

  const hold = parseShortestDurationMs(
    window.getComputedStyle(dialog).transitionDuration,
  );

  // The hold is unreadable — an unresolved var() outside a real browser.
  if (hold === null) {
    return cap;
  }

  return hold <= 0 ? 0 : Math.min(cap, hold * CLOSE_WITHIN_HOLD);
}

/**
 * Close the native dialog, then return focus to the element that opened it.
 *
 * Browsers are supposed to restore focus themselves when a modal <dialog>
 * closes, but that has been observed to fail (focus lands on <body>), so the
 * drawer does it explicitly, as Dialog does. The order is load-bearing: while
 * the modal dialog holds the top layer the rest of the document is inert and
 * focus() on the opener is silently dropped. So the restore rides on the close
 * itself, wherever that happens (the delayed timer, or the unmount teardown),
 * not on the `isOpen` flip that only schedules it.
 *
 * Focus is left alone when there was no real opener (activeElement was <body>)
 * or the opener has since left the DOM: focusing <body> would blur whatever a
 * router moved focus to, and a detached node cannot take focus.
 */
function closeAndRestoreFocus(
  dialog: HTMLDialogElement,
  openerRef: RefObject<HTMLElement | null>,
): void {
  dialog.close();
  const opener = openerRef.current;
  openerRef.current = null;
  if (!opener || opener === document.body || !opener.isConnected) {
    return;
  }
  opener.focus();
}

// =============================================================================
// Types
// =============================================================================

export interface MobileNavProps extends Omit<BaseProps, 'title'> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLDialogElement>;
  /**
   * Whether the drawer is open.
   * Inside AppShell, this is managed automatically via context.
   * Outside AppShell, provide this prop to control the drawer yourself.
   */
  isOpen?: boolean;

  /**
   * Callback fired when the drawer visibility changes.
   * Called with `false` when the drawer should close
   * (backdrop click, escape, close button).
   * Inside AppShell, this is managed automatically via context.
   * Outside AppShell, provide this prop to control the drawer yourself.
   */
  onOpenChange?: (isOpen: boolean) => void;

  /**
   * Drawer content — typically SideNavSection/SideNavItem, or any ReactNode.
   */
  children: ReactNode;

  /**
   * Header content for the drawer. Rendered next to the close button.
   * Pass a string for a simple text heading, or a ReactNode for
   * custom content (logo, SideNavHeading, search bar, etc.).
   */
  header?: ReactNode;

  /**
   * Width of the drawer in pixels.
   * @default 320
   */
  width?: number;

  /**
   * Which side the drawer slides from.
   * - `'start'` — slides from the inline-start edge (left in LTR)
   * - `'end'` — slides from the inline-end edge (right in LTR)
   * - `'auto'` — determined by the trigger element's position: if the
   *   toggle is in the start half of the viewport the drawer opens from
   *   start, otherwise from end.
   * @default 'auto'
   */
  side?: 'start' | 'end' | 'auto';

  /**
   * Accessible label for the drawer. Falls back to header string, then 'Navigation'.
   */
  label?: string;

  /**
   * Test ID for the root element.
   */
  'data-testid'?: string;
}

// =============================================================================
// Component
// =============================================================================

/**
 * A slide-out drawer overlay for mobile navigation.
 *
 * The mobile counterpart to SideNav. Renders a full-height drawer that slides
 * in from the start (left in LTR) or end (right in LTR) edge of the viewport,
 * with a semi-transparent backdrop behind it.
 *
 * Uses the native `<dialog>` element with `showModal()` for top-layer rendering,
 * which provides built-in focus trapping, body scroll lock, and `::backdrop`.
 * No manual z-index needed — the browser's top layer handles stacking.
 *
 * When used inside AppShell, `isOpen` and `onOpenChange` are managed
 * automatically via context. When used standalone, provide them as props.
 *
 * @example
 * ```
 * <AppShell mobileNav={
 *   <MobileNav header="Navigation">
 *     <SideNavItem label="Home" href="/" />
 *   </MobileNav>
 * }>
 * <MobileNav isOpen={isOpen} onOpenChange={setIsOpen} header="Navigation">
 *   <SideNavItem label="Home" href="/" />
 * </MobileNav>
 * ```
 */
export function MobileNav({
  isOpen: isOpenProp,
  onOpenChange: onOpenChangeProp,
  children,
  header,
  width = 320,
  side = 'auto',
  label,
  'data-testid': testId,
  xstyle,
  className,
  style,
  onClick: onClickProp,
  ref,
  ...rest
}: MobileNavProps) {
  const t = useTranslator();
  // Read from AppShell context as fallback
  const appShellMobile = useAppShellMobile();
  const isOpen = isOpenProp ?? appShellMobile.isMobileNavOpen;
  // Share the id from AppShell context so the toggle's aria-controls resolves to
  // this drawer; fall back to a locally generated id when used standalone.
  const fallbackId = useId();
  const dialogId = appShellMobile.mobileNavId || fallbackId;
  const onOpenChange = useMemo(
    () =>
      onOpenChangeProp ??
      ((open: boolean) => {
        if (open) {
          appShellMobile.openMobileNav();
        } else {
          appShellMobile.closeMobileNav();
        }
      }),
    [onOpenChangeProp, appShellMobile],
  );

  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);
  // Element that was focused when the drawer opened; focus goes back to it
  // once the native dialog has closed (see closeAndRestoreFocus).
  const triggerElementRef = useRef<HTMLElement | null>(null);

  // Keeps the dialog rendered from the commit that closes it until the delayed
  // `close()` below has run. The `display` transition on the dialog is meant to
  // do this, but a browser that does not hold a discrete `display` transition
  // (WebKit) drops the dialog to `display: none` at once while it is still an
  // open modal: nothing is visible, yet the whole page stays inert until the
  // timer fires. Set during render, so it is already true in the commit that
  // closes. The drawer's transform and the backdrop stay keyed to `isOpen`, so
  // the slide-out is unchanged.
  const [isCloseHeld, setIsCloseHeld] = useState(false);
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen);
    setIsCloseHeld(!isOpen);
  }
  const gutterRef = useRef<ScrollbarGutterHold | null>(null);

  // Gives back the gutter held open in place of the hidden scrollbar.
  const releaseGutter = useCallback(() => {
    if (gutterRef.current) {
      gutterRef.current.release();
      gutterRef.current = null;
    }
  }, []);
  // Resolved side — computed from trigger position when side='auto'
  const [resolvedSide, setResolvedSide] = useState<'start' | 'end'>(
    side === 'auto' ? 'end' : side,
  );

  // Resolve which edge the drawer slides from. Deliberately its own effect,
  // declared before the open/close effect below so the trigger is still the
  // active element when `side='auto'` reads it. Keeping it out of that effect
  // is what stops a `side` change during a close from re-arming the delay: the
  // CSS hold runs from the commit that started the slide-out and does not
  // restart, so a fresh full delay could land after the drawer had already
  // stopped being rendered — #4290 again.
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (side === 'auto') {
      const trigger = document.activeElement as HTMLElement | null;
      if (trigger && trigger !== document.body) {
        const rect = trigger.getBoundingClientRect();
        const triggerCenter = rect.left + rect.width / 2;
        // eslint-disable-next-line @eslint-react/set-state-in-effect -- side is resolved from trigger layout immediately before showModal()
        setResolvedSide(
          triggerCenter < window.innerWidth / 2 ? 'start' : 'end',
        );
      }
    } else {
      // eslint-disable-next-line @eslint-react/set-state-in-effect -- side prop changes must update the open dialog placement
      setResolvedSide(side);
    }
  }, [isOpen, side]);

  // Open/close the dialog via showModal()/close()
  // close() is delayed so the slide-out transition can play.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (isOpen) {
      // Taken first: every mutation below is one that can hide the scrollbar,
      // and the gutter has to be measured while it is still there.
      gutterRef.current ??= holdScrollbarGutter(document.documentElement);

      if (!dialog.open) {
        // Capture the opener before showModal() pulls focus into the top
        // layer. Only on the transition into open: a reopen while the delayed
        // close is still pending finds the dialog open, and must keep the
        // original opener rather than whatever is focused inside the drawer.
        triggerElementRef.current =
          document.activeElement as HTMLElement | null;
        dialog.showModal();
      }
      // Prevent background scrolling and iOS pull-to-refresh.
      // overflow: clip avoids creating a scroll container (unlike hidden),
      // so there's no scroll bounce and no need to save/restore scroll position.
      document.documentElement.style.overflow = 'clip';
      gutterRef.current.settle();
    } else if (dialog.open) {
      document.documentElement.style.overflow = '';
      releaseGutter();

      closeTimeoutRef.current = setTimeout(() => {
        closeAndRestoreFocus(dialog, triggerElementRef);
        setIsCloseHeld(false);
      }, resolveCloseDelay(dialog));
    } else {
      // Nothing is open, so there is no close to hold the dialog for, and no
      // close timer is left to release the hold.
      setIsCloseHeld(false);
    }

    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
      document.documentElement.style.overflow = '';
      releaseGutter();
    };
  }, [isOpen, releaseGutter]);

  // Close the native dialog on unmount if it's still open. Inside AppShell the
  // drawer is mounted in an <Activity> that switches to mode="hidden" when the
  // drawer closes; React then runs effect cleanups (with a stale isOpen)
  // instead of re-running the effect with isOpen=false, so the close branch
  // above never fires. If we leave the <dialog> `open` here, showModal() is
  // skipped on the next open (the dialog is already open in the hidden tree)
  // and the drawer can never be re-opened — see MobileNavReopen.test.tsx.
  // This must be a separate unmount-only effect: putting it in the open/close
  // effect above would close the dialog on every isOpen flip and cut off the
  // delayed slide-out close.
  //
  // Inside AppShell this teardown is the only close the drawer ever gets, so
  // it is also where focus goes back to the toggle.
  useEffect(() => {
    const dialog = dialogRef.current;
    return () => {
      if (dialog?.open) {
        closeAndRestoreFocus(dialog, triggerElementRef);
      }
    };
  }, []);

  const {shouldDismissOnCloseRequest} = useLayerDismissal({
    isActive: isOpen,
    onDismiss: () => onOpenChange(false),
    // The dialog's document is this layer's: rendered into an iframe or a
    // Picture-in-Picture window, it ranks with the layers opened inside it.
    getContainer: () => dialogRef.current,
  });

  // The native `cancel` event is the browser's own close-watcher firing: an
  // Android back gesture, or a close request the stack never saw a press for.
  // Escape presses the stack owns never arrive here — it preventDefault()s
  // those, which suppresses the close watcher.
  //
  // Always preventDefault so the browser cannot close a controlled <dialog>
  // behind React's back, then answer with the stack's own rules: top-most
  // only, and never while an IME composition is in progress.
  const handleCancel = useCallback(
    (event: React.SyntheticEvent<HTMLDialogElement>) => {
      event.preventDefault();
      if (!shouldDismissOnCloseRequest()) {
        return;
      }
      onOpenChange(false);
    },
    [onOpenChange, shouldDismissOnCloseRequest],
  );

  // Handle clicks on the dialog backdrop area (outside the drawer)
  const handleDialogClick = useCallback(
    (event: React.MouseEvent<HTMLDialogElement>) => {
      // Only close if click was directly on the dialog element (the transparent overlay),
      // not on the drawer or its children
      if (event.target === event.currentTarget) {
        onOpenChange(false);
      }
    },
    [onOpenChange],
  );

  const isStart = resolvedSide === 'start';

  return (
    <dialog
      ref={useMergedRefs(ref, dialogRef)}
      id={dialogId}
      {...mergeProps(
        themeProps('mobile-nav', {side: resolvedSide}),
        stylex.props(
          layerTextReset.reset,
          layerStructureReset.reset,
          styles.dialog,
          overlayPaddingReset.reset,
          (isOpen || isCloseHeld) && styles.open,
          styles.backdrop,
          isOpen && styles.backdropOpen,
          xstyle,
        ),
        className,
        style,
      )}
      {...rest}
      data-testid={testId}
      aria-label={
        label ??
        (typeof header === 'string'
          ? header
          : t('@astryx.mobileNav.navigation'))
      }
      onClick={composeEventHandlers(onClickProp, handleDialogClick)}
      onCancel={handleCancel}>
      <LayerDepthProvider>
        <LayerContentBoundary>
          {/* Drawer panel — tabIndex so showModal() focuses the drawer, not the close button */}
          <div
            tabIndex={-1}
            {...stylex.props(
              styles.drawer,
              dynamicStyles.width(width),
              isStart && styles.drawerStart,
              isStart && isOpen && styles.drawerStartOpen,
              !isStart && styles.drawerEnd,
              !isStart && isOpen && styles.drawerEndOpen,
            )}>
            {/* Header — content + close button */}
            <div
              {...stylex.props(styles.header, !header && styles.headerNoTitle)}>
              {typeof header === 'string' ? (
                <Heading level={2} xstyle={styles.headerText}>
                  {header}
                </Heading>
              ) : (
                (header ?? null)
              )}
              <Button
                variant="ghost"
                label={t('@astryx.mobileNav.closeNavigation')}
                icon={<Icon icon="close" color="inherit" />}
                onClick={() => onOpenChange(false)}
                isIconOnly
              />
            </div>

            {/* Scrollable content */}
            <div {...stylex.props(styles.content)}>{children}</div>
          </div>
        </LayerContentBoundary>
      </LayerDepthProvider>
    </dialog>
  );
}

MobileNav.displayName = 'MobileNav';
