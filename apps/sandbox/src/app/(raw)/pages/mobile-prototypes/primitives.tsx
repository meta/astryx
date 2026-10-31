// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file primitives.tsx
 * @position Prototype-only building blocks for the Mobile Interaction Prototypes
 *   gallery. These are NOT shipping components — they exist purely to communicate
 *   the *expected* mobile interactions (bottom sheet, edge drawer)
 *   to engineering before the real primitives land in @astryxdesign/core.
 * @input open/onClose state, height mode, children
 * @output Animated mobile surfaces scoped to a PhoneFrame screen
 */

'use client';

import {
  Fragment,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Text, Heading} from '@astryxdesign/core/Text';
import {Item} from '@astryxdesign/core/Item';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Button} from '@astryxdesign/core/Button';
import {Divider} from '@astryxdesign/core/Divider';
import {VStack} from '@astryxdesign/core/Stack';
import {Field, inputWrapperStyles} from '@astryxdesign/core/Field';
const proto = stylex.create({
  fullBtn: {width: '100%'},
  // Pull the command list out by the Item's spacious inline padding (12px) so
  // the command labels optically align with the sheet title / description.
  actionList: {
    marginInline: 'calc(-1 * var(--spacing-3))',
  },
  // Layered over the real XDS input wrapper chrome to turn it into a tappable
  // select-style trigger (full width, comfortable touch target, button reset).
  tapControl: {
    width: '100%',
    minHeight: 44,
    paddingInline: 12,
    cursor: 'pointer',
    appearance: 'none',
    fontFamily: 'inherit',
    fontSize: 15,
    textAlign: 'left',
  },
});

// =============================================================================
// Icons (inline, prototype-local)
// =============================================================================

type IconProps = React.SVGProps<SVGSVGElement>;
const base = (p: IconProps) => ({
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  width: 18,
  height: 18,
  ...p,
});
export const ChevronDown = (p: IconProps) => (
  <svg {...base(p)}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);
export const ChevronRight = (p: IconProps) => (
  <svg {...base(p)}>
    <polyline points="9 18 15 12 9 6" />
  </svg>
);
export const SearchIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);
export const CloseIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
export const CalendarIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);
export const DotsIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="5" r="1.6" />
    <circle cx="12" cy="12" r="1.6" />
    <circle cx="12" cy="19" r="1.6" />
  </svg>
);
export const FilterIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </svg>
);
export const PlusIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
export const MenuIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);
export const BackIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);
export const InfoIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);
export const CheckIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
export const TrashIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);

// =============================================================================
// Sheet presence: mount → animate in → animate out → unmount
// =============================================================================

function useSheetPresence(open: boolean) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = requestAnimationFrame(() =>
        requestAnimationFrame(() => setShown(true)),
      );
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
    return undefined;
  }, [open]);

  const onExited = useCallback(() => {
    if (!open) {
      setMounted(false);
    }
  }, [open]);

  return {mounted, shown, onExited};
}

// =============================================================================
// useBackToDismiss — Android back / edge-swipe closes the overlay
// =============================================================================
// On Android the system Back gesture (left-edge swipe) and Back button should
// dismiss the top-most overlay before navigating. On the web that maps to the
// History API: push an entry when the overlay opens so Back pops it (and calls
// onClose) instead of leaving the page. When the overlay is closed by other
// means (tap/drag), we pop our own entry so the history stack stays clean.

function useBackToDismiss(open: boolean, onClose: () => void) {
  const cb = useRef(onClose);
  cb.current = onClose;
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    window.history.pushState({__xdsSheet: true}, '');
    const onPop = () => cb.current();
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      const st = window.history.state as {__xdsSheet?: boolean} | null;
      if (st && st.__xdsSheet) {
        window.history.back();
      }
    };
  }, [open]);
}

// =============================================================================
// useSheetDrag — velocity-projected dismissal + scroll↔drag hand-off
// =============================================================================
// Phase 1 (gesture core): on release we project the sheet forward by its
// velocity (~PROJECT_MS of momentum) and dismiss if that projected offset
// passes the threshold — so a fast flick dismisses from any position while a
// slow drag springs back. Phase 2 (hand-off): the grabber always drags; the
// scrollable body only starts a sheet-drag when it's scrolled to the top and
// the finger moves *down*. Capture is deferred until movement exceeds SLOP so
// taps on options inside the body still fire their click.

