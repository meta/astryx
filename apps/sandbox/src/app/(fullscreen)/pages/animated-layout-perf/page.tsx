// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input A long list of rows (1k, 5k or 10k; every row rendered, or only
 *   the visible window) with a Collapsible in the middle that takes the
 *   list's `useAnimatedLayout` handle
 * @output Run metrics for expanding and collapsing that middle item: the
 *   commit and layout walk until the glide starts, rectangles read, elements
 *   animated, long tasks, frames and drops, and time to the first frame,
 *   each with its change from a saved baseline
 * @position Fullscreen sandbox tool, beside Markdown Perf and DiffViewer
 *   Perf, for measuring `useAnimatedLayout` at scale
 */

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import {flushSync} from 'react-dom';
import * as stylex from '@stylexjs/stylex';
import {AppShell} from '@astryxdesign/core/AppShell';
import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Collapsible} from '@astryxdesign/core/Collapsible';
import {Grid} from '@astryxdesign/core/Grid';
import {useAnimatedLayout} from '@astryxdesign/core/hooks';
import {ScrollableArea} from '@astryxdesign/core/ScrollableArea';
import {Section} from '@astryxdesign/core/Section';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {HStack, VStack} from '@astryxdesign/core/Stack';
import {Heading, Text} from '@astryxdesign/core/Text';
import type {AnimatedLayout} from '@astryxdesign/core/hooks';

type Rendering = 'full' | 'virtualized';
import {
  formatBenchmarkChange,
  formatCount,
  formatDuration,
  watchLongTasks,
} from '../perfReadings';

interface RunMetrics {
  /** From the change to the glide starting: React's commit and the walk. */
  walkMs: number | null;
  rectsRead: number | null;
  animated: number | null;
  longTasks: number | null;
  longTaskMs: number | null;
  frames: number | null;
  droppedFrames: number | null;
  firstFrameMs: number | null;
}

const EMPTY_METRICS: RunMetrics = {
  walkMs: null,
  rectsRead: null,
  animated: null,
  longTasks: null,
  longTaskMs: null,
  frames: null,
  droppedFrames: null,
  firstFrameMs: null,
};

const ROW_OPTIONS = ['1000', '5000', '10000'];
const ROW_HEIGHT = 36;
const VIEWPORT_HEIGHT = 560;
/** Rows rendered past each edge of the visible window when virtualized. */
const OVERSCAN = 8;
/** Expand and collapse, three times each, for one run. */
const TOGGLES = 6;
/** Long enough for the glide (springs.settle) to finish between toggles. */
const SETTLE_MS = 900;

const styles = stylex.create({
  row: {
    height: ROW_HEIGHT,
    paddingInline: 12,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
    boxSizing: 'border-box',
  },
  middle: {
    paddingInline: 12,
    paddingBlock: 4,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
  },
  spacer: (height: number) => ({height}),
});

/** The change column's text before a baseline, and before a run after one. */
const CHANGE_EMPTY_LABELS = {
  noBaseline: 'no baseline',
  noValue: 'baseline saved',
};

/** The median: with an even count, the mean of the two middle values. */
function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const half = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[half]
    : (sorted[half - 1] + sorted[half]) / 2;
}

/** Saved baselines outlive a reload, so a build change can be compared. */
const BASELINES_KEY = 'astryx-sandbox:animated-layout-perf:baselines';

function loadBaselines(): Record<string, RunMetrics> {
  try {
    const saved = window.localStorage.getItem(BASELINES_KEY);
    return saved == null
      ? {}
      : (JSON.parse(saved) as Record<string, RunMetrics>);
  } catch {
    return {};
  }
}

function storeBaselines(baselines: Record<string, RunMetrics>): void {
  try {
    window.localStorage.setItem(BASELINES_KEY, JSON.stringify(baselines));
  } catch {
    // Storage unavailable (private mode): baselines last this session.
  }
}

const nextFrame = async (): Promise<number> =>
  new Promise(resolve => {
    requestAnimationFrame(resolve);
  });

const wait = async (ms: number): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, ms);
  });

