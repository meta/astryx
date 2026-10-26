// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input Deterministic multi-file and single-file diff workloads, view mode,
 *   and syntax highlighting on or off
 * @output Interactive DiffViewer benchmark: diff-model time, first file on
 *   screen, total render, long tasks, DOM size, heap, scroll frames, and the
 *   cost of collapse, expand, and view switches; files mount on screen by
 *   default, or all at once

 * @position Fullscreen sandbox tool for evaluating the Lab DiffViewer on large
 *   change sets
 */

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type RefObject,
} from 'react';
import {flushSync} from 'react-dom';
import {AppShell} from '@astryxdesign/core/AppShell';
import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Grid} from '@astryxdesign/core/Grid';
import {ScrollableArea} from '@astryxdesign/core/ScrollableArea';
import {Section} from '@astryxdesign/core/Section';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {HStack, VStack} from '@astryxdesign/core/Stack';
import {Heading, Text} from '@astryxdesign/core/Text';
import {
  createDiffFile,
  DiffViewer,
  type DiffViewerFile,
  type DiffViewerViewMode,
} from '@astryxdesign/lab';
import {
  createMultiFileWorkload,
  createSingleFileWorkload,
  formatCount,
  formatDuration,
  formatMegabytes,
  MULTI_FILE_WORKLOADS,
  SINGLE_FILE_LINES,
  type DiffBenchmarkFile,
  type SingleFileChange,
} from './benchmark';

type Scenario = 'multi' | 'single';
type Syntax = 'on' | 'off';
/**
 * `visible` mounts a file's DiffViewer only while it is near the viewport, so
 * a phone can hold any workload; `all` mounts the whole change set at once.
 */
type Mount = 'visible' | 'all';

/** What a run measured, captured when it started so later control changes don't relabel it. */
interface RunSubject {
  label: string;
  totalLines: number;
  viewMode: DiffViewerViewMode;
  syntax: Syntax;
  mount: Mount;
}

interface RunMetrics {
  subject: RunSubject | null;
  prepareMs: number | null;
  firstFileMs: number | null;
  renderMs: number | null;
  longTasks: number | null;
  longTaskMs: number | null;
  domNodes: number | null;
  heapBytes: number | null;
}

/** The view a reading was taken on, kept with it so later switches don't relabel it. */
interface ViewContext {
  viewMode: DiffViewerViewMode;
  syntax: Syntax;
}

interface ScrollMetrics extends ViewContext {
  fps: number;
  droppedFrames: number;
  longTasks: number | null;
}

interface Interaction extends ViewContext {
  label: string;
  ms: number;
}

function describeView({viewMode, syntax}: ViewContext): string {
  return `${viewMode}, ${syntax === 'on' ? 'highlighted' : 'plain'}`;
}

const EMPTY_RUN: RunMetrics = {
  subject: null,
  prepareMs: null,
  firstFileMs: null,
  renderMs: null,
  longTasks: null,
  longTaskMs: null,
  domNodes: null,
  heapBytes: null,
};

const SCROLL_DURATION_MS = 4000;
/** How far outside the viewport a file mounts, so scrolling meets rendered files. */
const MOUNT_MARGIN_PX = 800;
/** Placeholder estimate for a file never measured: its header and each row. */
const FILE_HEADER_PX = 48;
const DIFF_ROW_PX = 20;
/** Stop looking for the first rendered file after this long. */
const FIRST_FILE_TIMEOUT_MS = 60_000;

/**
 * Chrome's non-standard heap reading; absent in other browsers, and coarse in
 * some (it can stay flat across a run), so callers treat no change as no reading.
 */
function usedHeapBytes(): number | null {
  const memory = (
    performance as Performance & {memory?: {usedJSHeapSize: number}}
  ).memory;
  return memory?.usedJSHeapSize ?? null;
}

/** Calls `done` with the time from `start` until the next frame has painted. */
function afterNextPaint(start: number, done: (ms: number) => void) {
  requestAnimationFrame(() => {
    setTimeout(() => done(performance.now() - start), 0);
  });
}

