// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Spinner.tsx
 * @input Uses React, i18n (useTranslator), StyleX, SVG rendering
 * @output Exports Spinner component, SpinnerProps, SpinnerSize, SpinnerShade types
 * @position Core implementation of spinner loading indicator
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Spinner/Spinner.doc.mjs
 * - /packages/core/src/Spinner/Spinner.test.tsx
 * - /packages/core/src/Spinner/index.ts
 * - /apps/storybook/stories/Spinner.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/Spinner/ (showcase blocks)
 */

import {useId, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {colorVars, durationVars, spacingVars} from '../theme/tokens.stylex';
import type {BaseProps} from '../BaseProps';
import {Text} from '../Text/Text';
import {mergeProps} from '../utils/mergeProps';
import {useTranslator} from '../i18n/useTranslator';
import {themeProps} from '../utils/themeProps';

// =============================================================================
// Constants
// =============================================================================

/**
 * Default fraction of the ring the moving arc covers. The canvas ring this
 * replaces swept 135deg, not the 270deg its constant's comment claimed.
 *
 * Themeable via `--spinner-arc-fraction`, declared alongside the other public
 * vars in `sizeStyles` below. Only the inline `strokeDasharray` attribute
 * (the pre-stylesheet render — see its own comment) still reads this
 * constant directly; the CSS side composes the dash from the live var.
 */
const ARC_FRACTION = 0.375;

const PI = 3.141592653589793;

const SIZES = {
  sm: {diameter: 10, border: 2},
  md: {diameter: 14, border: 3},
  lg: {diameter: 18, border: 3},
  xl: {diameter: 28, border: 4},
};

/**
 * Opacity the track is drawn at, per shade. `77 / 255` is the `4D` the onMedia
 * track used to append to the token's hex — the same composite, but applied as
 * `stroke-opacity` to a color off the cascade, so it no longer depends on the
 * token being hex notation and it applies to a themed color too.
 */
const TRACK_OPACITY: Record<SpinnerShade, number> = {
  default: 1,
  subtle: 1,
  onMedia: 77 / 255,
  inherit: 0.3,
};

/**
 * Where the resolved geometry lands: the public var, resolved into a registered
 * `<length>` the `calc()`s below can do arithmetic on. The box and the ring
 * read these; the public vars are declared once, on the element carrying the
 * theme target, by `sizeStyles`.
 */
const RESOLVED_DIAMETER = '--_spinner-ring-diameter';
const RESOLVED_STROKE = '--_spinner-ring-stroke';
const RESOLVED_GEOMETRY_VARS = [RESOLVED_DIAMETER, RESOLVED_STROKE];

/**
 * The composed box size: diameter plus a stroke width on each side.
 *
 * It is deliberately NOT registered, unlike the pair above. The element reads
 * it through an inline `width`/`height` with the size's own default as the
 * `var()` fallback, so a render with no stylesheet — where nothing declares
 * it — still sizes the box the way it always did. A registered property always
 * has a value (its `initial-value`), which would swallow that fallback and
 * collapse the box to zero.
 */
const BOX_SIZE = '--_spinner-box-size';

/**
 * Register the resolved geometry vars as `<length>`.
 *
 * Both are consumed inside `calc()` — the box adds two stroke widths to a diameter,
 * the circle halves one. Unregistered, a custom property substitutes as text,
 * so whatever a theme wrote lands in the expression verbatim and a bare `0`
 * (a valid length on its own, a `<number>` inside `calc()`) poisons the sum:
 * `calc(28px + 0 * 2)` is invalid at computed-value time and the box loses its
 * size. Registered, the value is already an absolute length by the time the
 * `calc()` sees it, so `0` means `0px` — a zero-width stroke that paints
 * nothing — rather than a bare `0` that invalidates the sum and leaves the box
 * with no size at all. One `stroke-width` drives both circles, so a themed
 * stroke width of `0` hides the arc along with the track; an arc with no track behind
 * it is `--spinner-track-color: transparent`.
 *
 * Only these private vars are registered. The four public ones deliberately
 * are not: a registered property has an `initial-value`, so every element in
 * the document would report a value for it — and
 * `.github/scripts/theme-var-reachability.js` finds a var's declaring element
 * by exactly that test, so registering them would point the guard at `<html>`
 * and report a var no theme can select.
 */
function registerSpinnerVars(): void {
  if (
    typeof CSS === 'undefined' ||
    typeof CSS.registerProperty !== 'function'
  ) {
    return;
  }
  for (const name of RESOLVED_GEOMETRY_VARS) {
    try {
      CSS.registerProperty({
        name,
        syntax: '<length>',
        inherits: true,
        initialValue: '0px',
      });
    } catch {
      // Already registered — a second copy of the package on the page, or a
      // fast-refresh re-evaluation. registerProperty throws rather than
      // replacing, and the existing registration is this same one.
    }
  }
}

// Registering an inherited property with an `initial-value` invalidates style
// for the whole document, so this runs when the module is evaluated rather
// than when a spinner mounts. A spinner is the loading indicator: it mounts
// onto a page that is already rendered, with someone already waiting, and the
// recalc it triggers there is paid on the full tree. At import the tree is
// whatever has rendered so far, which for a bundle loaded in the head is
// nothing.
//
// It is safe at module scope in both directions. The `typeof CSS` guard above
// keeps it out of the server render, and tree-shaking cannot strip it from a
// build that renders a spinner: core's `sideEffects` allowlist does not name
// this file, so a bundle that never imports `Spinner` drops the module whole —
// registration and all, which is the outcome you want — while one that does
// import it keeps the module, and a bare call is not something a bundler may
// elide.
registerSpinnerVars();

/**
 * Pin every ring's dash motion to the document timeline's origin instead of
 * its own start time, so spinners mounted seconds apart stay in phase.
 *
 * Setting `startTime` is exact where arithmetic on a clock read is not: a
 * negative `animation-delay` computed at mount is only as good as the gap
 * between reading the clock and the frame the animation starts in, which at
 * 10x CPU throttling measured 116deg of drift (from when this animated a
 * literal rotation; the same drift risk applies to the dash offset now).
 *
 * Rings are collected and pinned in one frame because `getAnimations()`
 * resolves style and `startTime` dirties it again, so pinning them one at a
 * time makes each mount re-force what the previous one invalidated — 53 style
 * recalcs for 38 spinners against 19 batched.
 */
const pendingRings = new Set<SVGSVGElement>();
let flushScheduled = false;

function pinRingsToTimelineOrigin(): void {
  flushScheduled = false;
  const animations: Animation[] = [];
  for (const svg of pendingRings) {
    // The animation now runs on the arc <circle>, a descendant of the ring
    // this ref sits on (#6253), so it needs subtree:true to be found here.
    animations.push(...svg.getAnimations({subtree: true}));
  }
  pendingRings.clear();
  for (const animation of animations) {
    animation.startTime = 0;
  }
}

/**
 * Ref callback for the ring: the one place a mounted ring touches the DOM.
 *
 * It reads nothing back — the geometry is resolved by the cascade, not in JS.
 */
function syncRotationPhase(
  svg: SVGSVGElement | null,
): (() => void) | undefined {
  if (svg == null) {
    return undefined;
  }
  // jsdom implements no Web Animations, and this runs in every consumer's
  // component tests.
  if (typeof svg.getAnimations !== 'function') {
    return undefined;
  }
  pendingRings.add(svg);
  if (!flushScheduled) {
    flushScheduled = true;
    requestAnimationFrame(pinRingsToTimelineOrigin);
  }
  return () => {
    pendingRings.delete(svg);
  };
}

// =============================================================================
// Animation
// =============================================================================

/**
 * Moves the dash around a stationary circle instead of rotating the whole
 * ring. WebKit re-antialiases a rotating stroked shape's rounded cap
 * (`strokeLinecap: 'round'`, below) slightly differently at each intermediate
 * angle, which reads as a visible wobble on iOS Safari independent of
 * compositing (#6253) — confirmed by a real-device test against this exact
 * fix, since `willChange`/layer promotion alone (the earlier fix for #3617)
 * only smooths the rotation's motion, not the per-frame stroke rasterization.
 * A static circle with an animated `stroke-dashoffset` never rotates, so
 * WebKit never re-rasterizes the cap at an intermediate angle at all.
 */
const dashMotion = stylex.keyframes({
  '0%': {strokeDashoffset: '0px'},
  '100%': {strokeDashoffset: `calc(var(${RESOLVED_DIAMETER}) * -${PI})`},
});

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  wrapper: {
    display: 'inline-flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
  },
  spinner: {
    display: 'inline-grid',
    placeItems: 'center',
    verticalAlign: 'middle',
    // The public geometry vars, resolved into the registered `<length>` pair
    // the arithmetic below needs. Reading them here rather than in each
    // `calc()` keeps one place where a themed value enters the component, and
    // it is the span that reads them whether the theme target is the span or
    // the wrapper — a custom property inherits either way.
    [RESOLVED_DIAMETER]: 'var(--spinner-diameter)',
    [RESOLVED_STROKE]: 'var(--spinner-stroke-width)',
    // The size of the box, composed here and applied as an inline style at the
    // element, so that the box and the drawn ring come from the same two vars
    // and a themed size moves both together — without the sizing moving from
    // an inline style to a rule, which would hand a caller's `style={{width}}`
    // a precedence over the box that it has never had.
    [BOX_SIZE]: `calc(var(${RESOLVED_DIAMETER}) + var(${RESOLVED_STROKE}) * 2)`,

    // The box is the ring's size, and a host does not get to take that away.
    //
    // `overflow: hidden` used to sit here, carried over from the canvas ring
    // this component no longer draws. It clipped nothing — the painted circle
    // is inscribed in the box, so hiding and showing the overflow render
    // byte-identical pixels at every size, every shade, the labelled case and
    // every rotation angle. What it did do is remove the floor under this box:
    // a flex item whose overflow is not `visible` has an automatic minimum
    // size of zero, so a narrow flex host was free to compress the box while
    // the ring kept drawing at the size its own attributes ask for, and then
    // the clip cut the ring off at the box edge. Ordinary rows hit it — a
    // spinner beside a label in a 140px row lost 4px of its ring, one beside a
    // `flex: 1 0 100px` sibling lost half of it — with nothing reporting a
    // problem, because a sliced ring still spins.
    //
    // `flex-shrink: 0` then states the invariant directly rather than leaving
    // it to the automatic minimum size, which a host takes away again the
    // moment it sets `min-width: 0` on its items. A spinner that does not fit
    // overflows its host visibly instead of being silently sliced.
    flexShrink: 0,
  },
  ring: {
    backfaceVisibility: 'hidden',
    display: 'block',
    // The frame is the box, read from the same composed var the span is sized
    // from — not from the size constant, which a theme cannot reach, and not
    // from a percentage, which needs the grid area to be a definite size in
    // both axes (an unresolved percentage height on an SVG falls back to the
    // replaced-element default of 150px and drops the ring below the box).
    // One expression, one source of truth, resolves in any layout.
    width: `var(${BOX_SIZE})`,
    height: `var(${BOX_SIZE})`,
    // The svg is sized in CSS (100% of the span) rather than from the size
    // constant, so one user unit is one CSS pixel AND the frame follows a
    // themed diameter: the span's box is `diameter + 2 x stroke`, both public
    // vars, so ring and frame move together. Sizing it from the constant
    // instead left the svg larger than the box the moment a theme changed the
    // diameter — an overflowing grid item aligns to start rather than centre,
    // which put the ring 1.5-3.3px off across the four sizes.
    overflow: 'visible',
  },
  circle: {
    fill: 'none',
    // The ring is centred on the box (cx/cy 50%), so the arc's start offset
    // pivots there too — as a CSS transform, since the SVG `transform`
    // attribute would need that centre as a number in user units.
    transformBox: 'fill-box',
    transformOrigin: 'center',
    strokeLinecap: 'round',
    // The geometry the ring is actually drawn at. `r` and `stroke-width` are
    // CSS properties on an SVG shape, and a CSS declaration outranks the
    // presentation attribute of the same name — so the attributes below stay
    // as the size's default (and as what a server render and a no-CSS render
    // draw), and these take over the moment the cascade has a themed value.
    r: `calc(var(${RESOLVED_DIAMETER}) / 2)`,
    strokeWidth: `var(${RESOLVED_STROKE})`,
  },
  // The two ring colors ride `stroke` directly, read off the public vars the
  // shade declares. The paint comes from the cascade, so every notation a
  // theme can write — `var()`, `color-mix()`, and the `currentColor` the
  // inherit shade is built on — resolves where it is used, and a color changed
  // after mount repaints instead of going stale.
  //
  // The dash pattern is composed from the resolved diameter the same way, so a
  // themed ring keeps the same fraction of arc rather than the same absolute
  // dash. `pathLength` would be the shorter route to that, but it rescales the
  // pattern against the path length the UA measures on its own approximation
  // of the circle — 87.398 against the 87.965 of pi x 28 — which shortens the
  // default arc by 0.64% and moves the cap by half a pixel. Composing the
  // lengths keeps the default byte-identical to what it drew before.
  //
  // The fraction itself also rides a public var (`--spinner-arc-fraction`),
  // unregistered like the other three color/geometry public vars — it is
  // read as a bare `<number>` multiplier here, never summed with a unitless
  // `0` the way the registered length pair guards against, so it needs no
  // registration.
  arc: {
    // Slow the motion dramatically under reduced-motion rather than freezing
    // it (a frozen spinner reads as broken), matching ProgressBar's approach.
    // The role="status" + "Loading" label still convey busy state (obs-6).
    animationDuration: {
      // The loop reads the duration before a theme's tempo scales it
      // (spec:AST-108 FR4).
      default: `var(--_astryx-pre-tempo-duration-slow-min, ${durationVars['--duration-slow-min']})`,
      '@media (prefers-reduced-motion: reduce)': '3s',
    },
    animationIterationCount: 'infinite',
    animationName: dashMotion,
    animationTimingFunction: 'linear',
    stroke: 'var(--spinner-color)',
    transform: 'rotate(-90deg)',
    strokeDasharray: `calc(var(${RESOLVED_DIAMETER}) * ${PI} * var(--spinner-arc-fraction)) calc(var(${RESOLVED_DIAMETER}) * ${PI} * (1 - var(--spinner-arc-fraction)))`,
  },
  track: {stroke: 'var(--spinner-track-color)'},
});