const SLOP = 5; // px before a pointerdown becomes a drag
const PROJECT_MS = 300; // momentum window used to project the release position

// Optional multi-detent config. Each snap is either a fraction of the screen
// (0 < v <= 1, e.g. 0.92) or a fixed pixel height (v > 1, e.g. 316 for exactly
// one month). Pixel snaps stay a constant physical size across device heights —
// a fraction would drift and cut content differently on a taller phone. `index`
// is the current resting detent. Detents are modelled by animating the sheet's
// *height* (not by translating an oversized sheet), so the scroll viewport and
// safe-area always match the visible area. On release we velocity-project the
// height and snap to the nearest detent — or dismiss when fully-collapsed is
// closest.
type DetentConfig = {
  snaps: number[];
  index: number;
  onSettle: (index: number) => void;
};

// A snap > 1 is an absolute pixel height; <= 1 is a fraction of the container.
// Pixel heights are clamped so they can never exceed the container.
function resolveSnap(value: number, containerH: number): number {
  return value > 1 ? Math.min(value, containerH) : value * containerH;
}

function useSheetDrag(
  onClose: () => void,
  detent?: DetentConfig,
  dismissible = true,
) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [dragY, setDragY] = useState(0);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const d = useRef({
    startY: 0,
    lastY: 0,
    lastT: 0,
    v: 0,
    y: 0,
    pending: false,
    active: false,
    fromGrabber: false,
    containerH: 0,
    baseH: 0,
    dragH: 0,
  });

  const begin = (fromGrabber: boolean) => (e: ReactPointerEvent) => {
    if (e.button != null && e.button > 0) {
      return;
    }
    if (!fromGrabber && (scrollRef.current?.scrollTop ?? 0) > 0) {
      return;
    }
    d.current.pending = true;
    d.current.active = false;
    d.current.fromGrabber = fromGrabber;
    d.current.startY = e.clientY;
    d.current.lastY = e.clientY;
    d.current.lastT = performance.now();
    d.current.v = 0;
    if (detent) {
      const containerH = sheetRef.current?.parentElement?.clientHeight ?? 0;
      d.current.containerH = containerH;
      d.current.baseH = resolveSnap(detent.snaps[detent.index], containerH);
      d.current.dragH = d.current.baseH;
    }
  };

  const move = (e: ReactPointerEvent) => {
    const s = d.current;
    if (!s.pending && !s.active) {
      return;
    }
    const dy = e.clientY - s.startY;

    if (!s.active) {
      if (!s.fromGrabber) {
        // Content-initiated: only claim the gesture at the top, dragging down.
        if ((scrollRef.current?.scrollTop ?? 0) > 0 || dy < -SLOP) {
          s.pending = false;
          return;
        }
      }
      if (Math.abs(dy) < SLOP) {
        return;
      }
      s.active = true;
      setDragging(true);
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    }

    const now = performance.now();
    const dt = now - s.lastT;
    if (dt > 0) {
      s.v = (e.clientY - s.lastY) / dt;
    } // px/ms, + = downward
    s.lastY = e.clientY;
    s.lastT = now;
    if (detent) {
      // Detent mode: dragging down (dy>0) shrinks the sheet, dragging up grows
      // it. Height is clamped to the top detent; the bottom is pinned so the
      // scroll viewport always fits on-screen. When non-dismissible the
      // smallest detent is a hard min-height floor (a persistent peek).
      const maxH = resolveSnap(
        detent.snaps[detent.snaps.length - 1],
        s.containerH,
      );
      const minH = dismissible ? 0 : resolveSnap(detent.snaps[0], s.containerH);
      s.dragH = Math.max(minH, Math.min(maxH, s.baseH - dy));
      setDragHeight(s.dragH);
    } else {
      // Single-detent sheet: only drags down. Upward drag is pinned at rest.
      s.y = Math.max(0, dy);
      setDragY(s.y);
    }
  };

  const end = () => {
    const s = d.current;
    if (!s.active) {
      s.pending = false;
      return;
    }
    s.active = false;
    s.pending = false;
    setDragging(false);

    if (detent) {
      // Project the height forward by velocity, then snap to the nearest
      // detent — or dismiss when fully-collapsed (0) is closest.
      const projected = s.dragH - s.v * PROJECT_MS;
      let bestI = 0;
      let bestDist = Infinity;
      detent.snaps.forEach((f, i) => {
        const dist = Math.abs(projected - resolveSnap(f, s.containerH));
        if (dist < bestDist) {
          bestDist = dist;
          bestI = i;
        }
      });
      if (dismissible && Math.abs(projected) < bestDist) {
        onClose();
      } else if (bestI !== detent.index) {
        detent.onSettle(bestI);
      }
      setDragHeight(null);
    } else {
      const height = sheetRef.current?.offsetHeight ?? 480;
      const projected = Math.max(0, s.y) + Math.max(0, s.v) * PROJECT_MS;
      if (dismissible && projected > Math.max(72, height * 0.25)) {
        onClose();
      }
      setDragY(0);
      s.y = 0;
    }
  };

  const grabberHandlers = {
    onPointerDown: begin(true),
    onPointerMove: move,
    onPointerUp: end,
    onPointerCancel: end,
  };
  const bodyHandlers = {
    onPointerDown: begin(false),
    onPointerMove: move,
    onPointerUp: end,
    onPointerCancel: end,
  };

  return {
    dragY,
    dragHeight,
    dragging,
    sheetRef,
    scrollRef,
    grabberHandlers,
    bodyHandlers,
  };
}

