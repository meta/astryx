// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file CircularProgress.tsx
 * @input Uses React (useId, refs, layout effects), stylex, SVG, Web
 *   Animations, color/spacing/duration/ease tokens
 * @output Exports CircularProgress component, CircularProgressProps, CircularProgressSize, CircularProgressVariant types
 * @position Core implementation; consumed by index.ts
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/lab/src/CircularProgress/CircularProgress.doc.mjs (props table, features, implementation notes)
 * - /packages/lab/src/CircularProgress/CircularProgress.test.tsx (tests for new/changed behavior)
 * - /packages/lab/src/CircularProgress/index.ts (exports if types change)
 * - /apps/storybook/stories/CircularProgress.stories.tsx (storybook stories)
 */

import {useId, useLayoutEffect, useRef, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';

import {
  colorVars,
  durationVars,
  easeVars,
  fontWeightVars,
  spacingVars,
  typeScaleVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {mergeProps} from '@astryxdesign/core/utils';
import type {BaseProps} from '@astryxdesign/core';
import {themeProps} from '@astryxdesign/core/utils';

/**
 * Extensible variant map for CircularProgress.
 *
 * Theme packages can add custom variants via TypeScript module augmentation:
 * @example
 * ```
 * declare module '@astryxdesign/lab' {
 *   interface CircularProgressVariantMap {
 *     'brand': true;
 *   }
 * }
 * ```
 */
export interface CircularProgressVariantMap {
  accent: true;
  success: true;
  warning: true;
  error: true;
  neutral: true;
}

export type CircularProgressVariant = keyof CircularProgressVariantMap;

export type CircularProgressSize = 'sm' | 'md' | 'lg';

/** How far a turning layer's drawing reaches past the ring's box, in px. */
const FILL_BLEED = 2;

const SIZE_CONFIG = {
  sm: {diameter: 32, strokeWidth: 3},
  md: {diameter: 48, strokeWidth: 4},
  lg: {diameter: 64, strokeWidth: 5},
} as const;

export interface CircularProgressProps extends BaseProps<HTMLDivElement> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLDivElement>;
  /**
   * Current value of the circular progress.
   * Ignored when `isIndeterminate` is true.
   */
  value?: number;
  /**
   * Maximum value.
   * @default 100
   */
  max?: number;
  /**
   * Accessible label for the progress indicator. Required for a11y.
   */
  label: string;
  /**
   * When true, the label is visually hidden but remains accessible to screen readers.
   * @default true
   */
  isLabelHidden?: boolean;
  /**
   * When true, displays the formatted value (e.g. "75%") in the center of
   * the ring. Ignored when `isIndeterminate` is true or when `children`
   * provide custom center content.
   * @default false
   */
  hasValueLabel?: boolean;
  /**
   * Custom formatter for the value label.
   * @default (value, max) => `${Math.round((value / max) * 100)}%`
   */
  formatValueLabel?: (value: number, max: number) => string;
  /**
   * Content displayed in the center of the ring.
   * Typically a percentage string, icon, or custom content.
   * Takes precedence over `hasValueLabel`.
   */
  children?: ReactNode;
  /**
   * Diameter of the circular progress.
   * - 'sm': 32px
   * - 'md': 48px
   * - 'lg': 64px
   * @default 'md'
   */
  size?: CircularProgressSize;
  /**
   * Visual style variant mapped to semantic color tokens.
   * @default 'accent'
   */
  variant?: CircularProgressVariant;
  /**
   * When true, renders an animated indeterminate progress indicator.
   * Use when the progress amount is unknown (e.g. loading, processing).
   * The `value` and `hasValueLabel` props are ignored in this mode.
   * Respects `prefers-reduced-motion` by slowing the animation.
   * @default false
   */
  isIndeterminate?: boolean;
  /**
   * When true, the circular progress is visually disabled — the ring and
   * text use disabled colors. Use for canceled or inactive operations.
   * @default false
   */
  isDisabled?: boolean;
  /**
   * Test ID for testing utilities.
   */
  'data-testid'?: string;
}

// =============================================================================
// Indeterminate animation
// =============================================================================

const indeterminateRotation = stylex.keyframes({
  '0%': {transform: 'rotate(0deg)'},
  '100%': {transform: 'rotate(360deg)'},
});

// SVG dash percentages scale with the square viewport. A 300% gap exceeds every
// ring circumference; shifting the 2% + 300% pattern by 302% closes the loop.
const indeterminateDash = stylex.keyframes({
  '0%': {
    strokeDasharray: '2%, 300%',
    strokeDashoffset: '0%',
  },
  '50%': {
    strokeDasharray: '175%, 300%',
    strokeDashoffset: '-68%',
  },
  '100%': {
    strokeDasharray: '2%, 300%',
    strokeDashoffset: '-302%',
  },
});

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  root: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    flexShrink: 0,
  },
  rootWithLabel: {
    flexDirection: 'column',
    gap: spacingVars['--spacing-1'],
  },
  svg: {
    display: 'block',
    transform: 'rotate(-90deg)',
  },
  svgIndeterminate: {
    display: 'block',
    animationName: indeterminateRotation,
    animationDuration: {
      default: '2s',
      '@media (prefers-reduced-motion: reduce)': '4s',
    },
    animationTimingFunction: 'linear',
    animationIterationCount: 'infinite',
  },
  track: {
    fill: 'none',
    stroke: colorVars['--color-track'],
  },
  // The determinate fill moves on the compositor so a value change keeps
  // moving while a script runs (a `stroke-dashoffset` transition repaints on
  // the main thread every frame and stops). Two half-rings, each a static
  // half-circle stroke in a layer turned by `transform` and clipped to its
  // half of the box, draw the arc: the right half turns from 0 to 180deg over
  // the first half of the value, the left half over the second. Two round
  // caps close the arc's ends: one fixed at 12 o'clock, one turning with the
  // value. The ring is drawn clockwise in either direction, as before.
  //
  // The theme's duration and easing still time a change: they are declared
  // here and read back when the value changes (`transition-property: none`,
  // so nothing transitions on its own), in every motion setting, as the
  // stroke's transition did.
  fill: {
    position: 'absolute',
    inset: 0,
    // Clip to the ring's box, as the stroked circle's svg did.
    overflow: 'hidden',
    pointerEvents: 'none',
    transitionProperty: 'none',
    transitionDuration: durationVars['--duration-medium'],
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  fillHalf: {
    position: 'absolute',
    top: 0,
    width: '50%',
    height: '100%',
    overflow: 'hidden',
  },
  fillHalfRight: {
    left: '50%',
  },
  fillHalfLeft: {
    left: 0,
  },
  // A layer the size of the ring inside its half, so it turns about the
  // ring's center.
  fillTurn: {
    position: 'absolute',
    top: 0,
    width: '200%',
    height: '100%',
    willChange: 'transform, opacity',
  },
  fillTurnRight: {
    left: '-100%',
  },
  fillTurnLeft: {
    left: 0,
  },
  fillCap: {
    position: 'absolute',
    inset: 0,
    willChange: 'transform, opacity',
  },
  // A turning layer's drawing reaches a little past the ring's box, so its
  // antialiased outer edge is drawn whole before the layer turns (the box,
  // not the drawing, then clips it).
  fillShape: {
    display: 'block',
    fill: 'none',
    margin: -FILL_BLEED,
  },
  fillCapShape: {
    display: 'block',
    fill: 'none',
    strokeLinecap: 'round',
  },
  fillIndeterminate: {
    fill: 'none',
    strokeLinecap: 'round',
    animationName: indeterminateDash,
    animationDuration: {
      default: '1.5s',
      '@media (prefers-reduced-motion: reduce)': '3s',
    },
    animationTimingFunction: 'ease-in-out',
    animationIterationCount: 'infinite',
  },
  children: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  label: {
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    fontWeight: fontWeightVars['--font-weight-medium'],
    color: colorVars['--color-text-secondary'],
  },
  labelDisabled: {
    color: colorVars['--color-text-disabled'],
  },
  valueLabel: {
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    fontWeight: fontWeightVars['--font-weight-normal'],
    color: colorVars['--color-text-secondary'],
  },
  valueLabelDisabled: {
    color: colorVars['--color-text-disabled'],
  },
  visuallyHidden: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  },
  ringWrapper: {
    position: 'relative',
    display: 'inline-flex',
  },
});