// What each named `size` and `shade` resolve to. Both groups DECLARE the four
// public vars, on the element that carries the `spinner` theme target, and
// everything downstream reads them — so a theme's `@layer astryx-theme` rule
// against `.astryx-spinner[data-size="xl"]` overrides the default the same way it does for
// `--tree-list-indent` or `--button-focus-offset`, e.g.
// spinner: { 'size:xl': { '--spinner-diameter': '40px' } }.
//
// Declaring is only safe because #5410 moved the compiled StyleX CSS inside
// `@layer astryx-base`. Before it, StyleX emitted custom-property
// declarations at priority 0 and therefore OUTSIDE its layers, and an
// unlayered declaration beats every layer — so a StyleX-declared
// `--spinner-diameter: 10px` shadowed the theme's own rule no matter how
// specific the theme got. An earlier revision of this component worked around
// that by never declaring the public var and reading it with the default as a
// `var()` fallback; that is no longer necessary, and the fallback shape has a
// cost of its own — with nothing declaring the var,
// `theme-var-reachability.js` cannot find an element to check, so a documented
// var reads as unreachable.
// Arc fraction is not itself size-dependent, but it declares alongside the
// two vars that are, on the same per-size condition (`!hasLabel` gate at the
// call site) — it needs a home on whichever element carries the theme
// target, and this is the object already wired to be there.
const sizeStyles = stylex.create({
  sm: {
    '--spinner-diameter': `${SIZES.sm.diameter}px`,
    '--spinner-stroke-width': `${SIZES.sm.border}px`,
    '--spinner-arc-fraction': `${ARC_FRACTION}`,
  },
  md: {
    '--spinner-diameter': `${SIZES.md.diameter}px`,
    '--spinner-stroke-width': `${SIZES.md.border}px`,
    '--spinner-arc-fraction': `${ARC_FRACTION}`,
  },
  lg: {
    '--spinner-diameter': `${SIZES.lg.diameter}px`,
    '--spinner-stroke-width': `${SIZES.lg.border}px`,
    '--spinner-arc-fraction': `${ARC_FRACTION}`,
  },
  xl: {
    '--spinner-diameter': `${SIZES.xl.diameter}px`,
    '--spinner-stroke-width': `${SIZES.xl.border}px`,
    '--spinner-arc-fraction': `${ARC_FRACTION}`,
  },
});

