// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ResizeHandle.tsx
 * @input direction, isReversed, hasDivider, isAlwaysVisible, pillPlacement,
 *   ResizableProps, or the createResizable that `useResizable(handleRef,
 *   options)` bound to its element
 * @output Styled drag handle with WAI-ARIA separator role and keyboard support
 * @position Between resizable panels; consumed directly by builders
 *
 * A drag takes pointer capture on the element it starts on, so moves over an
 * embedded frame still arrive.
 */

import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type {HTMLAttributes, ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {BaseProps} from '../BaseProps';
import {
  colorVars,
  durationVars,
  easeVars,
  radiusVars,
  spacingVars,
} from '../theme/tokens.stylex';
import {focusOutlineProps} from '../utils/focusOutline.stylex';
import {mergeProps, rtlStyles} from '../utils';
import {
  getCollapseControls,
  getEffectiveMaxPx,
  type ResizableProps,
} from './useResizable';
import {
  claimResizeHandle,
  createResizeGesture,
  createResizeHandleClaim,
  notifyHandleRef,
  readStartingView,
  releaseResizeHandle,
  type ResizeGesture,
  type ResizeGestureModel,
} from './resizeGesture';
import {separatorAttributes} from './separatorAttributes';
import {themeProps} from '../utils/themeProps';

import {useMergedRefs} from '../hooks/useMergedRefs';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {useDevWarning} from '../hooks/useDevWarning';
import {
  registerEnglishFallback,
  useComponentTranslator,
} from '../i18n/useComponentTranslator';
import english from '../i18n/generated-english/Resizable/ResizeHandle.generated';

registerEnglishFallback(english);

type PillPlacement = 'start' | 'end' | 'center' | 'auto';

function resolveEffectiveSide(
  pillPlacement: PillPlacement,
  isReversed: boolean,
  isCollapsed: boolean,
): 'start' | 'end' | 'center' {
  if (pillPlacement !== 'auto') {
    return pillPlacement;
  }
  const panelSide: 'start' | 'end' = isReversed ? 'end' : 'start';
  if (isCollapsed) {
    return panelSide === 'start' ? 'end' : 'start';
  }
  return panelSide;
}

const styles = stylex.create({
  handle: {
    position: 'relative',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colorVars['--color-border'],
    transitionProperty: 'background-color',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  // Overlay mode — absolutely positioned inside the parent panel
  // instead of being a sibling in flex flow. Used when the handle
  // must stay within a parent's overflow: clip bounds.
  overlay: {
    position: 'absolute',
    zIndex: 2,
    backgroundColor: 'transparent',
  },
  overlayHorizontal: {
    insetInlineEnd: 0,
    top: 0,
    bottom: 0,
    width: 'var(--resize-handle-hit-area, 16px)',
  },
  overlayVertical: {
    insetBlockEnd: 0,
    insetInlineStart: 0,
    insetInlineEnd: 0,
    height: 'var(--resize-handle-hit-area, 16px)',
  },
  overlayHorizontalOnShortPane: {
    width: 'min(var(--resize-handle-hit-area, 16px), 50%)',
  },
  overlayVerticalOnShortPane: {
    height: 'min(var(--resize-handle-hit-area, 16px), 50%)',
  },
  horizontal: {
    width: 1,
    height: '100%',
    cursor: {
      default: 'col-resize',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
  vertical: {
    height: 1,
    width: '100%',
    cursor: {
      default: 'row-resize',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
  noDividerHorizontal: {
    backgroundColor: 'transparent',
    width: 0,
  },
  noDividerVertical: {
    backgroundColor: 'transparent',
    height: 0,
  },
  handleHover: {
    backgroundColor: colorVars['--color-border'],
  },
  handleActive: {
    backgroundColor: colorVars['--color-border-emphasized'],
  },
  disabled: {
    cursor: 'default',
    pointerEvents: 'none',
  },

  hitArea: {
    position: 'absolute',
    zIndex: 1,
    touchAction: 'none',
    userSelect: 'none',
  },
  hitAreaHorizontal: {
    width: spacingVars['--spacing-4'],
    top: 0,
    bottom: 0,
    cursor: {
      default: 'col-resize',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
  hitAreaVertical: {
    height: spacingVars['--spacing-4'],
    insetInlineStart: 0,
    insetInlineEnd: 0,
    cursor: {
      default: 'row-resize',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
  // The grab zone sits centred on the Handle whatever `pillPlacement` says,
  // which only places the pill. Inline centering comes from
  // rtlStyles.centerInline at the call site (correct in LTR and RTL); this
  // block owns only the block axis.
  hitAreaCenteredY: {
    insetBlockStart: '50%',
    transform: 'translateY(-50%)',
  },
  hitAreaWithinHandleX: {
    width: `min(${spacingVars['--spacing-4']}, 100%)`,
  },
  hitAreaWithinHandleY: {
    height: `min(${spacingVars['--spacing-4']}, 100%)`,
  },

  // Pill base — themes target .astryx-resize-handle-pill for size/shape.
  pill: {
    position: 'absolute',
    zIndex: 2,
    touchAction: 'none',
    userSelect: 'none',
    borderRadius: radiusVars['--radius-full'],
    backgroundColor: colorVars['--color-border'],
    transitionProperty: 'opacity, background-color, transform',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
    top: '50%',
  },
  pillGrabHorizontal: {
    cursor: {
      default: 'col-resize',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
  pillGrabVertical: {
    cursor: {
      default: 'row-resize',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
  pillHorizontal: {
    width: 3,
    height: spacingVars['--spacing-8'],
  },
  pillVertical: {
    width: spacingVars['--spacing-8'],
    height: 3,
  },
  // A hidden pill paints nothing, so it takes no pointer either.
  pillHidden: {opacity: 0, pointerEvents: 'none'},
  pillVisible: {opacity: 1},
  pillHover: {
    opacity: 1,
    pointerEvents: 'auto',
    backgroundColor: colorVars['--color-border'],
  },
  pillActive: {
    opacity: 1,
    pointerEvents: 'auto',
    backgroundColor: colorVars['--color-border-emphasized'],
  },
  // A pill shown on hover can sit outside the Grab zone. This invisible
  // extension spans the gap toward the Handle, so the pointer keeps the hover
  // on its way to the pill. It reaches no further than the pill, and it takes
  // the pointer only while the pill does. The pill's offset is a physical
  // translate, so the side toward the Handle is physical too.
  pillBridgeRight: {
    '::before': {
      content: '""',
      position: 'absolute',
      insetBlock: 0,
      insetInlineStart: {
        default: 0,
        ':is([dir="rtl"] *)': `calc(-1 * ${spacingVars['--spacing-1']} - 1px)`,
      },
      insetInlineEnd: {
        default: `calc(-1 * ${spacingVars['--spacing-1']} - 1px)`,
        ':is([dir="rtl"] *)': 0,
      },
    },
  },
  pillBridgeLeft: {
    '::before': {
      content: '""',
      position: 'absolute',
      insetBlock: 0,
      insetInlineStart: {
        default: `calc(-1 * ${spacingVars['--spacing-1']} - 1px)`,
        ':is([dir="rtl"] *)': 0,
      },
      insetInlineEnd: {
        default: 0,
        ':is([dir="rtl"] *)': `calc(-1 * ${spacingVars['--spacing-1']} - 1px)`,
      },
    },
  },
  pillBridgeDown: {
    '::before': {
      content: '""',
      position: 'absolute',
      insetInline: 0,
      insetBlockStart: 0,
      insetBlockEnd: `calc(-1 * ${spacingVars['--spacing-1']} - 1px)`,
    },
  },
  pillBridgeUp: {
    '::before': {
      content: '""',
      position: 'absolute',
      insetInline: 0,
      insetBlockStart: `calc(-1 * ${spacingVars['--spacing-1']} - 1px)`,
      insetBlockEnd: 0,
    },
  },
});

// Dynamic styles — avoids inline style overrides.
// Each axis gets its own function since StyleX requires static structure.
const dynamicStyles = stylex.create({
  // An inline Handle's zone is centred on its line, so half of it reaches into
  // the pane.
  hitAreaLengthX: (pane: number) => ({
    width: `min(${spacingVars['--spacing-4']}, ${pane}px)`,
  }),
  hitAreaLengthY: (pane: number) => ({
    height: `min(${spacingVars['--spacing-4']}, ${pane}px)`,
  }),
  pillOffsetX: (dir: -1 | 1) => ({
    insetInlineStart: 0,
    transform: `translate(calc(${dir} * (100% + ${spacingVars['--spacing-1']})), -50%)`,
  }),
  // Vertical offset: no rotation — use explicit landscape dimensions.
  // Rotation + offset creates confusing coordinate math since translate
  // operates in pre-rotation local space.
  pillOffsetY: (dir: -1 | 1) => ({
    top: 0,
    transform: `translate(-50%, calc(${dir} * (100% + ${spacingVars['--spacing-1']})))`,
  }),
});

export interface ResizeHandleProps extends Omit<
  BaseProps<HTMLDivElement>,
  'style'
> {
  ref?: React.Ref<HTMLDivElement>;

  /**
   * Layout direction — determines cursor and indicator orientation.
   * @default 'horizontal'
   */
  direction?: 'horizontal' | 'vertical';

  /**
   * Positioning mode. `'inline'` (default) puts the handle in normal
   * flex flow between siblings. `'overlay'` uses absolute positioning
   * so the handle sits inside a parent panel's bounds — useful when
   * the parent has `overflow: clip`.
   * @default 'inline'
   */
  position?: 'inline' | 'overlay';

  /**
  /**
   * Reverse the drag direction. Use when the handle controls a panel
   * on the end/right/bottom side.
   * @default false
   */
  isReversed?: boolean;

  /**
   * Whether the handle is disabled (not interactive).
   * @default false
   */
  isDisabled?: boolean;

  /**
   * Show a 1px divider line. The line IS the handle — it takes only
   * 1px in the layout with a wider invisible hit area for interaction.
   * Ignored in overlay mode.
   * @default false
   */
  hasDivider?: boolean;

  /**
   * Show the pill grip indicator at rest. Set to `false` to only
   * reveal the pill on hover/focus.
   * @default true
   */
  isAlwaysVisible?: boolean;

  /**
   * Which side of the divider line the pill sits on. It moves only the pill:
   * the grab zone stays centred on the divider.
   * - `'auto'` — panel side by default, flips when panel is collapsed to 0px
   * - `'start'` — left (horizontal) or top (vertical)
   * - `'end'` — right (horizontal) or bottom (vertical)
   * - `'center'` — centered on the divider line (original behavior)
   * @default 'auto'
   */
  pillPlacement?: PillPlacement;

  /**
   * Accessible label for the separator.
   * @default 'Resize handle'
   */
  label?: string;

  /** Resize props from useResizable region. */
  resizable?: ResizableProps;

  /** Custom handle content. Overrides the default pill. */
  children?: ReactNode;
}

/**
 * Draggable resize handle placed between resizable panels. Renders as a thin
 * divider line with a wider invisible hit area and optional pill grip indicator.
 * Supports keyboard resizing via arrow keys and WAI-ARIA separator role.
 *
 * The pill element uses class `astryx-resize-handle-pill` for theme targeting.
 *
 * @example
 * ```
 * <ResizeHandle
 *   resizable={sidebar.props}
 *   direction="horizontal"
 *   hasDivider />
 * ```
 */

export function ResizeHandle({
  direction = 'horizontal',
  position: positionMode = 'inline',
  isReversed = false,
  isDisabled = false,
  hasDivider = false,
  isAlwaysVisible = true,
  pillPlacement = 'auto',
  label: labelFromProps,
  resizable,
  children,
  xstyle,
  className,
  ref,
  ...props
}: ResizeHandleProps) {
  const t = useComponentTranslator();
  const label = labelFromProps ?? t('@astryx.resizable.handle.label');
  const handleRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const isHorizontal = direction === 'horizontal';
  const isOverlay = positionMode === 'overlay';

  // --- The region a `resizable` prop describes ---

  // The gesture reads the latest props at each input. A drag sees the region
  // as it is now, not as it was at the press.
  const resizableRef = useRef(resizable);
  resizableRef.current = resizable;
  // The region a drag in flight started on: told the gesture is over even
  // after the prop has gone.
  const dragRegionRef = useRef<ResizableProps | undefined>(undefined);
  const configRef = useRef({direction, isReversed, isDisabled});
  configRef.current = {direction, isReversed, isDisabled};
  const [isRegionDragging, setIsRegionDragging] = useState(false);
  const [regionGesture] = useState<ResizeGesture>(() => {
    const model: ResizeGestureModel = {
      state() {
        const region = resizableRef.current;
        return {
          size: region?._size ?? 0,
          isCollapsed: region?._isCollapsed ?? false,
          minPx: region?._minSizePx ?? 0,
          maxPx: region?._maxSizePx ?? Infinity,
          snaps: region?._snaps ?? [],
          collapsedSize: region?._collapsedSize ?? 0,
          collapsible: region?._collapsible ?? false,
        };
      },
      start: () => {
        dragRegionRef.current = resizableRef.current;
        resizableRef.current?._onResizeStart();
      },
      move: delta => resizableRef.current?._onResizeMove(delta),
      end: () => {
        const region = resizableRef.current ?? dragRegionRef.current;
        dragRegionRef.current = undefined;
        region?._onResizeEnd();
      },
      // Not a resize end, but the gesture is over. The region froze its state
      // for the drag, so it must hear that the drag ended.
      cancel: () => {
        const region = resizableRef.current ?? dragRegionRef.current;
        dragRegionRef.current = undefined;
        region?._onResizeCancel?.();
      },
      // The hook's own collapse and expand restore the size before the
      // collapse; a hand-built `ResizableProps` has none.
      get collapse() {
        const region = resizableRef.current;
        return region ? getCollapseControls(region)?.collapse : undefined;
      },
      get expand() {
        const region = resizableRef.current;
        return region ? getCollapseControls(region)?.expand : undefined;
      },
    };
    return createResizeGesture(
      () => handleRef.current,
      model,
      () => ({
        ...configRef.current,
        isDisabled:
          configRef.current.isDisabled || resizableRef.current == null,
      }),
      setIsRegionDragging,
    );
  });

  // --- The createResizable that useResizable(handleRef) attached here ---
  const [claim] = useState(createResizeHandleClaim);
  const claimedElementRef = useRef<HTMLDivElement | null>(null);
  // A callback ref, so the hook that holds this handle's ref hears when the
  // element attaches or lets go. Its own component need not render. A child
  // can mount, unmount, or hide and show the handle in its own `<Activity>`.
  // It runs after the caller's ref is set (see the merged refs below).
  const claimRef = useCallback(
    (element: HTMLDivElement | null) => {
      const previous = claimedElementRef.current;
      if (previous === element) {
        return;
      }
      if (previous != null) {
        // A gesture the bound factory runs ends when the element really lets
        // go. A new `ref` lets go of it and takes it back in one commit.
        const bound = claim.get();
        releaseResizeHandle(previous, claim);
        queueMicrotask(() => {
          if (claimedElementRef.current !== previous) {
            bound?.gesture.interrupt();
          }
        });
      }
      claimedElementRef.current = element;
      if (element != null) {
        claimResizeHandle(element, claim);
      }
      notifyHandleRef(ref);
    },
    [claim, ref],
  );
  const binding = useSyncExternalStore(claim.subscribe, claim.get, () => null);
  const subscribeToBinding = useCallback(
    (listener: () => void) => binding?.subscribe(listener) ?? (() => {}),
    [binding],
  );
  const bound = useSyncExternalStore(
    subscribeToBinding,
    () => binding?.read() ?? null,
    () => null,
  );
  // React subscribes to these stores in the passive phase, after the hook has
  // bound its factory in its own layout effect. It does not read them again
  // when an `<Activity>` shows this handle. So this subscription is live from
  // the layout phase. A factory bound in the commit that mounts or shows the
  // handle renders before paint.
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  useIsomorphicLayoutEffect(() => {
    let stopView = claim.get()?.subscribe(rerender) ?? null;
    const stopClaim = claim.subscribe(() => {
      stopView?.();
      stopView = claim.get()?.subscribe(rerender) ?? null;
      rerender();
    });
    if (claim.get() != null) {
      rerender();
    }
    return () => {
      stopClaim();
      stopView?.();
    };
  }, [claim]);

  // A `resizable` prop wins over a bound factory: it is the region the caller
  // named on this element. Before a factory binds, as on the server, the
  // handle renders the view its hook recorded for its ref.
  const view = resizable != null ? null : (bound ?? readStartingView(ref));
  // The handle's own isReversed and isDisabled apply to the region it renders
  // (with the region's own options: either one reverses or disables it).
  useIsomorphicLayoutEffect(() => {
    if (resizable != null || binding == null) {
      return;
    }
    binding.configure({isReversed, isDisabled});
    return () => {
      binding.configure(null);
    };
  }, [binding, resizable, isReversed, isDisabled]);
  const gesture: ResizeGesture | null =
    resizable != null ? regionGesture : (binding?.gesture ?? null);
  const isDragging = resizable != null ? isRegionDragging : !!view?.isDragging;
  const isInputDisabled = isDisabled || !!view?.isDisabled;
  const isCollapsed = resizable?._isCollapsed ?? view?.isCollapsed ?? false;
  const effectiveSide = resolveEffectiveSide(
    pillPlacement,
    view?.isReversed ?? isReversed,
    isCollapsed,
  );
  // An inline zone reaches at most half of the pane the Handle resizes. An
  // overlay Handle takes at most half of it. A collapsed pane, or one at 0px,
  // has nothing to protect and keeps the whole zone.
  const paneSize = resizable?._size ?? view?.size;
  const paneLength =
    isCollapsed || paneSize == null || paneSize <= 0 ? undefined : paneSize;
  const isInteracting = isHovered || isFocused;

  // A handle whose axis disagrees with its region drags along one axis while
  // the region measures percentage bounds on the other. `ResizableProps` is
  // exported, so `_direction` is optional for old hand-built objects. Without
  // it there is no axis to compare.
  const regionDirection = resizable?._direction ?? view?.direction;
  useDevWarning(
    'ResizeHandle',
    `direction="${direction}" but its useResizable region is ` +
      `"${regionDirection}". They must match: the hook measures one axis ` +
      'and the handle drags the other.',
    regionDirection != null && regionDirection !== direction,
  );
  useDevWarning(
    'ResizeHandle',
    'has a `resizable` prop and a useResizable(handleRef) region at once. ' +
      'The `resizable` prop wins; pass one of them.',
    resizable != null && binding != null,
  );

  // --- Cleanup on unmount, or when the `resizable` prop goes ---

  // Removing the grab zone releases its captured pointer and its listeners.
  // A `resizable` prop that goes away takes the grab zone's handlers too. The
  // body's cursor and user-select overrides are not on the element, so they
  // are released here. The region outlives this handle and still has to hear
  // that its gesture is over.
  const hasRegion = resizable != null;
  useEffect(() => {
    if (!hasRegion) {
      return;
    }
    return () => {
      regionGesture.interrupt();
    };
  }, [hasRegion, regionGesture]);

  // --- ARIA ---
  const sizeNow = resizable?._size ?? view?.size;
  const minNow = resizable?._minSizePx ?? view?.minPx;
  // A separator with a value needs a maximum (WAI-ARIA, APG window splitter).
  // Unbounded regions report the basis they can fill; a hand-built props
  // object without it reports only a configured maximum.
  const effectiveMax = resizable
    ? (getEffectiveMaxPx(resizable) ??
      (resizable._maxSizePx !== Infinity ? resizable._maxSizePx : undefined))
    : view?.effectiveMaxPx;
  // The attributes createResizable writes on a plain element, from the same
  // derivation. A bound factory's `collapsedLabel` replaces the catalog
  // message.
  const aria = separatorAttributes({
    direction,
    isDisabled: isInputDisabled,
    value:
      sizeNow == null || minNow == null
        ? undefined
        : {
            size: sizeNow,
            minPx: minNow,
            maxPx: effectiveMax,
            isCollapsed,
            collapsedText:
              (resizable == null ? view?.collapsedLabel : undefined) ??
              t('@astryx.resizable.collapsed'),
          },
  });

  // The Grip pill takes the pointer as the Grab zone does, so a pill drawn
  // outside the zone still resizes.
  const grabHandlers: Pick<
    HTMLAttributes<HTMLDivElement>,
    | 'onPointerDown'
    | 'onPointerMove'
    | 'onPointerUp'
    | 'onPointerCancel'
    | 'onLostPointerCapture'
    | 'onPointerEnter'
    | 'onPointerLeave'
  > = {
    onPointerDown: e => {
      if (!isInputDisabled) {
        gesture?.pointerDown(e);
      }
    },
    onPointerMove: e => gesture?.pointerMove(e),
    onPointerUp: e => gesture?.pointerUp(e),
    onPointerCancel: e => gesture?.pointerCancel(e),
    onLostPointerCapture: e => gesture?.pointerCancel(e),
    onPointerEnter: () => setIsHovered(true),
    onPointerLeave: () => {
      if (!isDragging) {
        setIsHovered(false);
      }
    },
  };

  return (
    <div
      ref={useMergedRefs(ref, handleRef, claimRef)}
      role="separator"
      {...aria}
      aria-label={label}
      onDoubleClick={() => {
        if (!isInputDisabled) {
          gesture?.doubleClick();
        }
      }}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      data-resizing={isDragging || undefined}
      {...mergeProps(
        themeProps('resize-handle'),
        focusOutlineProps.focusVisible(
          styles.handle,
          isOverlay && styles.overlay,
          isOverlay &&
            (isHorizontal ? styles.overlayHorizontal : styles.overlayVertical),
          isOverlay &&
            paneLength != null &&
            (isHorizontal
              ? styles.overlayHorizontalOnShortPane
              : styles.overlayVerticalOnShortPane),
          !isOverlay && (isHorizontal ? styles.horizontal : styles.vertical),
          !isOverlay &&
            !hasDivider &&
            (isHorizontal
              ? styles.noDividerHorizontal
              : styles.noDividerVertical),
          !isOverlay &&
            hasDivider &&
            isInteracting &&
            !isDragging &&
            styles.handleHover,
          !isOverlay && hasDivider && isDragging && styles.handleActive,
          isInputDisabled && styles.disabled,
          xstyle,
        ),
        className,
      )}
      {...props}
      // Keyboard resizing must fire from the focusable separator, not a child:
      // keydown fires on the focused element and bubbles up, so a handler on a
      // descendant never runs (per the WAI-ARIA window-splitter pattern).
      // Placed after {...props} and composed with any consumer onKeyDown so
      // this accessibility-critical handler can't be clobbered by a passed prop.
      onKeyDown={e => {
        props.onKeyDown?.(e);
        if (!isInputDisabled) {
          gesture?.keyDown(e);
        }
      }}>
      {/* Wider invisible hit area for pointer interaction */}
      <div
        {...stylex.props(
          styles.hitArea,
          isHorizontal ? styles.hitAreaHorizontal : styles.hitAreaVertical,
          isHorizontal
            ? rtlStyles.centerInline('0px')
            : styles.hitAreaCenteredY,
          isOverlay &&
            (isHorizontal
              ? styles.hitAreaWithinHandleX
              : styles.hitAreaWithinHandleY),
          !isOverlay &&
            paneLength != null &&
            (isHorizontal
              ? dynamicStyles.hitAreaLengthX(paneLength)
              : dynamicStyles.hitAreaLengthY(paneLength)),
          isInputDisabled && styles.disabled,
        )}
        {...grabHandlers}
      />
      {/* Pill grip indicator — themed via .astryx-resize-handle-pill */}
      {children ?? (
        <div
          {...mergeProps(
            themeProps('resize-handle-pill'),
            stylex.props(
              styles.pill,
              isHorizontal ? styles.pillHorizontal : styles.pillVertical,
              effectiveSide === 'center'
                ? rtlStyles.centerInline('-50%')
                : isHorizontal
                  ? dynamicStyles.pillOffsetX(
                      effectiveSide === 'start' ? -1 : 1,
                    )
                  : dynamicStyles.pillOffsetY(
                      effectiveSide === 'start' ? -1 : 1,
                    ),
              isHorizontal
                ? styles.pillGrabHorizontal
                : styles.pillGrabVertical,
              isAlwaysVisible ? styles.pillVisible : styles.pillHidden,
              !isAlwaysVisible &&
                effectiveSide !== 'center' &&
                (isHorizontal
                  ? effectiveSide === 'start'
                    ? styles.pillBridgeRight
                    : styles.pillBridgeLeft
                  : effectiveSide === 'start'
                    ? styles.pillBridgeDown
                    : styles.pillBridgeUp),
              isInteracting && !isDragging && styles.pillHover,
              isDragging && styles.pillActive,
              isInputDisabled && styles.disabled,
            ),
          )}
          {...grabHandlers}
        />
      )}
    </div>
  );
}

ResizeHandle.displayName = 'ResizeHandle';