const variantStyles = stylex.create({
  accent: {
    stroke: colorVars['--color-accent'],
  },
  success: {
    stroke: colorVars['--color-text-success'],
  },
  warning: {
    stroke: colorVars['--color-text-warning'],
  },
  error: {
    stroke: colorVars['--color-text-error'],
  },
  neutral: {
    stroke: colorVars['--color-text-disabled'],
  },
  disabled: {
    stroke: colorVars['--color-text-disabled'],
  },
});

const trackVariantStyles = stylex.create({
  accent: {
    stroke: colorVars['--color-accent-muted'],
  },
  success: {
    stroke: colorVars['--color-success-muted'],
  },
  warning: {
    stroke: colorVars['--color-warning-muted'],
  },
  error: {
    stroke: colorVars['--color-error-muted'],
  },
  neutral: {
    stroke: colorVars['--color-track'],
  },
});

function defaultFormatValueLabel(value: number, max: number): string {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return `${pct}%`;
}

/**
 * Each half-ring's turn and the leading cap's for a filled share `p` (0–1),
 * and which parts show. A half-ring parked at the edge of its half (the right
 * one at 0, the left one until the value passes half) is hidden, so its
 * antialiased end never leaves a hairline at 6 o'clock.
 */
function fillTurns(p: number) {
  const turn = 360 * p;
  return {
    right: Math.min(Math.max(turn, 0), 180),
    left: Math.min(Math.max(turn, 180), 360),
    cap: turn,
    rightShown: p > 0 ? 1 : 0,
    leftShown: p > 0.5 ? 1 : 0,
    caps: p > 0 ? 1 : 0,
  };
}