const shadeStyles = stylex.create({
  default: {
    '--spinner-color': colorVars['--color-accent'],
    '--spinner-track-color': colorVars['--color-track'],
  },
  subtle: {
    '--spinner-color': colorVars['--color-text-secondary'],
    '--spinner-track-color': colorVars['--color-track'],
  },
  onMedia: {
    '--spinner-color': colorVars['--color-on-dark'],
    '--spinner-track-color': colorVars['--color-on-dark'],
  },
  inherit: {
    '--spinner-color': 'currentColor',
    '--spinner-track-color': 'currentColor',
  },
});

// The track's alpha is a property, not a color: it composites over whatever
// color the shade or the theme supplies. `77 / 255` is the `4D` the onMedia
// token's hex used to carry.
const trackOpacityStyles = stylex.create({
  default: {strokeOpacity: TRACK_OPACITY.default},
  subtle: {strokeOpacity: TRACK_OPACITY.subtle},
  onMedia: {strokeOpacity: TRACK_OPACITY.onMedia},
  inherit: {strokeOpacity: TRACK_OPACITY.inherit},
});

// =============================================================================
// Types
// =============================================================================

export type SpinnerSize = keyof typeof SIZES;

export type SpinnerShade = 'default' | 'onMedia' | 'subtle' | 'inherit';