// =============================================================================
// Scrim
// =============================================================================

function Scrim({
  shown,
  onClick,
  opacity,
  animate = true,
}: {
  shown: boolean;
  onClick: () => void;
  opacity?: number;
  animate?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--color-overlay)',
        opacity: shown ? (opacity ?? 1) : 0,
        transition: animate ? 'opacity 0.28s ease' : 'none',
        zIndex: 10,
      }}
    />
  );
}

// =============================================================================
// DragHandle (grabber)
// =============================================================================

export function DragHandle() {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        paddingTop: 8,
        paddingBottom: 4,
      }}>
      <div
        style={{
          width: 36,
          height: 5,
          borderRadius: 999,
          background: 'var(--color-border-emphasized)',
        }}
      />
    </div>
  );
}

// =============================================================================
// BottomSheet — the core mobile surface
// =============================================================================

export type SheetHeight = 'hug' | 'capped' | 'tall';

// Bottom safe-area inset. On notched iOS devices content must clear the home
// indicator; matches the HomeIndicator region drawn by PhoneFrame (+ breathing
// room) so sheet footers/rows never sit behind the pill.
const SAFE_AREA_BOTTOM = 28;

// Top safe-area inset — matches the StatusBar height drawn by PhoneFrame so a
// full-height drawer's header clears the clock / battery region.
const SAFE_AREA_TOP = 44;

