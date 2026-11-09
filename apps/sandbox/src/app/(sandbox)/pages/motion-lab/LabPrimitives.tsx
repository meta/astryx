// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file LabPrimitives.tsx
 * @input Motion Lab store, Astryx Core components
 * @output The frames every demo page is built out of
 * @position Motion Lab shared UI
 *
 * Everything here is Core: Card for the demo frame, Slider for every tunable
 * value, Table for every list, SegmentedControl for every mode switch. The
 * only hand-written pieces are the ones Core has no component for — a
 * cubic-bezier editor and a travelling box — and those are the lab's actual
 * subject matter rather than chrome around it.
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Card} from '@astryxdesign/core/Card';
import {Divider} from '@astryxdesign/core/Divider';
import {Badge} from '@astryxdesign/core/Badge';
import {Slider} from '@astryxdesign/core/Slider';
import {Grid} from '@astryxdesign/core/Grid';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';
import {useMotionLab, parseMs} from './MotionLabStore';
import {
  bezierAt,
  formatBezier,
  isNamedCurve,
  parseBezier,
  plotPath,
  type BezierPoints,
} from './spring';
import styles from './MotionLab.module.css';

const sx = stylex.create({
  fill: {width: '100%'},
  grow: {flexGrow: 1, minWidth: 0},
  paneLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '10px',
  },
  dot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  dotBefore: {backgroundColor: 'var(--color-background-error, #d3543f)'},
  dotAfter: {backgroundColor: 'var(--color-background-success, #3f9a6b)'},
  dotNeutral: {backgroundColor: 'var(--color-text-tertiary, #8a8a8a)'},
  pane: {
    minWidth: 0,
    padding: '14px',
  },
  splitBorder: {
    borderInlineStartWidth: '1px',
    borderInlineStartStyle: 'solid',
    borderInlineStartColor: 'var(--color-border)',
  },
  meterTrack: {
    height: '5px',
    borderRadius: '3px',
    backgroundColor: 'var(--color-background-base)',
    overflow: 'hidden',
    width: '100%',
  },
  meterFill: {height: '100%', borderRadius: '3px'},
  sliderRow: {width: '100%', maxWidth: '540px'},
  demoBody: {padding: '14px'},
  headerRow: {padding: '12px 14px'},
  code: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '12px',
  },
});

// --- demo frame -------------------------------------------------------------

/**
 * One decision per card. `question` is the thing the reader is meant to be
 * able to answer after looking at it — a demo that cannot name one is
 * decoration and should not be here.
 */
export function DemoCard({
  title,
  question,
  badges,
  actions,
  children,
  controls,
}: {
  title: string;
  question?: string;
  badges?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  controls?: ReactNode;
}) {
  return (
    <Card padding={0} {...stylex.props(sx.fill)}>
      <VStack gap={0}>
        <HStack
          gap={2}
          vAlign="center"
          justify="between"
          {...stylex.props(sx.headerRow)}>
          <VStack gap={0.5} {...stylex.props(sx.grow)}>
            <HStack gap={1} vAlign="center">
              <Heading level={3}>{title}</Heading>
              {badges}
            </HStack>
            {question != null && (
              <Text type="supporting" color="secondary">
                {question}
              </Text>
            )}
          </VStack>
          {actions != null && <HStack gap={1}>{actions}</HStack>}
        </HStack>
        <Divider isFullBleed />
        {children}
        {controls != null && (
          <>
            <Divider isFullBleed />
            <VStack gap={2} {...stylex.props(sx.demoBody)}>
              {controls}
            </VStack>
          </>
        )}
      </VStack>
    </Card>
  );
}

/** The plain body slot, when a card holds content rather than a comparison. */
export function DemoBody({children}: {children: ReactNode}) {
  return (
    <VStack gap={2} {...stylex.props(sx.demoBody)}>
      {children}
    </VStack>
  );
}

// --- before / after ---------------------------------------------------------

