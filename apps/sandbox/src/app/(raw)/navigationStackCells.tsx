// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file navigationStackCells.tsx
 * @input Lab's NavigationStack and its opt-in options
 * @output What the NavigationStack phone pages share: a busy loop, the x a
 *   screen's card shows, a watch for a change's first moved frame, a readout
 *   fixed at the page's bottom, a heavy screen and a windowed list in a
 *   screen's own scroller
 * @position Sandbox; imported by the raw navstack-* pages, which a physical
 *   phone loads from a pull request's preview
 */

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {useNavigationScroller} from '@astryxdesign/lab';
import {List, ListItem} from '@astryxdesign/core/List';

/** Holds the main thread for `ms`, as a heavy commit or task does. */
export function busyFor(ms: number): void {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    // Spins: nothing else runs on the main thread meanwhile.
  }
}

/** A number from the query, or `fallback` when it is missing or not one. */
export function queryNumber(
  params: URLSearchParams,
  name: string,
  fallback: number,
): number {
  const value = Number(params.get(name));
  return params.has(name) && Number.isFinite(value) ? value : fallback;
}

/**
 * The card of the screen whose entry has `key` (its `getKey`), or the root's
 * card for null. The stack names an entry's card `screen-<key>`.
 */
export function cardOf(key: string | null): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[data-navigation-screen="${CSS.escape(key == null ? 'root' : `screen-${key}`)}"]`,
  );
}

/** The x the card of `key` shows now, in px, or null with no card. */
export function shownX(key: string): number | null {
  const card = cardOf(key);
  if (card == null) {
    return null;
  }
  const translate = getComputedStyle(card).translate;
  return translate === 'none' ? 0 : Number.parseFloat(translate);
}

/** A change's first moved frame on the page clock. */
export interface FirstMove {
  /** Milliseconds from `since` to the frame's callback time. */
  ms: number;
  /** How far the card had travelled at that frame: 0 at rest, 1 at its end. */
  travel: number;
}

/**
 * Calls `onMove` at the first animation frame after `since` in which the
 * card of `key` shows away from `fromX`, with its travel toward `toX`.
 * The page clock counts frame callbacks, which stop while the main thread is
 * held, so a film of the screen stays the measure.
 */
export function watchFirstMove(
  key: string,
  since: number,
  fromX: (width: number) => number,
  toX: (width: number) => number,
  onMove: (move: FirstMove) => void,
): () => void {
  let frame = 0;
  let stopped = false;
  const deadline = since + 3000;
  const tick = (time: number) => {
    if (stopped) {
      return;
    }
    const card = cardOf(key);
    const x = shownX(key);
    if (card != null && x != null) {
      const width = card.parentElement?.clientWidth ?? card.clientWidth;
      const from = fromX(width);
      const to = toX(width);
      if (Math.abs(x - from) > 0.5) {
        onMove({
          ms: Math.round((time - since) * 10) / 10,
          travel: Math.round(((x - from) / (to - from)) * 1000) / 1000,
        });
        return;
      }
    }
    if (time < deadline) {
      frame = requestAnimationFrame(tick);
    }
  };
  frame = requestAnimationFrame(tick);
  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
  };
}

const styles = stylex.create({
  readout: {
    position: 'fixed',
    insetInline: 0,
    bottom: 0,
    zIndex: 10,
    maxHeight: '30dvh',
    overflowY: 'auto',
    paddingBlock: 6,
    paddingInline: 10,
    paddingBottom: 'max(6px, env(safe-area-inset-bottom))',
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    color: '#fff',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 12,
    lineHeight: 1.35,
  },
  line: {
    margin: 0,
    whiteSpace: 'pre-wrap',
  },
  links: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 4,
  },
  link: {
    color: '#9cf',
  },
  stage: {
    position: 'fixed',
    insetInline: 0,
    top: 0,
    bottom: 'var(--navstack-readout-height, 120px)',
  },
  scroller: {
    height: '100%',
    overflowY: 'auto',
    overscrollBehavior: 'contain',
  },
  spacer: (height: number) => ({
    height,
  }),
  inset: (height: number) => ({
    paddingTop: height,
  }),
});

/** The stage the stack fills: the page above the readout. */
export function Stage({children}: {children: ReactNode}) {
  return <div {...stylex.props(styles.stage)}>{children}</div>;
}

/**
 * A readout fixed at the page's bottom: links to the page's other arms, then
 * one line per measurement, newest first. It sets the stage's bottom edge.
 */
export function Readout({
  links,
  lines,
  children,
}: {
  links: ReadonlyArray<{label: string; href: string}>;
  lines: ReadonlyArray<string>;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element == null) {
      return undefined;
    }
    const measure = () =>
      document.documentElement.style.setProperty(
        '--navstack-readout-height',
        `${element.offsetHeight}px`,
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} data-readout {...stylex.props(styles.readout)}>
      <div {...stylex.props(styles.links)}>
        {links.map(link => (
          <a key={link.href} href={link.href} {...stylex.props(styles.link)}>
            {link.label}
          </a>
        ))}
      </div>
      {children}
      {lines.map((line, index) => (
        <p key={lines.length - index} {...stylex.props(styles.line)}>
          {line}
        </p>
      ))}
    </div>
  );
}

/** Appends a line to a readout, newest first, keeping the last 12. */
export function useReadoutLines(): [
  ReadonlyArray<string>,
  (line: string) => void,
] {
  const [lines, setLines] = useState<ReadonlyArray<string>>([]);
  const add = useCallback(
    (line: string) => setLines(current => [line, ...current].slice(0, 12)),
    [],
  );
  return [lines, add];
}

/**
 * A screen whose mount is heavy: `rows` list rows, and `layoutMs` of work in a
 * layout effect when it mounts, as a large screen's measuring code does.
 */
export function HeavyScreen({
  name,
  rows,
  layoutMs,
}: {
  name: string;
  rows: number;
  layoutMs: number;
}) {
  useLayoutEffect(() => {
    busyFor(layoutMs);
  }, [layoutMs]);
  return (
    <List>
      {Array.from({length: rows}, (_, index) => (
        <ListItem
          key={index}
          label={`${name}, message ${index + 1}`}
          description="A long screen, so its mount takes time."
        />
      ))}
    </List>
  );
}

/**
 * A long list in the screen's own scroller (`scroll="content"`) that renders
 * only the rows near the viewport, as a windowed list does.
 */
export function WindowedList({
  count,
  renderRow,
  overscan = 8,
}: {
  count: number;
  renderRow: (index: number) => ReactNode;
  overscan?: number;
}) {
  const scroller = useNavigationScroller();
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [rowHeight, setRowHeight] = useState(56);
  const [range, setRange] = useState({first: 0, last: 30});
  const update = useCallback(() => {
    const box = boxRef.current;
    if (box == null) {
      return;
    }
    const first = Math.max(0, Math.floor(box.scrollTop / rowHeight) - overscan);
    const last = Math.min(
      count,
      Math.ceil((box.scrollTop + box.clientHeight) / rowHeight) + overscan,
    );
    setRange(current =>
      current.first === first && current.last === last
        ? current
        : {first, last},
    );
  }, [count, overscan, rowHeight]);
  const attach = useCallback(
    (element: HTMLDivElement | null) => {
      boxRef.current = element;
      scroller.ref(element);
    },
    [scroller],
  );
  useLayoutEffect(() => {
    const row = boxRef.current?.querySelector<HTMLElement>('[data-row]');
    if (row != null && row.offsetHeight > 0) {
      setRowHeight(row.offsetHeight);
    }
    update();
  }, [update]);
  const rows: ReactNode[] = [];
  for (let index = range.first; index < range.last; index += 1) {
    rows.push(
      <div key={index} data-row>
        {renderRow(index)}
      </div>,
    );
  }
  return (
    <div
      ref={attach}
      onScroll={update}
      {...stylex.props(styles.scroller, styles.inset(scroller.barInset))}>
      <div {...scroller.sentinelProps} />
      <div {...stylex.props(styles.spacer(range.first * rowHeight))} />
      <List>{rows}</List>
      <div {...stylex.props(styles.spacer((count - range.last) * rowHeight))} />
    </div>
  );
}