export function BottomSheet({
  open,
  onClose,
  height = 'hug',
  title,
  headerAccessory,
  children,
  footer,
  snapPoints,
  defaultSnap = 0,
  scrim = true,
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  height?: SheetHeight;
  title?: ReactNode;
  headerAccessory?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Opt-in draggable detents as ascending fractions of the screen, e.g. [0.5, 0.92]. */
  snapPoints?: number[];
  /** Index of the detent the sheet opens at. Defaults to the lowest. */
  defaultSnap?: number;
  /**
   * Modal (default) dims the page behind a scrim and blocks interaction.
   * Set `false` for a non-modal sheet — no scrim, the page stays live behind
   * it, and only the grabber / Back dismiss it (there's nothing to tap out to).
   * A persistent peek (`snapPoints` + `dismissible={false}`) is always
   * non-modal regardless of this flag.
   */
  scrim?: boolean;
  /**
   * When `false` the sheet can't be dragged away. In detent mode the smallest
   * snap point becomes a persistent min-height floor (the Apple Maps / Music
   * "peek" bar); the drag clamps there instead of dismissing. This pattern
   * exists precisely so the background stays usable, so it forces non-modal.
   */
  dismissible?: boolean;
}) {
  const detentMode = Array.isArray(snapPoints) && snapPoints.length > 0;
  const [snapIndex, setSnapIndex] = useState(defaultSnap);
  const [containerH, setContainerH] = useState(0);

  const {mounted, shown, onExited} = useSheetPresence(open);
  const {
    dragY,
    dragHeight,
    dragging,
    sheetRef,
    scrollRef,
    grabberHandlers,
    bodyHandlers,
  } = useSheetDrag(
    onClose,
    detentMode
      ? {snaps: snapPoints!, index: snapIndex, onSettle: setSnapIndex}
      : undefined,
    dismissible,
  );
  useBackToDismiss(open, onClose);

  // Reset to the default detent each time the sheet opens.
  useEffect(() => {
    if (open && detentMode) {
      setSnapIndex(defaultSnap);
    }
  }, [open]);

  // Measure the screen so detent heights resolve to px (smooth height
  // transitions and a viewport that never runs off-screen).
  useLayoutEffect(() => {
    if (!detentMode || !mounted) {
      return;
    }
    const el = sheetRef.current?.parentElement;
    if (el) {
      setContainerH(el.clientHeight);
    }
  }, [detentMode, mounted, sheetRef]);

  if (!mounted) {
    return null;
  }

  // A non-dismissible detent sheet is a persistent "peek" (Maps/Music). It only
  // makes sense when the app behind stays usable, so it's always non-modal —
  // a scrim would block the interaction the min-height exists to preserve.
  const isPeek = detentMode && !dismissible;
  const effectiveScrim = scrim && !isPeek;

  const maxSnap = detentMode ? snapPoints![snapPoints!.length - 1] : 0;
  // Detent height: exactly the current detent (or the live drag height), so the
  // sheet is only ever as tall as what's visible on screen. A snap > 1 resolves
  // to a fixed pixel height (device-independent); <= 1 to a fraction.
  // Detent height: exactly the current detent (or the live drag height), so the
  // sheet is only ever as tall as what's visible on screen. A snap > 1 resolves
  // to a fixed pixel height (device-independent); <= 1 to a fraction. A pixel
  // snap is emitted as px on the very first paint — it needs no measurement — so
  // the sheet opens at its final height instead of animating down from the
  // fraction fallback (which read as an oversized %, clamped to max, then
  // shrank: a visible bounce).
  const currentSnap = detentMode ? snapPoints![snapIndex] : 0;
  const detentHeight = detentMode
    ? dragHeight != null
      ? `${dragHeight}px`
      : currentSnap > 1
        ? `${currentSnap}px`
        : containerH
          ? `${resolveSnap(currentSnap, containerH)}px`
          : `${currentSnap * 100}%`
    : undefined;

  const sheetStyle: CSSProperties = {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 11,
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--color-background-surface)',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    boxShadow: 'var(--shadow-high)',
    transform: shown
      ? detentMode
        ? 'translateY(0)'
        : `translateY(${dragY}px)`
      : 'translateY(100%)',
    transition: dragging
      ? 'none'
      : 'transform 0.32s cubic-bezier(0.32, 0.72, 0, 1), height 0.32s cubic-bezier(0.32, 0.72, 0, 1)',
    maxHeight: detentMode
      ? maxSnap > 1
        ? `${maxSnap}px`
        : `${maxSnap * 100}%`
      : height === 'tall'
        ? '92%'
        : height === 'capped'
          ? '62%'
          : '90%',
    height: detentMode ? detentHeight : height === 'tall' ? '92%' : undefined,
    // Cap width and center so the sheet doesn't stretch edge-to-edge on tablets.
    maxWidth: 640,
    marginInline: 'auto',
    overflow: 'hidden',
    touchAction: 'none',
  };

  // Scrim fades as the sheet is dragged toward dismissal.
  const scrimOpacity = Math.min(1, Math.max(0.15, 1 - dragY / 360));

  return (
    <>
      {effectiveScrim && (
        <Scrim
          shown={shown}
          onClick={onClose}
          opacity={scrimOpacity}
          animate={!dragging}
        />
      )}
      <div
        ref={sheetRef}
        style={sheetStyle}
        onTransitionEnd={onExited}
        role="dialog"
        aria-modal={effectiveScrim}>
        <div
          {...grabberHandlers}
          style={{touchAction: 'none', cursor: 'grab', flexShrink: 0}}>
          <DragHandle />
          {(title != null || headerAccessory != null) && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                padding: '4px 16px 12px',
              }}>
              <Text type="large" weight="semibold">
                {title}
              </Text>
              {headerAccessory}
            </div>
          )}
        </div>
        <div
          ref={scrollRef}
          {...bodyHandlers}
          style={{
            flex: '1 1 auto',
            minHeight: 0,
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            touchAction: 'pan-y',
            padding: '0 16px',
            paddingBottom: footer ? 8 : 12,
          }}>
          {children}
        </div>
        {footer != null && (
          <div
            style={{
              flexShrink: 0,
              padding: '12px 16px',
              background: 'var(--color-background-surface)',
            }}>
            {footer}
          </div>
        )}
        <SafeAreaBar />
      </div>
    </>
  );
}