export interface SpinnerProps extends BaseProps<HTMLSpanElement> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLSpanElement>;
  /**
   * Spinner size. The diameter is the ring itself; the rendered box adds the
   * stroke width on each side (xl draws a 28px ring in a 36px box). A theme can
   * redefine what each named size resolves to — see `--spinner-diameter`.
   * - 'sm': 10px diameter
   * - 'md': 14px diameter
   * - 'lg': 18px diameter
   * - 'xl': 28px diameter
   * @default 'md'
   */
  size?: SpinnerSize;
  /**
   * Color shade.
   * - 'default': accent color on light backgrounds
   * - 'onMedia': white on dark/accent backgrounds
   * - 'subtle': secondary text color, less prominent — for inline use in lists
   * - 'inherit': inherits the parent's `currentColor` (with a translucent
   *   track) — use inside colored elements like buttons so the ring matches
   *   the resolved foreground regardless of theme/variant
   * @default 'default'
   */
  shade?: SpinnerShade;
  /**
   * Visible content displayed below the spinner.
   * Accepts a string or ReactNode for rich content.
   *
   * When `label` is a string, the visible text also provides the accessible
   * name of the status element (via aria-labelledby, avoiding a duplicate
   * announcement) unless `aria-label` is explicitly set.
   *
   * @example
   * ```
   * <Spinner label="Loading..." />
   * <Spinner label={<><strong>Fetching data</strong><br/>This may take a moment</>} aria-label="Fetching data" />
   * ```
   */
  label?: ReactNode;
  /**
   * Test ID for the root element.
   */
  'data-testid'?: string;
}

