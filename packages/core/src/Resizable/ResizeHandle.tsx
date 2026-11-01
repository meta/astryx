// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ResizeHandle.tsx
 * @input direction, isReversed, hasDivider, isAlwaysVisible, pillPlacement, ResizableProps
 * @output Styled drag handle with WAI-ARIA separator role and keyboard support
 * @position Between resizable panels; consumed directly by builders
 *
 * The handle element is 1px wide (the divider line itself), with an
 * absolutely-positioned wider hit area for pointer interaction.
 * Pill grip indicator can sit on either side of the divider (or centered)
 * via pillPlacement. Default 'auto' places the pill on the panel side and
 * flips when the panel collapses to 0px so it stays accessible.
 *
 * Pill placement uses a single stylex dynamic style that accepts a direction
 * multiplier (-1 or 1). The pill element has its own themeProps
 * ('resize-handle-pill') so themes can target size/shape directly.
 *
 * While the panel is collapsed, aria-valuenow is clamped to aria-valuemin
 * (a value below the minimum is invalid per WCAG 4.1.2) and a localized
 * "Collapsed" aria-valuetext announces the real state.
 *
 * The handle's input (the pointer drag, the keys, the double-click) is the
 * window splitter's one implementation, resizeGesture.ts, which createResizable
 * also drives. ResizeHandle forwards its React events to it: from the region a
 * `resizable` prop describes, or from the createResizable that
 * `useResizable(handleRef, options)` attached to this element, whose state it
 * renders. Dragging takes pointer capture on the grab zone, so the move, up
 * and cancel events of the gesture are delivered there (as in Slider), even
 * when the pointer crosses an embedded frame.
 */

import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type {ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {BaseProps} from '../BaseProps';
import {devWarn} from '../utils/devWarning';
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
  releaseResizeHandle,
  type ResizeGesture,
  type ResizeGestureModel,
} from './resizeGesture';
import {regionOfProps} from './resizablePane';
import {themeProps} from '../utils/themeProps';
import {useTranslator} from '../i18n';

import {useMergedRefs} from '../hooks/useMergedRefs';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {useDevWarning} from '../hooks/useDevWarning';
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

/**
 * Hit-area inline bias, expressed as a fraction of the pill's per-side offset.
 *
 * The visible pill is placed by `pillOffsetX`/`pillOffsetY`: anchored at the
 * divider's inline-start edge and pushed one grip-width-plus-gap toward the
 * panel side via a PHYSICAL translate (dir −1 = start, +1 = end). Because that
 * offset is physical, the pill sits on the same physical side of the divider in
 * both LTR and RTL. The grab zone must sit OVER that pill, so it has to use the
 * exact same anchor + physical-offset construction as the pill (just wider) —
 * anchoring the hit area at the divider centre (`insetInlineStart: 50%`) and
 * biasing with a percentage translate mixes a logical anchor (which flips under
 * RTL) with a physical translate (which doesn't), leaving the grab zone stranded
 * to one side under RTL. Returning the pill's `dir` here lets the hit area reuse
 * `pillOffsetX`/`pillOffsetY` so the two elements are positioned identically.
 */
function hitAreaBiasDir(
  effectiveSide: 'start' | 'end' | 'center',
): number | null {
  if (effectiveSide === 'center') {
    return null;
  }
  return effectiveSide === 'start' ? -1 : 1;
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
  // Centered grab zone (pillPlacement 'center' / no bias): sit the hit area on
  // the divider itself. Inline centering comes from rtlStyles.centerInline at
  // the call site (correct in LTR and RTL); this block owns only the block axis.
  hitAreaCenteredY: {
    insetBlockStart: '50%',
    transform: 'translateY(-50%)',
  },

  // Pill base — themes target .astryx-resize-handle-pill for size/shape.
  pill: {
    position: 'absolute',
    zIndex: 2,
    pointerEvents: 'none',
    borderRadius: radiusVars['--radius-full'],
    backgroundColor: colorVars['--color-border'],
    transitionProperty: 'opacity, background-color, transform',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
    top: '50%',
  },
  pillHorizontal: {
    width: 3,
    height: spacingVars['--spacing-8'],
  },
  pillVertical: {
    width: spacingVars['--spacing-8'],
    height: 3,
  },
  pillHidden: {opacity: 0},
  pillVisible: {opacity: 1},
  pillHover: {
    opacity: 1,
    backgroundColor: colorVars['--color-border'],
  },
  pillActive: {
    opacity: 1,
    backgroundColor: colorVars['--color-border-emphasized'],
  },
});