// Home-indicator safe-area filler so footers/rows clear the iOS home pill.
function SafeAreaBar() {
  return (
    <div
      style={{
        height: SAFE_AREA_BOTTOM,
        flexShrink: 0,
        background: 'var(--color-background-surface)',
      }}
    />
  );
}

// =============================================================================
// BottomSheetMenu — a hug-height bottom sheet holding a grouped command list
// =============================================================================

export type SheetAction = {
  label: string;
  icon?: ReactNode;
  variant?: 'default' | 'destructive';
  onClick?: () => void;
};

export function BottomSheetMenu({
  open,
  onClose,
  title,
  description,
  actions,
  cancelLabel = 'Cancel',
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  actions: SheetAction[];
  cancelLabel?: string;
}) {
  // A command menu is just a hug-height BottomSheet with a list of commands, so
  // it reuses the sheet's gesture / scrim / safe-area / Back system rather than
  // introducing a separate surface. The Cancel lives in the pinned footer;
  // drag / scrim-tap / Back dismiss it too.

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      height="hug"
      title={title}
      footer={
        <Button
          label={cancelLabel}
          variant="secondary"
          xstyle={proto.fullBtn}
          onClick={onClose}
        />
      }>
      {description != null && (
        <div style={{paddingBottom: 4}}>
          <Text type="supporting">{description}</Text>
        </div>
      )}
      <VStack xstyle={proto.actionList}>
        {actions.map((a, i) => (
          <Fragment key={a.label}>
            <Item
              density="spacious"
              startContent={
                a.variant === 'destructive' && a.icon != null ? (
                  <span
                    style={{
                      color: 'var(--color-text-error)',
                      display: 'inline-flex',
                    }}>
                    {a.icon}
                  </span>
                ) : (
                  a.icon
                )
              }
              onClick={() => {
                a.onClick?.();
                onClose();
              }}
              label={
                a.variant === 'destructive' ? (
                  <span style={{color: 'var(--color-text-error)'}}>
                    {a.label}
                  </span>
                ) : (
                  a.label
                )
              }
            />
            {i < actions.length - 1 && <Divider />}
          </Fragment>
        ))}
      </VStack>
    </BottomSheet>
  );
}

// =============================================================================
// useDrawerDrag — horizontal swipe-to-dismiss with velocity projection
// =============================================================================
// A drawer drags along one axis (horizontal), so there's no scroll↔drag
// conflict like the sheet — but the panel's own content still scrolls
// vertically. We detect the gesture's axis after SLOP: a primarily-horizontal
// move toward the edge claims a drawer drag; a vertical move is left to native
// scroll. On release we project by velocity and dismiss past a threshold.

function useDrawerDrag(onClose: () => void, side: 'start' | 'end') {
  const panelRef = useRef<HTMLDivElement>(null);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const d = useRef({
    startX: 0,
    startY: 0,
    lastX: 0,
    lastT: 0,
    v: 0,
    x: 0,
    pending: false,
    active: false,
  });
  const outward = side === 'start' ? -1 : 1; // dismiss direction

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button != null && e.button > 0) {
      return;
    }
    d.current.pending = true;
    d.current.active = false;
    d.current.startX = e.clientX;
    d.current.startY = e.clientY;
    d.current.lastX = e.clientX;
    d.current.lastT = performance.now();
    d.current.v = 0;
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const s = d.current;
    if (!s.pending && !s.active) {
      return;
    }
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;

    if (!s.active) {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) {
        return;
      }
      // Claim only primarily-horizontal gestures; vertical → native scroll.
      if (Math.abs(dy) > Math.abs(dx)) {
        s.pending = false;
        return;
      }
      s.active = true;
      setDragging(true);
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    }

    const now = performance.now();
    const dt = now - s.lastT;
    if (dt > 0) {
      s.v = (e.clientX - s.lastX) / dt;
    } // px/ms, signed
    s.lastX = e.clientX;
    s.lastT = now;
    // Only outward (toward the edge) travel; inward is pinned at the open rest.
    s.x = side === 'start' ? Math.min(0, dx) : Math.max(0, dx);
    setDragX(s.x);
  };

  const end = () => {
    const s = d.current;
    if (!s.active) {
      s.pending = false;
      return;
    }
    s.active = false;
    s.pending = false;
    setDragging(false);
    const width = panelRef.current?.offsetWidth ?? 300;
    const projected = s.x + s.v * PROJECT_MS;
    // Dismiss when the projected offset passes the threshold in the outward dir.
    if (
      outward < 0
        ? projected < -Math.max(60, width * 0.4)
        : projected > Math.max(60, width * 0.4)
    ) {
      onClose();
    }
    setDragX(0);
    s.x = 0;
  };

  const handlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp: end,
    onPointerCancel: end,
  };
  return {dragX, dragging, panelRef, handlers};
}