/** A CSS time (`410ms`, `0.41s`, or a list's first entry) in milliseconds. */
function parseTime(value: string): number {
  const first = value.split(',')[0]?.trim() ?? '';
  const amount = Number.parseFloat(first);
  if (!Number.isFinite(amount)) {
    return 0;
  }
  return first.endsWith('ms') ? amount : amount * 1000;
}

/**
 * The theme's easing as a function of time (0–1), evaluated by the browser
 * itself through a detached animation, so any CSS easing works. It runs only
 * where Web Animations exists (its caller returns first otherwise), on the
 * fill's computed `transition-timing-function`: one easing, which a browser
 * always reports as valid CSS.
 */
function easingOf(easing: string): (t: number) => number {
  const effect = new KeyframeEffect(null, null, {
    duration: 1000,
    easing,
    fill: 'both',
  });
  const probe = new Animation(effect);
  return t => {
    probe.currentTime = t * 1000;
    return effect.getComputedTiming().progress ?? t;
  };
}

/**
 * Keyframes for a change from `from` to `to` (filled shares), sampled once a
 * frame on the theme's easing, with an extra sample exactly where the arc
 * crosses 12 or 6 o'clock so each half stops and starts on time.
 */
function fillKeyframes(
  from: number,
  to: number,
  duration: number,
  ease: (t: number) => number,
) {
  const count = Math.max(8, Math.ceil(duration / (1000 / 60)));
  const grid = Array.from({length: count + 1}, (_, i) => i / count);
  const at = (t: number) => from + (to - from) * ease(t);
  // Where the eased path passes half (p = 0.5): a sample there, and one just
  // after it, so the halves hand over on time and the left half's
  // visibility steps rather than fades.
  const crossings: number[] = [];
  for (let i = 0; i < count; i++) {
    const a = grid[i];
    const b = grid[i + 1];
    const fa = at(a) - 0.5;
    const fb = at(b) - 0.5;
    if (fa === 0) {
      crossings.push(a);
    } else if (fa * fb < 0) {
      let low = a;
      let high = b;
      for (let k = 0; k < 24; k++) {
        const mid = (low + high) / 2;
        if ((at(low) - 0.5) * (at(mid) - 0.5) <= 0) {
          high = mid;
        } else {
          low = mid;
        }
      }
      crossings.push((low + high) / 2);
    }
  }
  const times = [
    ...new Set([
      ...grid,
      ...crossings,
      ...crossings.map(c => c + 1e-4).filter(t => t < 1),
    ]),
  ].sort((x, y) => x - y);
  const frames = times.map(t => ({t, ...fillTurns(t === 1 ? to : at(t))}));
  // The sample at a crossing sits exactly on half, where the left half reads
  // as hidden. Give it the side the arc is leaving instead, so the left half
  // steps at once both ways: shrinking through half, it used to fade out
  // from the sample before, while it still drew part of the arc (a lighter
  // band between the end cap and 6 o'clock for a frame).
  const onHalf = new Set(crossings);
  for (let i = 1; i < frames.length; i += 1) {
    if (onHalf.has(frames[i].t) || (frames[i].t === 1 && to === 0.5)) {
      frames[i].leftShown = frames[i - 1].leftShown;
    }
  }
  return {
    right: frames.map(f => ({
      offset: f.t,
      transform: `rotate(${f.right}deg)`,
      opacity: f.rightShown,
    })),
    left: frames.map(f => ({
      offset: f.t,
      transform: `rotate(${f.left}deg)`,
      opacity: f.leftShown,
    })),
    cap: frames.map(f => ({
      offset: f.t,
      transform: `rotate(${f.cap}deg)`,
      opacity: f.caps,
    })),
    start: frames.map(f => ({offset: f.t, opacity: f.caps})),
  };
}