interface LongTaskReading {
  count: number;
  totalMs: number;
}

/**
 * Collects long tasks until the returned stop function is called. Returns
 * null from stop when the browser has no Long Tasks API, so the page shows no
 * reading rather than a misleading zero.
 */
function watchLongTasks(): () => LongTaskReading | null {
  const isSupported =
    typeof PerformanceObserver !== 'undefined' &&
    PerformanceObserver.supportedEntryTypes?.includes('longtask') === true;
  if (!isSupported) {
    return () => null;
  }
  const entries: PerformanceEntry[] = [];
  const observer = new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      entries.push(entry);
    }
  });
  observer.observe({type: 'longtask', buffered: false});
  return () => {
    for (const entry of observer.takeRecords()) {
      entries.push(entry);
    }
    observer.disconnect();
    return {
      count: entries.length,
      totalMs: entries.reduce((total, entry) => total + entry.duration, 0),
    };
  };
}

function toDiffFile(file: DiffBenchmarkFile): DiffViewerFile {
  return createDiffFile({
    oldValue: file.oldContents ?? '',
    newValue: file.newContents ?? '',
    oldPath: file.oldContents == null ? null : file.path,
    newPath: file.newContents == null ? null : file.path,
  });
}

/** Lines across every hunk: a removed and an added line count separately. */
function diffLineCount(files: ReadonlyArray<DiffViewerFile>): number {
  let lines = 0;
  for (const file of files) {
    for (const hunk of file.hunks) {
      lines += hunk.lines.length;
    }
  }
  return lines;
}

const BenchmarkFile = memo(function BenchmarkFile({
  file,
  viewMode,
  language,
  isCollapsed,
  onToggle,
}: {
  file: DiffViewerFile;
  viewMode: DiffViewerViewMode;
  language: string | undefined;
  isCollapsed: boolean;
  onToggle: (path: string, isCollapsed: boolean) => void;
}) {
  const path = file.newPath ?? file.oldPath ?? '';
  return (
    <DiffViewer
      file={file}
      viewMode={viewMode}
      language={language}
      isCollapsed={isCollapsed}
      onCollapsedChange={next => onToggle(path, next)}
    />
  );
});

/** A file's height before it has rendered: its header, plus each diff row. */
function estimateFileHeight(
  file: DiffViewerFile,
  isCollapsed: boolean,
): number {
  if (isCollapsed) {
    return FILE_HEADER_PX;
  }
  let rows = 0;
  for (const hunk of file.hunks) {
    rows += hunk.lines.length + 1;
  }
  return FILE_HEADER_PX + rows * DIFF_ROW_PX;
}

/**
 * Mounts its file only while it is within MOUNT_MARGIN_PX of the scroll
 * viewport, and keeps the file's last rendered height in its place otherwise,
 * so the list's scroll height and position do not jump.
 */
function OnScreenFile({
  viewportRef,
  ...props
}: ComponentProps<typeof BenchmarkFile> & {
  viewportRef: RefObject<HTMLDivElement | null>;
}) {
  const {file, isCollapsed, viewMode, language} = props;
  const slotRef = useRef<HTMLDivElement>(null);
  // The last rendered height, kept only for the layout it was measured in.
  const layout = `${isCollapsed}:${viewMode}:${language ?? ''}`;
  const [measured, setMeasured] = useState<{
    layout: string;
    height: number;
  } | null>(null);
  const layoutRef = useRef(layout);
  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);
  const [isNear, setIsNear] = useState(false);

  useEffect(() => {
    const slot = slotRef.current;
    if (slot == null) {
      return;
    }
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          setIsNear(entry.isIntersecting);
        }
      },
      {root: viewportRef.current, rootMargin: `${MOUNT_MARGIN_PX}px 0px`},
    );
    observer.observe(slot);
    const sizes = new ResizeObserver(entries => {
      for (const entry of entries) {
        const child = entry.target.firstElementChild;
        if (child != null && !child.hasAttribute('data-placeholder')) {
          const next = {
            layout: layoutRef.current,
            height: entry.contentRect.height,
          };
          setMeasured(previous =>
            previous?.layout === next.layout && previous.height === next.height
              ? previous
              : next,
          );
        }
      }
    });
    sizes.observe(slot);
    return () => {
      observer.disconnect();
      sizes.disconnect();
    };
  }, [viewportRef]);

  return (
    <div ref={slotRef}>
      {isNear ? (
        <BenchmarkFile {...props} />
      ) : (
        <div
          aria-hidden
          data-placeholder=""
          style={{
            height:
              measured?.layout === layout
                ? measured.height
                : estimateFileHeight(file, isCollapsed),
          }}
        />
      )}
    </div>
  );
}