// Dynamic styles — avoids inline style overrides.
// Each axis gets its own function since StyleX requires static structure.
const dynamicStyles = stylex.create({
  // Hit-area inline offset — mirrors the pill's `pillOffsetX`/`pillOffsetY`
  // construction so the grab zone sits centred on the visible pill in BOTH
  // directions. Both anchor at the divider's inline-start edge
  // (`insetInlineStart: 0`) and travel toward the panel side with the SAME
  // physical translate `dir * (gripWidth + gap)`, so they share the pill's
  // near edge. The hit area is wider, so it also shifts by half the width
  // difference `(16px − 3px) / 2 = 6.5px` to align the two CENTRES. That
  // centring shift is along the inline axis (a box grows from its inline-start
  // edge toward inline-end), so it must flip physical sign under RTL — unlike
  // the `dir * (...)` travel, which is physical and identical in both
  // directions because the pill's own offset is physical. Mixing the previous
  // divider-relative `50%` anchor with a percentage translate stranded the grab
  // zone to one side under RTL; this construction keeps it on the pill.
  //
  // Only the offset axis is translated. Unlike the pill — a small box anchored
  // at the divider's midpoint, so it needs a −50% self-shift to centre — the
  // grab zone is STRETCHED along the handle by hitAreaHorizontal/Vertical's
  // 0/0 insets, so it is already in place on that axis. A percentage there
  // would displace it by half the handle's own length, growing with the panel.
  hitAreaOffsetX: (dir: number) => ({
    insetInlineStart: 0,
    transform: {
      default: `translateX(calc(${dir} * (3px + ${spacingVars['--spacing-1']}) - 6.5px))`,
      ':is([dir="rtl"] *)': `translateX(calc(${dir} * (3px + ${spacingVars['--spacing-1']}) + 6.5px))`,
    },
  }),
  hitAreaOffsetY: (dir: number) => ({
    insetBlockStart: 0,
    transform: `translateY(calc(${dir} * (3px + ${spacingVars['--spacing-1']}) - 6.5px))`,
  }),
  pillOffsetX: (dir: number) => ({
    insetInlineStart: 0,
    transform: `translate(calc(${dir} * (100% + ${spacingVars['--spacing-1']})), -50%)`,
  }),
  // Vertical offset: no rotation — use explicit landscape dimensions.
  // Rotation + offset creates confusing coordinate math since translate
  // operates in pre-rotation local space.
  pillOffsetY: (dir: number) => ({
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
   * Which side of the divider line the pill sits on.
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
  const t = useTranslator();
  const label = labelFromProps ?? t('@astryx.resizable.handle.label');
  const handleRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const isHorizontal = direction === 'horizontal';
  const isOverlay = positionMode === 'overlay';

  // --- The region a `resizable` prop describes ---
  // Its gesture reads the latest props at each input, so a whole drag sees
  // the region as it is now, not as a snapshot from the press.
  const resizableRef = useRef(resizable);
  resizableRef.current = resizable;
  const configRef = useRef({direction, isReversed, isDisabled});
  configRef.current = {direction, isReversed, isDisabled};
  const [isLegacyDragging, setIsLegacyDragging] = useState(false);
  const [legacyGesture] = useState<ResizeGesture>(() => {
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
      start: () => resizableRef.current?._onResizeStart(),
      move: delta => resizableRef.current?._onResizeMove(delta),
      end: () => resizableRef.current?._onResizeEnd(),
      // Not a resize end, but still the end of the gesture: the region froze
      // state for the duration of the drag and has to be told it is over.
      cancel: () => resizableRef.current?._onResizeCancel?.(),
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
      isDragging => {
        setIsLegacyDragging(isDragging);
        // The hook's region lets a pointer drag reopen its pane without a
        // slide (component:Resizable FR8); a hand-built object has none.
        const region = resizableRef.current;
        if (region != null) {
          regionOfProps(region)?.setPointerDragging(isDragging);
        }
      },
    );
  });

  // --- The createResizable that useResizable(handleRef) attached here ---
  const [claim] = useState(createResizeHandleClaim);
  const claimedElementRef = useRef<HTMLDivElement | null>(null);
  // A callback ref, so the hook holding the ref this handle is given hears of
  // the element as it attaches and lets go, without its own component
  // rendering: a handle a child mounts, unmounts, or hides and shows in its
  // own `<Activity>` is bound and unbound at once. It runs after the caller's
  // ref is set (see the merged refs below).
  const claimRef = useCallback(
    (element: HTMLDivElement | null) => {
      const previous = claimedElementRef.current;
      if (previous === element) {
        return;
      }
      if (previous != null) {
        releaseResizeHandle(previous, claim);
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
  // bound its factory in its own layout effect, and does not read them again
  // when an `<Activity>` shows this handle. This subscription is live from the
  // layout phase: a factory bound in the commit that mounts or shows the
  // handle, and what it reports, render before paint.
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
  // named on this element.
  const view = resizable != null ? null : bound;
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
    resizable != null ? legacyGesture : (binding?.gesture ?? null);
  const isDragging = resizable != null ? isLegacyDragging : !!view?.isDragging;
  const isInputDisabled = isDisabled || !!view?.isDisabled;
  const isCollapsed = resizable?._isCollapsed ?? view?.isCollapsed ?? false;
  const effectiveSide = resolveEffectiveSide(
    pillPlacement,
    view?.isReversed ?? isReversed,
    isCollapsed,
  );
  // Physical offset direction shared by the pill and the grab zone (null =
  // centered / no bias). Keeps the two positioned identically in LTR and RTL.
  const hitBiasDir = hitAreaBiasDir(effectiveSide);
  const isInteracting = isHovered || isFocused;

  // A handle whose axis disagrees with its region drags along one axis while
  // the region measures percentage bounds on the other. `ResizableProps` is
  // exported, so `_direction` is optional for old hand-built objects; absent
  // means there is no region axis to compare, not that it is horizontal.
  const didWarnAxisRef = useRef(false);
  const regionDirection = resizable?._direction ?? view?.direction;
  useEffect(() => {
    if (didWarnAxisRef.current) {
      return;
    }
    if (regionDirection != null && regionDirection !== direction) {
      didWarnAxisRef.current = true;
      devWarn(
        'ResizeHandle',
        `direction="${direction}" but its useResizable region is ` +
          `"${regionDirection}". They must match: the hook measures one axis ` +
          'and the handle drags the other.',
      );
    }
  }, [direction, regionDirection]);
  useDevWarning(
    'ResizeHandle',
    'has a `resizable` prop and a useResizable(handleRef) region at once. ' +
      'The `resizable` prop wins; pass one of them.',
    resizable != null && binding != null,
  );

  // --- Cleanup on unmount ---
  // Removing the grab zone implicitly releases its captured pointer and takes
  // its listeners with it, so an in-flight drag stops driving the region on
  // its own. The body cursor/user-select overrides are not on the element,
  // though, so they have to be released here or they stick after the handle
  // is gone, and the region, which outlives this handle, still has to hear
  // that its gesture is over.
  const gestureRef = useRef(gesture);
  gestureRef.current = gesture;
  useEffect(() => {
    return () => {
      gestureRef.current?.interrupt();
    };
  }, []);

  // --- ARIA ---
  // When collapsed the panel's real size (0) sits below aria-valuemin, which
  // is invalid per WCAG 4.1.2. Clamp aria-valuenow to the minimum and announce
  // the true state via aria-valuetext instead; the valuetext is removed as
  // soon as the panel expands so the numeric value reads again.
  const sizeNow = resizable?._size ?? view?.size;
  const minNow = resizable?._minSizePx ?? view?.minPx;
  const ariaValueNow =
    sizeNow == null || minNow == null
      ? undefined
      : isCollapsed
        ? Math.max(sizeNow, minNow)
        : sizeNow;
  const ariaValueMin = minNow;
  // A separator with a value needs a maximum (WAI-ARIA, APG window splitter).
  // Unbounded regions report the basis they can fill; a hand-built props
  // object without it reports only a configured maximum.
  const effectiveMax = resizable
    ? (getEffectiveMaxPx(resizable) ??
      (resizable._maxSizePx !== Infinity ? resizable._maxSizePx : undefined))
    : view?.effectiveMaxPx;
  const ariaValueMax =
    effectiveMax != null && Number.isFinite(effectiveMax)
      ? effectiveMax
      : undefined;
  const ariaValueText =
    (resizable != null || view != null) && isCollapsed
      ? t('@astryx.resizable.collapsed')
      : undefined;

  return (
    <div
      ref={useMergedRefs(ref, handleRef, claimRef)}
      role="separator"
      aria-orientation={isHorizontal ? 'vertical' : 'horizontal'}
      aria-valuenow={ariaValueNow}
      aria-valuemin={ariaValueMin}
      aria-valuemax={ariaValueMax}
      aria-valuetext={ariaValueText}
      aria-label={label}
      aria-disabled={isInputDisabled || undefined}
      tabIndex={isInputDisabled ? -1 : 0}
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
          // Bias the grab zone to sit over the visible pill. When the pill is
          // centered (no bias) just center the hit area on the divider; when
          // it's offset to a panel side, reuse the pill's physical-offset
          // construction so the two stay aligned in LTR and RTL alike.
          hitBiasDir == null
            ? isHorizontal
              ? rtlStyles.centerInline('0px')
              : styles.hitAreaCenteredY
            : isHorizontal
              ? dynamicStyles.hitAreaOffsetX(hitBiasDir)
              : dynamicStyles.hitAreaOffsetY(hitBiasDir),
          isInputDisabled && styles.disabled,
        )}
        onPointerDown={e => {
          if (!isInputDisabled) {
            gesture?.pointerDown(e);
          }
        }}
        onPointerMove={e => gesture?.pointerMove(e)}
        onPointerUp={e => gesture?.pointerUp(e)}
        onPointerCancel={e => gesture?.pointerCancel(e)}
        onLostPointerCapture={e => gesture?.pointerCancel(e)}
        onPointerEnter={() => setIsHovered(true)}
        onPointerLeave={() => {
          if (!isDragging) {
            setIsHovered(false);
          }
        }}
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
              isAlwaysVisible ? styles.pillVisible : styles.pillHidden,
              isInteracting && !isDragging && styles.pillHover,
              isDragging && styles.pillActive,
            ),
          )}
        />
      )}
    </div>
  );
}

ResizeHandle.displayName = 'ResizeHandle';
