// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file scrollBand.test.tsx
 * @input The block and inline window hooks over one fake shared geometry source
 * @output Deterministic React commit counts for scrolling with a scroll band
 * @position Operation-count performance tests for the private list-windowing module
 */
import {describe, it, expect} from 'vitest';
import {act, render} from '@testing-library/react';
import {Profiler, useRef} from 'react';
import {useListWindow, getBlockBandPadding} from './useListWindow';
import {useInlineListWindow, getInlineBandPadding} from './useInlineListWindow';

interface FakeSnapshot {
  viewportHeight: number;
  viewportWidth: number;
  scrollTop: number;
  scrollLeft: number;
  scrollHeight: number;
  startOffset: number;
  isMeasured: boolean;
  revision: number;
  layoutRevision: number;
}

function createSource(initial: Partial<FakeSnapshot> = {}) {
  let snapshot: FakeSnapshot = {
    viewportHeight: 600,
    viewportWidth: 900,
    scrollTop: 0,
    scrollLeft: 0,
    scrollHeight: 0,
    startOffset: 0,
    isMeasured: true,
    revision: 0,
    layoutRevision: 0,
    ...initial,
  };
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const server = {...snapshot, isMeasured: false};
  return {
    subscribe,
    subscribeInline: subscribe,
    getSnapshot: () => snapshot,
    getServerSnapshot: () => server,
    move(next: Partial<FakeSnapshot>) {
      snapshot = {...snapshot, ...next};
      for (const listener of listeners) {
        listener();
      }
    },
  };
}
type Source = ReturnType<typeof createSource>;

const ROW_COUNT = 10000;
const ROW_HEIGHT = 40;
const rowKeys = Array.from({length: ROW_COUNT}, (_, index) => index);
const rowItems = rowKeys.slice();
const COLUMN_WIDTH = 100;
const columnKeys = Array.from({length: 300}, (_, index) => `c${index}`);
const columnOffsets = Array.from(
  {length: columnKeys.length + 1},
  (_, index) => index * COLUMN_WIDTH,
);
const pitch = {rowHeight: ROW_HEIGHT, viewportHeight: 600};

function Rows({source}: {source: Source}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const {segments} = useListWindow({
    items: rowItems,
    keys: rowKeys,
    rowCount: ROW_COUNT,
    pitch,
    isEligible: true,
    canWindow: true,
    geometry: source,
    viewport: viewportRef,
    focusContainer: viewportRef,
  });
  return <div ref={viewportRef}>{segments.length}</div>;
}
function Columns({source}: {source: Source}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const {segments} = useInlineListWindow({
    keys: columnKeys,
    offsets: columnOffsets,
    insetStart: 0,
    insetEnd: 0,
    initialViewportWidth: 900,
    overscan: 2,
    canWindow: true,
    geometry: source,
    viewport: viewportRef,
    focusContainer: viewportRef,
  });
  return <div ref={viewportRef}>{segments.length}</div>;
}
function Both({source}: {source: Source}) {
  return (
    <>
      <Rows source={source} />
      <Columns source={source} />
    </>
  );
}

/** Commits while scrolling 2,000px in 10px steps, after the mount settles. */
function countScrollCommits(
  element: (source: Source) => React.ReactElement,
  step: (offset: number) => Partial<FakeSnapshot>,
): number {
  const source = createSource();
  let commits = 0;
  render(
    <Profiler id="window" onRender={() => commits++}>
      {element(source)}
    </Profiler>,
  );
  commits = 0;
  for (let offset = 10; offset <= 2000; offset += 10) {
    act(() => source.move(step(offset)));
  }
  return commits;
}

/**
 * Commits while scrolling 2,000px at `step` px per event. After each commit,
 * the source publishes a content revision, as the shared measurement does
 * once the window's newly mounted items are in the DOM.
 */