function Metric({label, value}: {label: string; value: string}) {
  return (
    <VStack gap={0.5}>
      <Text type="label">{label}</Text>
      <Text type="code">{value}</Text>
    </VStack>
  );
}

export default function DiffViewerPerfPage() {
  const [scenario, setScenario] = useState<Scenario>('multi');
  const [fileCount, setFileCount] = useState('200');
  const [lineCount, setLineCount] = useState('5000');
  const [change, setChange] = useState<SingleFileChange>('sparse');
  const [viewMode, setViewMode] = useState<DiffViewerViewMode>('unified');
  const [syntax, setSyntax] = useState<Syntax>('on');
  const [mount, setMount] = useState<Mount>('visible');
  const [files, setFiles] = useState<ReadonlyArray<DiffViewerFile>>([]);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [run, setRun] = useState<RunMetrics>(EMPTY_RUN);
  const [scroll, setScroll] = useState<ScrollMetrics | null>(null);
  const [interaction, setInteraction] = useState<Interaction | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const [runKey, setRunKey] = useState(0);
  const surfaceRef = useRef<HTMLDivElement>(null);

  const workload = useMemo(() => {
    if (scenario === 'multi') {
      const entry =
        MULTI_FILE_WORKLOADS.find(w => String(w.files) === fileCount) ??
        MULTI_FILE_WORKLOADS[0];
      return createMultiFileWorkload(entry.files, entry.totalLines);
    }
    return createSingleFileWorkload(Number(lineCount), change);
  }, [scenario, fileCount, lineCount, change]);

  const language = syntax === 'on' ? undefined : 'plaintext';
  const diffLines = useMemo(() => diffLineCount(files), [files]);

  const runBenchmark = useCallback(() => {
    const subject: RunSubject = {
      label: workload.label,
      totalLines: workload.totalLines,
      viewMode,
      syntax,
      mount,
    };
    setIsBusy(true);
    setScroll(null);
    setInteraction(null);
    setRun(EMPTY_RUN);
    setFiles([]);
    setCollapsed(new Set());
    // Let the previous list unmount and paint before timing the new one.
    requestAnimationFrame(() => {
      setTimeout(() => {
        const heapBefore = usedHeapBytes();
        const prepareStart = performance.now();
        const prepared = workload.files.map(toDiffFile);
        const prepareMs = performance.now() - prepareStart;
        const stopLongTasks = watchLongTasks();
        const renderStart = performance.now();
        // Both readings are taken after a paint; the run is published once
        // both are known, so a late first file is recorded, not replaced.
        let firstFileMs: number | null | undefined;
        let rendered: {
          renderMs: number;
          longTasks: LongTaskReading | null;
        } | null = null;
        const publish = () => {
          if (firstFileMs === undefined || rendered == null) {
            return;
          }
          const heapAfter = usedHeapBytes();
          setRun({
            subject,
            prepareMs,
            firstFileMs,
            renderMs: rendered.renderMs,
            longTasks: rendered.longTasks?.count ?? null,
            longTaskMs: rendered.longTasks?.totalMs ?? null,
            domNodes: surfaceRef.current?.querySelectorAll('*').length ?? null,
            heapBytes:
              heapBefore == null ||
              heapAfter == null ||
              heapAfter === heapBefore
                ? null
                : heapAfter - heapBefore,
          });
          setIsBusy(false);
        };
        // Looks for a rendered diff now and then once per frame, so a file
        // that renders late is caught at the frame it appears.
        const watchFirstFile = () => {
          // Unified view renders a <table>; split view, a role="table" grid.
          if (
            surfaceRef.current?.querySelector('table, [role="table"]') != null
          ) {
            afterNextPaint(renderStart, ms => {
              firstFileMs = ms;
              // On screen, the files near the viewport mount together with
              // the first one, so that paint is the full render.
              if (subject.mount === 'visible') {
                rendered = {renderMs: ms, longTasks: stopLongTasks()};
              }
              publish();
            });
            return;
          }
          if (performance.now() - renderStart > FIRST_FILE_TIMEOUT_MS) {
            firstFileMs = null;
            if (subject.mount === 'visible') {
              rendered = {
                renderMs: performance.now() - renderStart,
                longTasks: stopLongTasks(),
              };
            }
            publish();
            return;
          }
          requestAnimationFrame(watchFirstFile);
        };
        // Commit synchronously so the timers below start after this render.
        flushSync(() => {
          setFiles(prepared);
          setRunKey(key => key + 1);
        });
        watchFirstFile();
        if (subject.mount === 'all') {
          afterNextPaint(renderStart, renderMs => {
            rendered = {renderMs, longTasks: stopLongTasks()};
            publish();
          });
        }
      }, 0);
    });
  }, [workload, viewMode, syntax, mount]);

  // `view` is what the timed update leaves on screen, which a switch changes.
  const timeInteraction = (
    label: string,
    view: ViewContext,
    update: () => void,
  ) => {
    const start = performance.now();
    update();
    afterNextPaint(start, ms => setInteraction({label, ms, ...view}));
  };

  const toggleFile = useCallback(
    (path: string, isCollapsed: boolean) => {
      const start = performance.now();
      setCollapsed(current => {
        const next = new Set(current);
        if (isCollapsed) {
          next.add(path);
        } else {
          next.delete(path);
        }
        return next;
      });
      afterNextPaint(start, ms =>
        setInteraction({
          label: isCollapsed ? 'Collapse one file' : 'Expand one file',
          ms,
          viewMode,
          syntax,
        }),
      );
      // A view or syntax switch re-renders every file anyway, so a new callback
      // then costs nothing extra.
    },
    [viewMode, syntax],
  );

  const currentView: ViewContext = {viewMode, syntax};
  const collapseAll = () =>
    timeInteraction('Collapse all', currentView, () =>
      setCollapsed(new Set(files.map(f => f.newPath ?? f.oldPath ?? ''))),
    );
  const expandAll = () =>
    timeInteraction('Expand all', currentView, () => setCollapsed(new Set()));

  const changeViewMode = (next: string) => {
    const nextMode = next as DiffViewerViewMode;
    timeInteraction(`Switch to ${next}`, {viewMode: nextMode, syntax}, () =>
      setViewMode(nextMode),
    );
  };
  const changeSyntax = (next: string) => {
    const nextSyntax = next as Syntax;
    timeInteraction(
      `Syntax ${nextSyntax === 'on' ? 'highlighted' : 'plain'}`,
      {viewMode, syntax: nextSyntax},
      () => setSyntax(nextSyntax),
    );
  };

  const runScrollTest = () => {
    const viewport = surfaceRef.current;
    if (viewport == null) {
      return;
    }
    viewport.scrollTop = 0;
    setIsScrolling(true);
    const view = currentView;
    const stopLongTasks = watchLongTasks();
    const distance = viewport.scrollHeight - viewport.clientHeight;
    const start = performance.now();
    let frames = 0;
    let dropped = 0;
    let previous = start;
    const step = (now: number) => {
      frames += 1;
      if (now - previous > 20) {
        dropped += 1;
      }
      previous = now;
      const progress = Math.min((now - start) / SCROLL_DURATION_MS, 1);
      viewport.scrollTop = distance * progress;
      if (progress < 1) {
        requestAnimationFrame(step);
        return;
      }
      const elapsed = now - start;
      setScroll({
        ...view,
        fps: Math.round((frames / elapsed) * 1000),
        droppedFrames: dropped,
        longTasks: stopLongTasks()?.count ?? null,
      });
      setIsScrolling(false);
    };
    requestAnimationFrame(step);
  };

  const controlsDisabled = isBusy || isScrolling;
  // The list keeps the mount mode its run was measured in, so switching Mount
  // after a run changes the next run, not the readings on screen.
  const listMount = run.subject?.mount ?? mount;
  // Badges describe the measured run once there is one, else the selection.
  const shown: RunSubject = run.subject ?? {
    label: workload.label,
    totalLines: workload.totalLines,
    viewMode,
    syntax,
    mount,
  };

  return (
    <AppShell contentPadding={4} height="fill">
      <VStack gap={4}>
        <VStack gap={1}>
          <Heading level={2}>DiffViewer Performance</Heading>
          <Text type="body" color="secondary">
            Render a whole change set, one DiffViewer per file, and measure the
            diff model, the first file on screen, the full render, long tasks,
            DOM size and heap, then scroll the list and time collapse, expand
            and view switches. Multi-file workloads mix many small files with a
            few very large ones.
          </Text>
        </VStack>

        <Section variant="muted" padding={3} dividers={['bottom']}>
          <HStack gap={4} vAlign="center" wrap="wrap">
            <SegmentedControl
              label="Workload"
              value={scenario}
              onChange={value => setScenario(value as Scenario)}
              isDisabled={controlsDisabled}
              size="sm">
              <SegmentedControlItem value="multi" label="Many files" />
              <SegmentedControlItem value="single" label="One file" />
            </SegmentedControl>
            {scenario === 'multi' ? (
              <SegmentedControl
                label="Files"
                value={fileCount}
                onChange={setFileCount}
                isDisabled={controlsDisabled}
                size="sm">
                {MULTI_FILE_WORKLOADS.map(entry => (
                  <SegmentedControlItem
                    key={entry.files}
                    value={String(entry.files)}
                    label={entry.files.toLocaleString()}
                  />
                ))}
              </SegmentedControl>
            ) : (
              <>
                <SegmentedControl
                  label="Lines"
                  value={lineCount}
                  onChange={setLineCount}
                  isDisabled={controlsDisabled}
                  size="sm">
                  {SINGLE_FILE_LINES.map(lines => (
                    <SegmentedControlItem
                      key={lines}
                      value={String(lines)}
                      label={lines.toLocaleString()}
                    />
                  ))}
                </SegmentedControl>
                <SegmentedControl
                  label="Change"
                  value={change}
                  onChange={value => setChange(value as SingleFileChange)}
                  isDisabled={controlsDisabled}
                  size="sm">
                  <SegmentedControlItem value="sparse" label="Sparse edits" />
                  <SegmentedControlItem value="rewrite" label="Full rewrite" />
                </SegmentedControl>
              </>
            )}
            <SegmentedControl
              label="View"
              value={viewMode}
              onChange={changeViewMode}
              isDisabled={controlsDisabled}
              size="sm">
              <SegmentedControlItem value="unified" label="Unified" />
              <SegmentedControlItem value="split" label="Split" />
            </SegmentedControl>
            <SegmentedControl
              label="Syntax"
              value={syntax}
              onChange={changeSyntax}
              isDisabled={controlsDisabled}
              size="sm">
              <SegmentedControlItem value="on" label="Highlighted" />
              <SegmentedControlItem value="off" label="Plain" />
            </SegmentedControl>
            <SegmentedControl
              label="Mount"
              value={mount}
              onChange={value => setMount(value as Mount)}
              isDisabled={controlsDisabled}
              size="sm">
              <SegmentedControlItem value="visible" label="On screen" />
              <SegmentedControlItem value="all" label="All" />
            </SegmentedControl>
            <Button
              label="Run benchmark"
              onClick={runBenchmark}
              isDisabled={controlsDisabled}
            />
          </HStack>
        </Section>

        <Grid columns={{minWidth: 360, max: 2}} gap={4}>
          <Card padding={3}>
            <VStack gap={3}>
              <Heading level={3}>Run metrics</Heading>
              <HStack gap={2} wrap="wrap">
                <Badge label={shown.label} />
                <Badge
                  label={`${shown.totalLines.toLocaleString()} file lines`}
                />
                <Badge label={`${diffLines.toLocaleString()} diff lines`} />
                <Badge label={shown.viewMode} />
                <Badge
                  label={shown.syntax === 'on' ? 'highlighted' : 'plain'}
                />
                <Badge
                  label={
                    shown.mount === 'visible'
                      ? 'mounted on screen'
                      : 'all mounted'
                  }
                />
              </HStack>
              <Grid columns={2} gap={3}>
                <Metric
                  label="Diff model (createDiffFile)"
                  value={formatDuration(run.prepareMs)}
                />
                <Metric
                  label="First file on screen"
                  value={formatDuration(run.firstFileMs)}
                />
                <Metric
                  label="Full render"
                  value={formatDuration(run.renderMs)}
                />
                <Metric
                  label="Long tasks (count / total)"
                  value={
                    run.longTasks == null
                      ? '—'
                      : `${run.longTasks} / ${formatDuration(run.longTaskMs)}`
                  }
                />
                <Metric label="DOM nodes" value={formatCount(run.domNodes)} />
                <Metric
                  label="Heap growth"
                  value={formatMegabytes(run.heapBytes)}
                />
                <Metric
                  label={
                    scroll == null
                      ? 'Scroll (fps / dropped / long tasks)'
                      : `Scroll (fps / dropped / long tasks), ${describeView(scroll)}`
                  }
                  value={
                    scroll == null
                      ? '—'
                      : `${scroll.fps} / ${scroll.droppedFrames} / ${scroll.longTasks ?? '—'}`
                  }
                />
                <Metric
                  label={
                    interaction == null
                      ? 'Last interaction'
                      : `${interaction.label}, ${describeView(interaction)}`
                  }
                  value={formatDuration(interaction?.ms ?? null)}
                />
              </Grid>
              <HStack gap={2} wrap="wrap">
                <Button
                  label="Scroll test"
                  variant="secondary"
                  onClick={runScrollTest}
                  isDisabled={files.length === 0 || controlsDisabled}
                />
                <Button
                  label="Collapse all"
                  variant="secondary"
                  onClick={collapseAll}
                  isDisabled={files.length === 0 || controlsDisabled}
                />
                <Button
                  label="Expand all"
                  variant="secondary"
                  onClick={expandAll}
                  isDisabled={files.length === 0 || controlsDisabled}
                />
              </HStack>
              <Text type="body" color="secondary">
                Full render runs from the commit to the next painted frame;
                first file on screen runs from the commit to the paint after a
                rendered diff first appears. A long task is a main-thread task
                over 50 ms; a dropped frame is a gap over 20 ms. A reading the
                browser cannot give (long tasks without the Long Tasks API, a
                heap reading that does not move) shows as a dash. Badges name
                the workload the run was measured on; the scroll and interaction
                readings name the view they were taken in. The scroll test moves
                the list from top to bottom over four seconds. With Mount on
                screen, a file renders only near the viewport: DOM size and heap
                cover what is on screen, full render is the paint the first
                files appear in, and scrolling includes mounting files. Mount
                all renders the whole change set at once, which can exhaust a
                phone's memory.
              </Text>
            </VStack>
          </Card>

          <ScrollableArea
            key={runKey}
            ref={surfaceRef}
            label="Rendered change set"
            height={640}>
            <VStack gap={3}>
              {files.map(file => {
                const path = file.newPath ?? file.oldPath ?? '';
                const fileProps = {
                  file,
                  viewMode,
                  language,
                  isCollapsed: collapsed.has(path),
                  onToggle: toggleFile,
                };
                return listMount === 'visible' ? (
                  <OnScreenFile
                    key={path}
                    viewportRef={surfaceRef}
                    {...fileProps}
                  />
                ) : (
                  <BenchmarkFile key={path} {...fileProps} />
                );
              })}
            </VStack>
          </ScrollableArea>
        </Grid>
      </VStack>
    </AppShell>
  );
}