/**
 * The item that changes. Its open state is its own, so a toggle re-renders
 * it alone: the run measures the item's commit and the walk, not a list
 * re-render.
 */
const MiddleItem = memo(function MiddleItem({
  index,
  animatedLayout,
  toggleRef,
}: {
  index: number;
  animatedLayout: AnimatedLayout | undefined;
  toggleRef: RefObject<((open?: boolean) => void) | null>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  useEffect(() => {
    toggleRef.current = open => setIsOpen(current => open ?? !current);
    return () => {
      toggleRef.current = null;
    };
  }, [toggleRef]);
  return (
    <VStack xstyle={styles.middle}>
      <Collapsible
        trigger={`Row ${index + 1}: the middle item`}
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        animatedLayout={animatedLayout}>
        <VStack gap={1}>
          <Text type="supporting">
            Expanding this item moves the rows after it that are in view.
          </Text>
          <Text type="supporting">
            The page counts the rectangles read to find them, and times the work
            until they start to move.
          </Text>
          <Text type="supporting">
            Closing it plays its exit while the rows below glide up.
          </Text>
        </VStack>
      </Collapsible>
    </VStack>
  );
});

export default function AnimatedLayoutPerfPage() {
  const [rowCount, setRowCount] = useState('5000');
  const [rendering, setRendering] = useState<Rendering>('full');
  const [glide, setGlide] = useState<'on' | 'off'>('on');
  const toggleRef = useRef<((open?: boolean) => void) | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [metrics, setMetrics] = useState<RunMetrics>(EMPTY_METRICS);
  const [baselines, setBaselines] = useState<Record<string, RunMetrics>>({});
  // Read after hydration: the prerendered page has none.
  useEffect(() => {
    setBaselines(loadBaselines());
  }, []);
  const [scrollTop, setScrollTop] = useState(0);

  const viewportRef = useRef<HTMLDivElement>(null);
  const animatedLayout = useAnimatedLayout({containerRef: viewportRef});
  const runningRef = useRef(false);

  const count = Number(rowCount);
  const middle = Math.floor(count / 2);
  const key = `${rowCount}:${rendering}:${glide}`;
  const handle = glide === 'on' ? animatedLayout : undefined;
  const baseline = baselines[key];

  // Virtualized: only the rows in (and just around) the viewport render, so
  // the middle item is in the DOM only while it is in that window. Each run
  // scrolls to it before the first toggle.
  const windowRange = useMemo(() => {
    if (rendering === 'full') {
      return {start: 0, end: count};
    }
    const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const visible = Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT) + OVERSCAN * 2;
    return {start: first, end: Math.min(count, first + visible)};
  }, [count, rendering, scrollTop]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport == null || rendering === 'full') {
      return undefined;
    }
    const onScroll = () => setScrollTop(viewport.scrollTop);
    viewport.addEventListener('scroll', onScroll, {passive: true});
    return () => viewport.removeEventListener('scroll', onScroll);
  }, [rendering]);

  useEffect(() => {
    if (!runningRef.current) {
      setMetrics(EMPTY_METRICS);
    }
  }, [key]);

  const run = useCallback(async () => {
    const viewport = viewportRef.current;
    if (viewport == null || runningRef.current) {
      return;
    }
    runningRef.current = true;
    setIsRunning(true);
    setMetrics(EMPTY_METRICS);
    flushSync(() => toggleRef.current?.(false));
    // The middle item, centered in the viewport.
    viewport.scrollTop = Math.max(
      0,
      middle * ROW_HEIGHT - VIEWPORT_HEIGHT / 2 + ROW_HEIGHT,
    );
    setScrollTop(viewport.scrollTop);
    await wait(SETTLE_MS);

    // Instrumentation, for this run only: every rectangle read on the page,
    // long tasks, and animation frames.
    const prototype = Element.prototype;
    const original = prototype.getBoundingClientRect;
    let rects = 0;
    prototype.getBoundingClientRect = function getBoundingClientRect(
      this: Element,
    ) {
      rects += 1;
      return original.call(this);
    };
    const stopLongTasks = watchLongTasks();
    let frames = 0;
    let dropped = 0;
    let previous = performance.now();
    let frameId: number;
    const onFrame = (now: number) => {
      frames += 1;
      if (now - previous > 20) {
        dropped += 1;
      }
      previous = now;
      frameId = requestAnimationFrame(onFrame);
    };
    frameId = requestAnimationFrame(onFrame);

    let longTaskReading: ReturnType<typeof stopLongTasks>;
    const walks: number[] = [];
    const reads: number[] = [];
    const animations: number[] = [];
    const firstFrames: number[] = [];
    try {
      for (let i = 0; i < TOGGLES && runningRef.current; i++) {
        rects = 0;
        const start = performance.now();
        flushSync(() => toggleRef.current?.());
        // The layout walk runs in a microtask after the commit.
        await Promise.resolve();
        await Promise.resolve();
        // The browser's own style and layout for the change, inside the clock
        // in both modes (the walk forces it anyway), so with the handle minus
        // without is the walk alone. Not a counted read.
        void original.call(viewport);
        walks.push(performance.now() - start);
        reads.push(rects);
        animations.push(
          viewport
            .getAnimations({subtree: true})
            .filter(animation =>
              (animation.effect as KeyframeEffect | null)
                ?.getKeyframes()
                .some(frame => 'translate' in frame),
            ).length,
        );
        await nextFrame();
        firstFrames.push(performance.now() - start);
        await wait(SETTLE_MS);
      }
    } finally {
      prototype.getBoundingClientRect = original;
      longTaskReading = stopLongTasks();
      cancelAnimationFrame(frameId);
    }
    // A stopped run publishes nothing: its totals would read as a full run's.
    if (walks.length < TOGGLES) {
      setMetrics(EMPTY_METRICS);
      runningRef.current = false;
      setIsRunning(false);
      return;
    }
    const next: RunMetrics = {
      walkMs: median(walks),
      rectsRead: median(reads),
      animated: median(animations),
      longTasks: longTaskReading?.count ?? null,
      longTaskMs: longTaskReading?.totalMs ?? null,
      frames,
      droppedFrames: dropped,
      firstFrameMs: median(firstFrames),
    };
    setMetrics(next);
    runningRef.current = false;
    setIsRunning(false);
  }, [middle]);

  const stop = useCallback(() => {
    runningRef.current = false;
  }, []);

  const saveBaseline = useCallback(() => {
    setBaselines(current => {
      const next = {...current, [key]: metrics};
      storeBaselines(next);
      return next;
    });
  }, [key, metrics]);

  // The rows, built once per list and window: a toggle re-renders only the
  // middle item.
  const rows = useMemo(() => {
    const out = [];
    for (let i = windowRange.start; i < windowRange.end; i++) {
      out.push(
        i === middle ? (
          <MiddleItem
            key={i}
            index={i}
            animatedLayout={handle}
            toggleRef={toggleRef}
          />
        ) : (
          <HStack key={i} vAlign="center" xstyle={styles.row}>
            <Text type="supporting">Row {i + 1}</Text>
          </HStack>
        ),
      );
    }
    return out;
  }, [handle, middle, windowRange]);

  return (
    <AppShell contentPadding={4} height="fill">
      <VStack gap={4}>
        <VStack gap={1}>
          <Heading level={2}>Animated Layout Performance</Heading>
          <Text type="body" color="secondary">
            Expand and collapse an item in the middle of a long list through
            useAnimatedLayout, and measure the layout walk, the rectangles it
            reads, the elements it animates, long tasks and dropped frames.
          </Text>
        </VStack>

        <Section variant="muted" padding={3} dividers={['bottom']}>
          <HStack gap={4} vAlign="center" wrap="wrap">
            <SegmentedControl
              label="Rows"
              value={rowCount}
              onChange={setRowCount}
              isDisabled={isRunning}
              disabledMessage="Stop the active run before changing the list."
              size="sm">
              {ROW_OPTIONS.map(value => (
                <SegmentedControlItem
                  key={value}
                  value={value}
                  label={Number(value).toLocaleString()}
                />
              ))}
            </SegmentedControl>
            <SegmentedControl
              label="Rendering"
              value={rendering}
              onChange={value => setRendering(value as Rendering)}
              isDisabled={isRunning}
              disabledMessage="Stop the active run before changing rendering."
              size="sm">
              <SegmentedControlItem value="full" label="Every row" />
              <SegmentedControlItem value="virtualized" label="Virtualized" />
            </SegmentedControl>
            <SegmentedControl
              label="Glide"
              value={glide}
              onChange={value => setGlide(value as 'on' | 'off')}
              isDisabled={isRunning}
              disabledMessage="Stop the active run before changing the glide."
              size="sm">
              <SegmentedControlItem value="on" label="With handle" />
              <SegmentedControlItem value="off" label="No handle" />
            </SegmentedControl>
            <Button
              label={isRunning ? 'Running…' : 'Run benchmark'}
              onClick={() => {
                void run();
              }}
              isDisabled={isRunning}
            />
            <Button
              label="Stop"
              variant="secondary"
              onClick={stop}
              isDisabled={!isRunning}
            />
            <Button
              label="Save as baseline"
              variant="secondary"
              onClick={saveBaseline}
              isDisabled={isRunning || metrics.walkMs == null}
            />
          </HStack>
        </Section>

        <Grid columns={{minWidth: 360, max: 2}} gap={4}>
          <Card padding={3}>
            <VStack gap={3}>
              <Heading level={3}>Run metrics</Heading>
              <HStack gap={2} wrap="wrap">
                <Badge label={`${count.toLocaleString()} rows`} />
                <Badge
                  label={rendering === 'full' ? 'Every row' : 'Virtualized'}
                />
                <Badge label={glide === 'on' ? 'With handle' : 'No handle'} />
                <Badge label={`${TOGGLES} toggles`} />
              </HStack>
              <Grid columns={2} gap={3}>
                {(
                  [
                    ['Commit + walk', formatDuration, 'walkMs'],
                    ['Rectangles read', formatCount, 'rectsRead'],
                    ['Elements animated', formatCount, 'animated'],
                    ['Time to first frame', formatDuration, 'firstFrameMs'],
                    ['Long tasks', formatCount, 'longTasks'],
                    ['Long task time', formatDuration, 'longTaskMs'],
                    ['Frames', formatCount, 'frames'],
                    ['Dropped frames', formatCount, 'droppedFrames'],
                  ] as const
                ).map(([label, format, field]) => (
                  <VStack key={field} gap={0.5}>
                    <Text type="label">{label}</Text>
                    <Text type="code">
                      {format(metrics[field])} ·{' '}
                      {formatBenchmarkChange(
                        metrics[field],
                        baseline?.[field] ?? null,
                        CHANGE_EMPTY_LABELS,
                      )}
                    </Text>
                  </VStack>
                ))}
              </Grid>
              <Text type="body" color="secondary">
                Commit + walk, rectangles read, elements animated and time to
                first frame are medians over the run&apos;s toggles; the rest
                are totals for the run. Commit + walk runs from the change to
                the glide starting: React&apos;s commit of the item, then the
                walk and its reads. Run No handle for the same list to see what
                the browser&apos;s own layout costs without the walk. A dropped
                frame is a measured animation frame gap over 20 ms. A stopped
                run reports nothing. Save a baseline (it is kept across reloads
                in this browser), change the build or the CPU throttle in
                DevTools, and run again to compare.
              </Text>
            </VStack>
          </Card>

          <Card padding={0}>
            <ScrollableArea
              ref={viewportRef}
              height={VIEWPORT_HEIGHT}
              label="Long list">
              <VStack>
                {rendering === 'virtualized' && (
                  <VStack
                    xstyle={styles.spacer(windowRange.start * ROW_HEIGHT)}
                  />
                )}
                {rows}
                {rendering === 'virtualized' && (
                  <VStack
                    xstyle={styles.spacer(
                      (count - windowRange.end) * ROW_HEIGHT,
                    )}
                  />
                )}
              </VStack>
            </ScrollableArea>
          </Card>
        </Grid>
      </VStack>
    </AppShell>
  );
}