export type Pane = {
  readonly tone: 'before' | 'after' | 'neutral';
  readonly label: string;
  readonly content: ReactNode;
};

/**
 * Panes sit side by side and the rail's compare switch hides one side, so a
 * reader can look at just the proposal without the failing version pulling
 * the eye. Three panes is a bake-off rather than a comparison; the same
 * component carries both because the only difference is how many there are.
 */
export function ComparePanes({panes}: {panes: ReadonlyArray<Pane>}) {
  const {compare} = useMotionLab();
  const visible = panes.filter(pane => {
    if (compare === 'both') {
      return true;
    }
    if (compare === 'before') {
      return pane.tone !== 'after';
    }
    return pane.tone !== 'before';
  });
  const shown = visible.length > 0 ? visible : panes;

  return (
    <Grid columns={shown.length} gap={0}>
      {shown.map((pane, i) => (
        <VStack
          key={pane.label}
          gap={0}
          {...stylex.props(sx.pane, i > 0 && sx.splitBorder)}>
          <span {...stylex.props(sx.paneLabel)}>
            <span
              {...stylex.props(
                sx.dot,
                pane.tone === 'before'
                  ? sx.dotBefore
                  : pane.tone === 'after'
                    ? sx.dotAfter
                    : sx.dotNeutral,
              )}
            />
            <Text type="supporting" color="secondary" weight="semibold">
              {pane.label}
            </Text>
          </span>
          {pane.content}
        </VStack>
      ))}
    </Grid>
  );
}

// --- controls ---------------------------------------------------------------

/**
 * A Core Slider bound to a custom property. Nothing else in the lab writes a
 * duration, so tuning is always the same gesture and always lands in the one
 * place the export reads from.
 */
export function TokenSlider({
  token,
  label,
  min = 0,
  max = 900,
  step = 5,
  onAfterChange,
}: {
  token: string;
  label?: string;
  min?: number;
  max?: number;
  step?: number;
  onAfterChange?: () => void;
}) {
  const {rawToken, setToken} = useMotionLab();
  const value = parseMs(rawToken(token));
  return (
    <div {...stylex.props(sx.sliderRow)}>
      <Slider
        label={label ?? token.replace(/^--(duration|stagger)-/, '')}
        value={value}
        min={min}
        max={max}
        step={step}
        valueDisplay="text"
        formatValue={v => `${v}ms`}
        onChange={(v: number) => {
          setToken(token, `${v}ms`);
          onAfterChange?.();
        }}
      />
    </div>
  );
}

/** A plain numeric slider for values that are not tokens (spring bounce etc). */
export function LabSlider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div {...stylex.props(sx.sliderRow)}>
      <Slider
        label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        valueDisplay="text"
        formatValue={format}
        onChange={onChange}
      />
    </div>
  );
}

/** How far a duration sits inside the published interface budget. */
export function BudgetMeter({token}: {token: string}) {
  const {rawToken} = useMotionLab();
  const ms = parseMs(rawToken(token));
  const ceiling = 600;
  const pct = Math.min(100, (ms / ceiling) * 100);
  const tone =
    ms > 500
      ? 'var(--color-background-error, #d3543f)'
      : ms > 300
        ? 'var(--color-background-warning, #c98a1f)'
        : 'var(--color-brand)';
  const note =
    ms > 500
      ? 'Outside every interface budget'
      : ms > 300
        ? 'Overlays only above 300ms'
        : 'Inside the interface budget';
  return (
    <VStack gap={1} {...stylex.props(sx.fill)}>
      <span {...stylex.props(sx.meterTrack)}>
        <span
          {...stylex.props(sx.meterFill)}
          style={{width: `${pct}%`, backgroundColor: tone}}
        />
      </span>
      <Text type="supporting" color="secondary">
        {note}
      </Text>
    </VStack>
  );
}

// --- runner -----------------------------------------------------------------