/**
 * A circular/radial progress indicator that shows completion as a ring.
 *
 * In determinate mode, displays a known value as an arc fill.
 * In indeterminate mode, shows an animated spinning indicator.
 * Supports center content via children for labels, percentages, or icons,
 * or an automatic formatted value label via `hasValueLabel`.
 *
 * @example
 * ```
 * <CircularProgress value={75} label="Upload progress" hasValueLabel />
 * <CircularProgress isIndeterminate label="Loading..." />
 * <CircularProgress value={3.2} max={5} label="Disk usage" hasValueLabel
 *   formatValueLabel={(v, m) => `${v} GB / ${m} GB`} />
 * <CircularProgress value={30} label="Canceled" isDisabled hasValueLabel />
 * ```
 */
export function CircularProgress({
  value = 0,
  max = 100,
  label,
  isLabelHidden = true,
  hasValueLabel = false,
  formatValueLabel = defaultFormatValueLabel,
  children,
  size = 'md',
  variant = 'accent',
  isIndeterminate = false,
  isDisabled = false,
  xstyle,
  className,
  style,
  'data-testid': dataTestId,
  ref,
  ...rest
}: CircularProgressProps) {
  const labelId = useId();
  const {diameter, strokeWidth} = SIZE_CONFIG[size];
  const radius = (diameter - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // A non-finite value or max (e.g. a NaN from an upstream `loaded / total`
  // with total 0) would otherwise leak into aria-valuenow, the value label,
  // and the arc geometry as the string "NaN". Treat it as empty progress,
  // matching the max=0 handling below.
  const safeValue = Number.isFinite(value) ? value : 0;
  const safeMax = Number.isFinite(max) ? max : 0;
  const clampedValue = Math.min(Math.max(0, safeValue), safeMax);
  const percentage = safeMax > 0 ? clampedValue / safeMax : 0;
  const valueText = formatValueLabel(clampedValue, safeMax);

  const center = diameter / 2;

  const showLabel = !isLabelHidden;
  const showValueLabel = hasValueLabel && !isIndeterminate;
  const centerContent =
    children != null ? children : showValueLabel ? valueText : null;

  const fillVariant = isDisabled ? 'disabled' : variant;
  const trackVariant = isDisabled ? 'neutral' : variant;

  // A value change turns the fill's layers with Web Animations on the
  // compositor, from wherever the arc is drawn now (mid-change, the running
  // change's own curve says where) to the new value, on the theme's
  // duration and easing. What renders is always the resting state, so a
  // first render, a render without script, or a skipped animation shows the
  // value.
  const fillRef = useRef<HTMLSpanElement | null>(null);
  const rightRef = useRef<HTMLSpanElement | null>(null);
  const leftRef = useRef<HTMLSpanElement | null>(null);
  const capRef = useRef<HTMLSpanElement | null>(null);
  const startRef = useRef<SVGPathElement | null>(null);
  // Where the arc is drawn: the value at rest, or, when a change is
  // interrupted, the point its own curve has reached. A change's cleanup
  // records it and releases the change's animations (react-component-runtime
  // INV3), so the next change starts from there and an unmount or a switch to
  // indeterminate leaves nothing running. While indeterminate no value is
  // drawn (null): the ring draws its own arc, not the value it holds, so the
  // next value draws at once instead of sweeping from that held value.
  const drawn = useRef<number | null>(percentage);
  useLayoutEffect(() => {
    const from = drawn.current;
    if (isIndeterminate) {
      drawn.current = null;
      return;
    }
    if (from === null || from === percentage) {
      drawn.current = percentage;
      return;
    }
    const fill = fillRef.current;
    const layers = [
      rightRef.current,
      leftRef.current,
      capRef.current,
      startRef.current,
    ];
    drawn.current = percentage;
    if (
      fill == null ||
      layers.some(layer => typeof layer?.animate !== 'function')
    ) {
      return;
    }
    const style = getComputedStyle(fill);
    const duration = parseTime(style.transitionDuration);
    if (duration <= 0) {
      return;
    }
    const ease = easingOf(style.transitionTimingFunction);
    const frames = fillKeyframes(from, percentage, duration, ease);
    const timing: KeyframeAnimationOptions = {
      duration,
      easing: 'linear',
      fill: 'backwards',
    };
    const [right, left, cap, start] = layers as [
      HTMLElement,
      HTMLElement,
      HTMLElement,
      SVGElement,
    ];
    const animations = [
      right.animate(frames.right, timing),
      left.animate(frames.left, timing),
      cap.animate(frames.cap, timing),
      start.animate(frames.start, timing),
    ];
    return () => {
      const [first] = animations;
      const progress =
        first.playState !== 'finished'
          ? Number(first.effect?.getComputedTiming().progress ?? 1)
          : 1;
      // `progress` is the change's linear time fraction; the arc is drawn on
      // its easing, so the eased position is where it is.
      drawn.current = from + (percentage - from) * ease(progress);
      for (const animation of animations) {
        animation.cancel();
      }
    };
  }, [percentage, isIndeterminate]);
  const turns = fillTurns(percentage);
  // One half of the ring's stroke, from 6 o'clock clockwise to 12 (the left
  // half) before its layer turns; butt ends, the caps are drawn apart.
  const bleedBox = `${-FILL_BLEED} ${-FILL_BLEED} ${diameter + 2 * FILL_BLEED} ${diameter + 2 * FILL_BLEED}`;
  const halfRing = (
    <svg
      width={diameter + 2 * FILL_BLEED}
      height={diameter + 2 * FILL_BLEED}
      viewBox={bleedBox}
      {...stylex.props(styles.fillShape)}>
      <circle
        cx={center}
        cy={center}
        r={radius}
        strokeWidth={strokeWidth}
        strokeDasharray={`${circumference / 2} ${circumference}`}
        transform={`rotate(90 ${center} ${center})`}
      />
    </svg>
  );
  // A round cap at 12 o'clock on the ring's centerline (a zero-length stroke).
  const capPath = `M ${center} ${strokeWidth / 2} h 0`;

  return (
    <div
      ref={ref}
      {...mergeProps(
        themeProps('circular-progress', {variant, size}),
        stylex.props(styles.root, showLabel && styles.rootWithLabel, xstyle),
        className,
        style,
      )}
      data-testid={dataTestId}
      {...rest}>
      <span
        id={labelId}
        {...stylex.props(
          showLabel ? styles.label : styles.visuallyHidden,
          showLabel && isDisabled && styles.labelDisabled,
        )}>
        {label}
      </span>

      <div {...stylex.props(styles.ringWrapper)}>
        <svg
          role="progressbar"
          aria-labelledby={labelId}
          aria-valuenow={isIndeterminate ? undefined : clampedValue}
          aria-valuemin={isIndeterminate ? undefined : 0}
          aria-valuemax={isIndeterminate ? undefined : safeMax}
          aria-valuetext={isIndeterminate ? undefined : valueText}
          width={diameter}
          height={diameter}
          viewBox={`0 0 ${diameter} ${diameter}`}
          {...stylex.props(
            isIndeterminate ? styles.svgIndeterminate : styles.svg,
          )}>
          <circle
            {...mergeProps(
              themeProps('circular-progress-track'),
              stylex.props(styles.track, trackVariantStyles[trackVariant]),
            )}
            cx={center}
            cy={center}
            r={radius}
            strokeWidth={strokeWidth}
          />
          {isIndeterminate ? (
            <circle
              {...mergeProps(
                themeProps('circular-progress-fill', {variant: fillVariant}),
                stylex.props(
                  styles.fillIndeterminate,
                  variantStyles[fillVariant],
                ),
              )}
              cx={center}
              cy={center}
              r={radius}
              strokeWidth={strokeWidth}
            />
          ) : null}
        </svg>

        {isIndeterminate ? null : (
          // The determinate fill (see `styles.fill`). Its stroke color is
          // set on the theming target and inherited by every part.
          <span
            ref={fillRef}
            aria-hidden="true"
            {...mergeProps(
              themeProps('circular-progress-fill', {variant: fillVariant}),
              stylex.props(styles.fill, variantStyles[fillVariant]),
            )}>
            <span {...stylex.props(styles.fillHalf, styles.fillHalfRight)}>
              <span
                ref={rightRef}
                {...stylex.props(styles.fillTurn, styles.fillTurnRight)}
                style={{
                  transform: `rotate(${turns.right}deg)`,
                  opacity: turns.rightShown,
                }}>
                {halfRing}
              </span>
            </span>
            <span {...stylex.props(styles.fillHalf, styles.fillHalfLeft)}>
              <span
                ref={leftRef}
                {...stylex.props(styles.fillTurn, styles.fillTurnLeft)}
                style={{
                  transform: `rotate(${turns.left}deg)`,
                  opacity: turns.leftShown,
                }}>
                {halfRing}
              </span>
            </span>
            <svg
              width={diameter}
              height={diameter}
              viewBox={`0 0 ${diameter} ${diameter}`}
              {...stylex.props(styles.fillCap, styles.fillCapShape)}>
              <path
                ref={startRef}
                d={capPath}
                strokeWidth={strokeWidth}
                style={{opacity: turns.caps}}
              />
            </svg>
            <span
              ref={capRef}
              {...stylex.props(styles.fillCap)}
              style={{
                transform: `rotate(${turns.cap}deg)`,
                opacity: turns.caps,
              }}>
              <svg
                width={diameter + 2 * FILL_BLEED}
                height={diameter + 2 * FILL_BLEED}
                viewBox={bleedBox}
                {...stylex.props(styles.fillCapShape, styles.fillShape)}>
                <path d={capPath} strokeWidth={strokeWidth} />
              </svg>
            </span>
          </span>
        )}

        {centerContent != null && (
          <div {...stylex.props(styles.children)}>
            {children != null ? (
              children
            ) : (
              <span
                {...stylex.props(
                  styles.valueLabel,
                  isDisabled && styles.valueLabelDisabled,
                )}>
                {valueText}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

CircularProgress.displayName = 'CircularProgress';