// DrawerEdgeGrip — a thin edge affordance that opens a drawer on inward swipe
// (the Android navigation-drawer gesture). Sits below the scrim/drawer so it's
// inert once the drawer is open.
export function DrawerEdgeGrip({
  side = 'start',
  onOpen,
}: {
  side?: 'start' | 'end';
  onOpen: () => void;
}) {
  const isStart = side === 'start';
  const st = useRef({x: 0, active: false});
  return (
    <div
      onPointerDown={e => {
        st.current.x = e.clientX;
        st.current.active = true;
      }}
      onPointerMove={e => {
        if (!st.current.active) {
          return;
        }
        const dx = e.clientX - st.current.x;
        if ((isStart && dx > 12) || (!isStart && dx < -12)) {
          st.current.active = false;
          onOpen();
        }
      }}
      onPointerUp={() => {
        st.current.active = false;
      }}
      style={{
        position: 'absolute',
        top: SAFE_AREA_TOP,
        bottom: SAFE_AREA_BOTTOM,
        [isStart ? 'left' : 'right']: 0,
        width: 20,
        zIndex: 9,
        display: 'flex',
        alignItems: 'center',
        justifyContent: isStart ? 'flex-start' : 'flex-end',
        touchAction: 'pan-y',
      }}>
      <div
        style={{
          width: 4,
          height: 48,
          margin: 3,
          borderRadius: 999,
          background: 'var(--color-border-emphasized)',
          opacity: 0.6,
        }}
      />
    </div>
  );
}

// =============================================================================
// SideDrawer — edge panel
// =============================================================================

export function SideDrawer({
  open,
  onClose,
  side = 'start',
  width = 300,
  title,
  children,
  scrim = true,
  showClose = side === 'end',
}: {
  open: boolean;
  onClose: () => void;
  side?: 'start' | 'end';
  width?: number;
  title?: ReactNode;
  children: ReactNode;
  /** Modal (default) dims + blocks the page. `false` = standard/persistent (no scrim). */
  scrim?: boolean;
  /**
   * Show a header close (×). Canonical Material: a navigation drawer (start)
   * omits it — it's paired with its launcher and dismissed by scrim/swipe/Back
   * — while a contextual side sheet (end) includes it. Defaults per side.
   */
  showClose?: boolean;
}) {
  const {mounted, shown, onExited} = useSheetPresence(open);
  const {dragX, dragging, panelRef, handlers} = useDrawerDrag(onClose, side);
  useBackToDismiss(open, onClose);
  if (!mounted) {
    return null;
  }
  const isStart = side === 'start';
  const hidden = isStart ? 'translateX(-100%)' : 'translateX(100%)';
  const panelWidth = Math.min(width, 320);
  // Scrim fades toward transparent as the drawer is dragged off-screen.
  const scrimOpacity = Math.min(
    1,
    Math.max(0, 1 - Math.abs(dragX) / panelWidth),
  );

  return (
    <>
      {scrim && (
        <Scrim
          shown={shown}
          onClick={onClose}
          opacity={scrimOpacity}
          animate={!dragging}
        />
      )}
      <div
        ref={panelRef}
        {...handlers}
        onTransitionEnd={onExited}
        role="dialog"
        aria-modal={scrim}
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          [isStart ? 'left' : 'right']: 0,
          width: panelWidth,
          maxWidth: '85%',
          zIndex: 11,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--color-background-surface)',
          boxShadow: 'var(--shadow-high)',
          transform: shown ? `translateX(${dragX}px)` : hidden,
          transition: dragging
            ? 'none'
            : 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
          paddingTop: SAFE_AREA_TOP,
          paddingBottom: SAFE_AREA_BOTTOM,
          touchAction: 'pan-y',
        }}>
        {title != null && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              padding: '4px 8px 12px 16px',
              borderBottom: '1px solid var(--color-border)',
            }}>
            <Text type="large" weight="semibold">
              {title}
            </Text>
            {/* Canonical Material: nav drawer (start) has no ×; a contextual
                side sheet (end) does. Standard/permanent drawers never close
                modally, so gate on scrim too. */}
            {scrim && showClose && (
              <IconButton
                label="Close"
                variant="ghost"
                size="sm"
                icon={<CloseIcon />}
                onClick={onClose}
              />
            )}
          </div>
        )}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            padding: 12,
          }}>
          {children}
        </div>
      </div>
    </>
  );
}