/**
 * One box crossing a fixed distance. The least interesting demo in the lab and
 * the most useful, because there is nothing else in the frame to attribute the
 * feel to — a curve read off a moving box is read honestly.
 */
export function Runner({
  durationToken,
  easeToken,
  auto = true,
}: {
  durationToken: string;
  easeToken: string;
  auto?: boolean;
}) {
  const {scaledMs, rawToken, isLooping, replayNonce} = useMotionLab();
  const dotRef = useRef<HTMLSpanElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  const run = useCallback(() => {
    const dot = dotRef.current;
    const track = trackRef.current;
    if (dot == null || track == null) {
      return;
    }
    for (const animation of dot.getAnimations()) {
      animation.cancel();
    }
    const distance = Math.max(0, track.clientWidth - 36);
    dot.animate(
      [{transform: 'translateX(0)'}, {transform: `translateX(${distance}px)`}],
      {
        duration: Math.max(1, scaledMs(durationToken)),
        easing: rawToken(easeToken) || 'linear',
        fill: 'both',
      },
    );
  }, [durationToken, easeToken, rawToken, scaledMs]);

  useEffect(() => {
    run();
  }, [run, replayNonce]);

  useEffect(() => {
    if (!auto || !isLooping) {
      return;
    }
    const period = Math.max(900, scaledMs(durationToken) + 900);
    const id = window.setInterval(run, period);
    return () => window.clearInterval(id);
  }, [auto, isLooping, run, scaledMs, durationToken]);

  return (
    <div ref={trackRef} className={styles.runner}>
      <span ref={dotRef} className={styles.runnerDot} />
    </div>
  );
}

// --- cubic-bezier editor -----------------------------------------------------

// The plot box is taller than 0..1 so an overshooting curve stays readable
// rather than clipping at the top. Module scope keeps the hook deps honest.
const pad = 22;
const yMin = -0.35;
const yMax = 1.35;

/**
 * Draggable control points over a plotted curve. Core has no equivalent and
 * should not — this is a tool for authoring a token, not a product control.
 * The box is deliberately taller than 0..1 so an overshooting curve is still
 * readable rather than clipped at the top.
 */