function countCommitsWithMountRevisions(
  element: (source: Source) => React.ReactElement,
  move: (offset: number) => Partial<FakeSnapshot>,
  step: number,
): number {
  const source = createSource();
  let commits = 0;
  render(
    <Profiler id="window" onRender={() => commits++}>
      {element(source)}
    </Profiler>,
  );
  commits = 0;
  let revision = 0;
  for (let offset = step; offset <= 2000; offset += step) {
    const before = commits;
    act(() => source.move(move(offset)));
    if (commits > before) {
      revision++;
      act(() => source.move({revision}));
    }
  }
  return commits;
}

describe('scroll band commit counts', () => {
  it('commits a block scroll only when it moves half a band', () => {
    const band = getBlockBandPadding(600);
    expect(band).toBeGreaterThan(0);
    const commits = countScrollCommits(
      source => <Rows source={source} />,
      offset => ({scrollTop: offset}),
    );
    expect(commits).toBeLessThanOrEqual(Math.ceil(2000 / (band / 2)) + 1);
    expect(commits).toBeGreaterThan(0);
  });

  it('commits an inline scroll only when it moves half a band', () => {
    const band = getInlineBandPadding(900);
    expect(band).toBeGreaterThan(0);
    const commits = countScrollCommits(
      source => <Columns source={source} />,
      offset => ({scrollLeft: offset}),
    );
    expect(commits).toBeLessThanOrEqual(Math.ceil(2000 / (band / 2)) + 1);
    expect(commits).toBeGreaterThan(0);
  });

  it('commits a diagonal scroll at most once per band move on either axis', () => {
    const blockMoves = Math.ceil(2000 / (getBlockBandPadding(600) / 2));
    const inlineMoves = Math.ceil(2000 / (getInlineBandPadding(900) / 2));
    const commits = countScrollCommits(
      source => <Both source={source} />,
      offset => ({scrollTop: offset, scrollLeft: offset}),
    );
    expect(commits).toBeLessThanOrEqual(blockMoves + inlineMoves + 1);
  });

  it('commits nothing in the row plan for an inline-only scroll, or in the column plan for a block-only scroll', () => {
    expect(
      countScrollCommits(
        source => <Rows source={source} />,
        offset => ({scrollLeft: offset}),
      ),
    ).toBe(0);
    expect(
      countScrollCommits(
        source => <Columns source={source} />,
        offset => ({scrollTop: offset}),
      ),
    ).toBe(0);
  });

  it('passes a viewport, offset or layout change through at once, and holds a content revision', () => {
    const source = createSource();
    let commits = 0;
    render(
      <Profiler id="window" onRender={() => commits++}>
        <Rows source={source} />
      </Profiler>,
    );
    commits = 0;
    act(() => source.move({viewportHeight: 500}));
    act(() => source.move({startOffset: 40}));
    act(() => source.move({revision: 1}));
    act(() => source.move({layoutRevision: 1}));
    // The content revision alone commits nothing.
    expect(commits).toBe(3);
  });

  it('commits a fast block scroll once per band move, not again for the revision its mounts publish', () => {
    const band = getBlockBandPadding(600);
    const commits = countCommitsWithMountRevisions(
      source => <Rows source={source} />,
      offset => ({scrollTop: offset}),
      120,
    );
    expect(commits).toBeLessThanOrEqual(Math.ceil(2000 / (band / 2)) + 1);
    expect(commits).toBeGreaterThan(0);
  });

  it('commits a fast diagonal scroll once per band move on either axis', () => {
    const blockMoves = Math.ceil(2000 / (getBlockBandPadding(600) / 2));
    const inlineMoves = Math.ceil(2000 / (getInlineBandPadding(900) / 2));
    const commits = countCommitsWithMountRevisions(
      source => <Both source={source} />,
      offset => ({scrollTop: offset, scrollLeft: offset}),
      120,
    );
    expect(commits).toBeLessThanOrEqual(blockMoves + inlineMoves + 1);
  });
});