// =============================================================================
// TapField — a faux trigger that looks like an XDS input/selector row
// =============================================================================

export function TapField({
  label,
  value,
  placeholder,
  icon,
  chevron = true,
  onClick,
}: {
  label?: string;
  value?: string;
  placeholder?: string;
  icon?: ReactNode;
  chevron?: boolean;
  onClick: () => void;
}) {
  const id = useId();
  const hasValue = value != null && value !== '';
  // Real XDS Field (label / spacing / a11y) wrapping a trigger that reuses the
  // shared input wrapper chrome — same border, hover shadow, and focus ring as
  // TextInput / Selector / DateInput — so the field is a real XDS surface.
  return (
    <Field
      label={label ?? placeholder ?? 'Field'}
      isLabelHidden={label == null}
      inputID={id}
      width="100%">
      <button
        id={id}
        type="button"
        onClick={onClick}
        {...stylex.props(inputWrapperStyles.base, proto.tapControl)}>
        {icon && (
          <span
            style={{
              display: 'inline-flex',
              color: 'var(--color-icon-secondary)',
            }}>
            {icon}
          </span>
        )}
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: hasValue
              ? 'var(--color-text-primary)'
              : 'var(--color-text-secondary)',
          }}>
          {hasValue ? value : placeholder}
        </span>
        {chevron && (
          <ChevronDown
            width={16}
            height={16}
            style={{color: 'var(--color-icon-secondary)', flexShrink: 0}}
          />
        )}
      </button>
    </Field>
  );
}

// =============================================================================
// PhoneFrame — device shell that hosts one prototype screen
// =============================================================================

export function PhoneFrame({children}: {children: ReactNode}) {
  return (
    <div
      style={{
        width: 'min(390px, 92vw)',
        height: 'min(812px, calc(100vh - 132px))',
        padding: 12,
        borderRadius: 52,
        background: 'linear-gradient(160deg, #2a2a2e, #0c0c0e)',
        boxShadow:
          '0 30px 70px rgba(0,0,0,0.35), 0 0 0 2px rgba(255,255,255,0.04)',
        flexShrink: 0,
      }}>
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          borderRadius: 40,
          overflow: 'hidden',
          background: 'var(--color-background-body)',
          display: 'flex',
          flexDirection: 'column',
          isolation: 'isolate',
        }}>
        <StatusBar />
        {children}
        <HomeIndicator />
      </div>
    </div>
  );
}

// TabletFrame — wider device shell to show the sheet's max-width cap / centering.
export function TabletFrame({
  children,
  tall = false,
}: {
  children: ReactNode;
  /** Taller aspect ratio for demos whose sheet needs more vertical room
      (e.g. DateTimeInput fitting two months beside the time grid). */
  tall?: boolean;
}) {
  return (
    <div
      style={{
        width: 'min(900px, 100%)',
        aspectRatio: tall ? '1.05 / 1' : '1.4 / 1',
        padding: 16,
        borderRadius: 34,
        background: 'linear-gradient(160deg, #2a2a2e, #0c0c0e)',
        boxShadow:
          '0 30px 70px rgba(0,0,0,0.35), 0 0 0 2px rgba(255,255,255,0.04)',
      }}>
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          borderRadius: 22,
          overflow: 'hidden',
          background: 'var(--color-background-body)',
          display: 'flex',
          flexDirection: 'column',
          isolation: 'isolate',
        }}>
        <StatusBar />
        {children}
        <HomeIndicator />
      </div>
    </div>
  );
}