// =============================================================================
// Component
// =============================================================================

/**
 * An animated loading indicator. Available in four sizes and four color shades.
 *
 * @example
 * ```
 * <Spinner />
 * <Spinner size="sm" />
 * <Spinner size="lg" shade="onMedia" />
 * <Spinner label="Loading..." />
 * <Spinner aria-label="Loading data" />
 * ```
 */
export function Spinner({
  size = 'md',
  shade = 'default',
  label,
  xstyle,
  className,
  style,
  'aria-label': ariaLabel,
  'data-testid': testId,
  ref,
  ...restProps
}: SpinnerProps) {
  const {border, diameter} = SIZES[size];
  const frameSize = diameter + border * 2;
  const circumference = Math.PI * diameter;
  const arcLength = circumference * ARC_FRACTION;
  const hasLabel = label != null;
  const labelId = useId();
  const t = useTranslator();

  // When a visible string label renders (and no explicit aria-label is set),
  // name the status element from the visible Text via aria-labelledby instead
  // of duplicating the same string as aria-label — the duplicate would be
  // announced twice by screen readers (WCAG 4.1.2).
  const namedByVisibleLabel =
    hasLabel && typeof label === 'string' && ariaLabel == null;

  // Resolve accessible name: explicit aria-label > string label > the
  // localized default. The fallback is AT-facing text, so it goes through the
  // translation runtime like visible text does.
  const resolvedAriaLabel =
    ariaLabel ??
    (typeof label === 'string' ? label : undefined) ??
    t('@astryx.spinner.loading');

  const spinner = (
    <span
      ref={hasLabel ? undefined : ref}
      role="status"
      aria-label={namedByVisibleLabel ? undefined : resolvedAriaLabel}
      aria-labelledby={namedByVisibleLabel ? labelId : undefined}
      data-testid={hasLabel ? undefined : testId}
      {...(hasLabel ? {} : restProps)}
      {...mergeProps(
        hasLabel ? '' : themeProps('spinner', {size, shade}),
        stylex.props(
          styles.spinner,
          // The defaults are declared on whichever element carries the theme
          // target, and only there: when a label moves the target to the
          // wrapper, this span must inherit the wrapper's value rather than
          // declare its own, which would shadow a theme's override with the
          // default it is trying to replace.
          !hasLabel && sizeStyles[size],
          !hasLabel && shadeStyles[shade],
          !hasLabel && xstyle,
        ),
        hasLabel ? undefined : className,
        // The box is sized here, after the caller's `style`, exactly as it was
        // before the geometry became themeable: the component's own size wins
        // over a `style={{width}}` a caller passes, and the precedence between
        // the two is unchanged by this PR. What the value is made of has
        // changed — it is the composed var rather than a number — so a themed
        // diameter moves the box with the ring. The fallback is the size's own
        // frame, for the render where no stylesheet has declared the var.
        {
          ...(hasLabel ? {} : style),
          width: `var(${BOX_SIZE}, ${frameSize}px)`,
          height: `var(${BOX_SIZE}, ${frameSize}px)`,
        },
      )}>
      <svg
        ref={syncRotationPhase}
        width={frameSize}
        height={frameSize}
        aria-hidden="true"
        {...stylex.props(styles.ring)}>
        <circle
          cx="50%"
          cy="50%"
          r={diameter / 2}
          strokeWidth={border}
          {...stylex.props(
            styles.circle,
            styles.track,
            trackOpacityStyles[shade],
          )}
        />
        <circle
          cx="50%"
          cy="50%"
          r={diameter / 2}
          strokeWidth={border}
          // The size's own dash, for the render with no stylesheet. The rule
          // above composes the same lengths from the resolved diameter, so a
          // themed ring keeps this fraction of arc rather than this length.
          strokeDasharray={`${arcLength} ${circumference - arcLength}`}
          {...stylex.props(styles.circle, styles.arc)}
        />
      </svg>
    </span>
  );

  if (!hasLabel) {
    return spinner;
  }

  return (
    <div
      ref={ref as React.Ref<HTMLDivElement>}
      data-testid={testId}
      {...restProps}
      {...mergeProps(
        themeProps('spinner', {size, shade}),
        stylex.props(
          styles.wrapper,
          sizeStyles[size],
          shadeStyles[shade],
          xstyle,
        ),
        className,
        style,
      )}>
      {spinner}
      {typeof label === 'string' ? (
        <Text id={labelId} type="body" weight="bold">
          {label}
        </Text>
      ) : (
        label
      )}
    </div>
  );
}

Spinner.displayName = 'Spinner';