export function CurveEditor({
  value,
  onChange,
  size = 176,
  presets,
}: {
  value: string;
  onChange: (next: string) => void;
  size?: number;
  presets?: ReadonlyArray<readonly [string, string]>;
}) {
  const [points, setPoints] = useState<BezierPoints>(() => parseBezier(value));
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragging = useRef<0 | 1 | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (dragging.current == null) {
      setPoints(parseBezier(value));
    }
  }, [value]);

  const X = (x: number) => pad + x * (size - pad * 2);
  const Y = (y: number) =>
    size - pad - ((y - yMin) / (yMax - yMin)) * (size - pad * 2);

  const commit = useCallback(
    (next: BezierPoints) => {
      setPoints(next);
      onChange(formatBezier(next));
    },
    [onChange],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      const handle = dragging.current;
      const svg = svgRef.current;
      if (handle == null || svg == null) {
        return;
      }
      const rect = svg.getBoundingClientRect();
      const x = (event.clientX - rect.left - pad) / (size - pad * 2);
      const y =
        yMax -
        ((event.clientY - rect.top - pad) / (size - pad * 2)) * (yMax - yMin);
      const clampedX = Math.min(1, Math.max(0, x));
      const clampedY = Math.min(yMax, Math.max(yMin, y));
      const next: BezierPoints =
        handle === 0
          ? [clampedX, clampedY, points[2], points[3]]
          : [points[0], points[1], clampedX, clampedY];
      commit(next);
    },
    [commit, points, size],
  );

  const nudge = useCallback(
    (handle: 0 | 1, dx: number, dy: number) => {
      const ix = handle === 0 ? 0 : 2;
      const iy = handle === 0 ? 1 : 3;
      const next = [...points] as [number, number, number, number];
      next[ix] = Math.min(1, Math.max(0, next[ix] + dx));
      next[iy] = Math.min(yMax, Math.max(yMin, next[iy] + dy));
      commit(next as unknown as BezierPoints);
    },
    [commit, points],
  );

  const handleKey = (handle: 0 | 1) => (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? 0.1 : 0.02;
    const map: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const delta = map[event.key];
    if (delta != null) {
      event.preventDefault();
      nudge(handle, delta[0], delta[1]);
    }
  };

  return (
    <VStack gap={2}>
      <svg
        ref={svgRef}
        className={styles.curveCanvas}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-labelledby={titleId}
        onPointerMove={onPointerMove}
        onPointerUp={() => {
          dragging.current = null;
        }}
        onPointerLeave={() => {
          dragging.current = null;
        }}>
        <title id={titleId}>{`Easing curve ${formatBezier(points)}`}</title>
        <rect
          x={X(0)}
          y={Y(1)}
          width={X(1) - X(0)}
          height={Y(0) - Y(1)}
          fill="none"
          stroke="var(--color-border)"
          strokeDasharray="3 3"
        />
        <line
          x1={X(0)}
          y1={Y(0)}
          x2={X(points[0])}
          y2={Y(points[1])}
          stroke="var(--color-text-tertiary, #8a8a8a)"
        />
        <line
          x1={X(1)}
          y1={Y(1)}
          x2={X(points[2])}
          y2={Y(points[3])}
          stroke="var(--color-text-tertiary, #8a8a8a)"
        />
        <path
          d={plotPath(x => bezierAt(points, x), size, size, pad, yMin, yMax)}
          fill="none"
          stroke="var(--color-brand)"
          strokeWidth={2}
        />
        {([0, 1] as const).map(handle => {
          const cx = handle === 0 ? points[0] : points[2];
          const cy = handle === 0 ? points[1] : points[3];
          return (
            <circle
              key={handle}
              className={styles.grabbable}
              cx={X(cx)}
              cy={Y(cy)}
              r={7}
              fill={
                handle === 0
                  ? 'var(--color-brand)'
                  : 'var(--color-background-success, #3f9a6b)'
              }
              tabIndex={0}
              role="slider"
              aria-label={`Control point ${handle + 1}`}
              aria-valuetext={`x ${cx.toFixed(2)}, y ${cy.toFixed(2)}`}
              onKeyDown={handleKey(handle)}
              onPointerDown={event => {
                event.preventDefault();
                dragging.current = handle;
              }}
            />
          );
        })}
      </svg>
      <Text {...stylex.props(sx.code)} color="secondary">
        {formatBezier(points)}
      </Text>
      {presets != null && presets.length > 0 && (
        <HStack gap={1} {...stylex.props(sx.fill)}>
          {presets.map(([label, preset]) => (
            <Badge
              key={label}
              label={
                <button
                  type="button"
                  onClick={() => commit(parseBezier(preset))}
                  style={{all: 'unset', cursor: 'pointer'}}>
                  {label}
                </button>
              }
            />
          ))}
        </HStack>
      )}
    </VStack>
  );
}

export {isNamedCurve};

/** Re-runs a callback whenever the rail's replay is pressed. */
export function useReplay(run: () => void) {
  const {replayNonce} = useMotionLab();
  const ref = useRef(run);
  useLayoutEffect(() => {
    ref.current = run;
  });
  useEffect(() => {
    ref.current();
  }, [replayNonce]);
}

/** Drives a demo on a loop while the rail's loop switch is on. */
export function useLoop(run: () => void, periodMs: number) {
  const {isLooping, replayNonce} = useMotionLab();
  const ref = useRef(run);
  useLayoutEffect(() => {
    ref.current = run;
  });
  useEffect(() => {
    ref.current();
    if (!isLooping) {
      return;
    }
    const id = window.setInterval(() => ref.current(), Math.max(700, periodMs));
    return () => window.clearInterval(id);
  }, [isLooping, periodMs, replayNonce]);
}