function StatusBar() {
  return (
    <div
      style={{
        position: 'relative',
        zIndex: 12,
        flexShrink: 0,
        height: 44,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 22px',
        color: 'var(--color-text-primary)',
        fontSize: 14,
        fontWeight: 600,
        pointerEvents: 'none',
      }}>
      <span>9:41</span>
      <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
        <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor">
          <rect x="0" y="7" width="3" height="4" rx="1" />
          <rect x="4.5" y="5" width="3" height="6" rx="1" />
          <rect x="9" y="2.5" width="3" height="8.5" rx="1" />
          <rect x="13.5" y="0" width="3" height="11" rx="1" />
        </svg>
        <svg
          width="24"
          height="12"
          viewBox="0 0 24 12"
          fill="none"
          stroke="currentColor">
          <rect x="1" y="1" width="19" height="10" rx="2.5" opacity="0.5" />
          <rect
            x="2.5"
            y="2.5"
            width="14"
            height="7"
            rx="1.2"
            fill="currentColor"
            stroke="none"
          />
          <rect
            x="21"
            y="4"
            width="2"
            height="4"
            rx="1"
            fill="currentColor"
            stroke="none"
          />
        </svg>
      </div>
    </div>
  );
}

function HomeIndicator() {
  return (
    <div
      style={{
        position: 'relative',
        zIndex: 12,
        flexShrink: 0,
        height: 22,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}>
      <div
        style={{
          width: 134,
          height: 5,
          borderRadius: 999,
          background: 'var(--color-text-primary)',
          opacity: 0.35,
        }}
      />
    </div>
  );
}

// =============================================================================
// AppScreen — scrollable content area for a prototype (sits above the sheet)
// =============================================================================

export function AppScreen({
  title,
  children,
  padded = true,
}: {
  title?: string;
  children: ReactNode;
  padded?: boolean;
}) {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}>
      {title != null && (
        <div style={{padding: '4px 20px 12px'}}>
          <Heading level={2}>{title}</Heading>
        </div>
      )}
      <div
        style={{
          padding: padded ? '0 20px 20px' : 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}>
        {children}
      </div>
    </div>
  );
}

// =============================================================================
// AnchoredPopover — small popover anchored to a trigger inside the phone
// =============================================================================

export function AnchoredPopover({
  open,
  onClose,
  anchorRect,
  children,
  width = 240,
}: {
  open: boolean;
  onClose: () => void;
  anchorRect: {top: number; left: number; width: number; height: number} | null;
  children: ReactNode;
  width?: number;
}) {
  const {mounted, shown, onExited} = useSheetPresence(open);
  // Clamp against the actual host container (phone or tablet frame) rather than a
  // hardcoded phone width, so the popover stays anchored in either preview.
  const overlayRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(390);
  // Flip above the anchor when there isn't room below it (the iOS / Android
  // contextual-popover behavior), so a mention near the bottom edge isn't
  // clipped. Measured after mount from the card's own height.
  const [placement, setPlacement] = useState<'below' | 'above'>('below');
  useLayoutEffect(() => {
    if (!mounted || !anchorRect) {
      return;
    }
    const host = overlayRef.current;
    setContainerW(host?.offsetWidth ?? 390);
    const containerH = host?.offsetHeight ?? 0;
    const cardH = cardRef.current?.offsetHeight ?? 0;
    const belowTop = anchorRect.top + anchorRect.height + 8;
    const roomBelow = containerH - belowTop;
    const roomAbove = anchorRect.top - 8;
    // Prefer below; flip only if it would overflow and above has more room.
    setPlacement(
      roomBelow < cardH && roomAbove > roomBelow ? 'above' : 'below',
    );
  }, [mounted, anchorRect]);
  if (!mounted || !anchorRect) {
    return null;
  }
  const top =
    placement === 'above'
      ? Math.max(8, anchorRect.top - (cardRef.current?.offsetHeight ?? 0) - 8)
      : anchorRect.top + anchorRect.height + 8;
  return (
    <>
      <div
        ref={overlayRef}
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 10,
          background: 'transparent',
        }}
      />
      <div
        ref={cardRef}
        onTransitionEnd={onExited}
        style={{
          position: 'absolute',
          zIndex: 11,
          top,
          left: Math.max(8, Math.min(anchorRect.left, containerW - width - 16)),
          width,
          background: 'var(--color-background-popover)',
          borderRadius: 'var(--radius-container)',
          boxShadow: 'var(--shadow-high)',
          border: '1px solid var(--color-border)',
          padding: 12,
          opacity: shown ? 1 : 0,
          transform: shown
            ? 'translateY(0) scale(1)'
            : `translateY(${placement === 'above' ? 4 : -4}px) scale(0.98)`,
          transformOrigin: placement === 'above' ? 'bottom left' : 'top left',
          transition: 'opacity 0.16s ease, transform 0.16s ease',
        }}>
        {children}
      </div>
    </>
  );
}
