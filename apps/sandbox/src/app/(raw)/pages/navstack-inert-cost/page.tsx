// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input `?rows=<n>` (the covered list's rows, 2,200 by default),
 *   `?overscan=<n>` (the rows it renders past each edge of the viewport, 60
 *   by default) and `?turns=<n>` (the transcript's turns, 100 by default).
 *   `?mode=settle` times one flip at a slide-out's settle instead, with
 *   `?takes=<n>` (30 by default) and `?shape=inert|pointer-events|none` (all
 *   three in turn by default)
 * @output A full-page NavigationStack with a pushed transcript over a covered
 *   windowed list. "Run" times setting and removing `inert`,
 *   `pointer-events: none` and `aria-hidden` on each screen, and lists the
 *   medians with the browser's user agent. In settle mode, each take slides
 *   the transcript out on a Web Animation and, in the task where it finishes,
 *   flips the covered list once: `inert` off, `pointer-events` back, or
 *   nothing. It lists each flip's time, the longest wait between frames after
 *   it, and the medians per shape
 * @position A raw page for isolating the covered screens during a change,
 *   run on a physical phone. Per round, 20 on/off pairs, with
 *   style and layout forced before and after each toggle; 7 rounds, the first
 *   dropped; the upper median of the other 6. Settle mode slides the card
 *   itself, so the stack makes no flip of its own; a corner square changes
 *   colour in each settle's task, and a bar that each frame moves sits beside
 *   a strip that a Web Animation moves, for a film to count frozen frames
 */

import {Suspense, useEffect, useRef, useState, type RefObject} from 'react';
import {useSearchParams} from 'react-router-dom';
import * as stylex from '@stylexjs/stylex';
import {NavigationScreen, NavigationStack} from '@astryxdesign/lab';
import {Button} from '@astryxdesign/core/Button';
import {ListItem} from '@astryxdesign/core/List';
import {Text} from '@astryxdesign/core/Text';
import {
  cardOf,
  queryNumber,
  Readout,
  Stage,
  WindowedList,
} from '../../navigationStackCells';

const PAGE = '/sandbox/pages/navstack-inert-cost/';
const ROUNDS = 7;
const PAIRS = 20;

type Shape = 'inert' | 'pointerEventsNone' | 'ariaHidden';

const SHAPES: Record<Shape, (target: HTMLElement, on: boolean) => void> = {
  inert: (target, on) => {
    if (on) {
      target.setAttribute('inert', '');
    } else {
      target.removeAttribute('inert');
    }
  },
  pointerEventsNone: (target, on) => {
    target.style.pointerEvents = on ? 'none' : '';
  },
  ariaHidden: (target, on) => {
    if (on) {
      target.setAttribute('aria-hidden', 'true');
    } else {
      target.removeAttribute('aria-hidden');
    }
  },
};

const upperMedian = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

/** Times each shape on `target`; restores the target's own state after. */
function timeToggles(target: HTMLElement) {
  const force = () => {
    target.getBoundingClientRect();
    void document.documentElement.offsetHeight;
  };
  const had = {
    inert: target.hasAttribute('inert'),
    pointerEvents: target.style.pointerEvents,
    ariaHidden: target.getAttribute('aria-hidden'),
  };
  const measure = (apply: (target: HTMLElement, on: boolean) => void) => {
    const on: number[] = [];
    const off: number[] = [];
    for (let round = 0; round < ROUNDS; round += 1) {
      let a = 0;
      let b = 0;
      for (let pair = 0; pair < PAIRS; pair += 1) {
        force();
        let start = performance.now();
        apply(target, true);
        force();
        a += performance.now() - start;
        start = performance.now();
        apply(target, false);
        force();
        b += performance.now() - start;
      }
      if (round > 0) {
        on.push(a / PAIRS);
        off.push(b / PAIRS);
      }
    }
    return {
      onMs: Math.round(upperMedian(on) * 100) / 100,
      offMs: Math.round(upperMedian(off) * 100) / 100,
    };
  };
  const shapes: Record<Shape, {onMs: number; offMs: number}> = {
    inert: measure(SHAPES.inert),
    pointerEventsNone: measure(SHAPES.pointerEventsNone),
    ariaHidden: measure(SHAPES.ariaHidden),
  };
  SHAPES.inert(target, had.inert);
  target.style.pointerEvents = had.pointerEvents;
  if (had.ariaHidden == null) {
    target.removeAttribute('aria-hidden');
  } else {
    target.setAttribute('aria-hidden', had.ariaHidden);
  }
  return {elements: target.querySelectorAll('*').length, shapes};
}

/** The stack every mode measures: a pushed transcript over a covered list. */
function CoveredStack({
  rows,
  overscan,
  turns,
}: {
  rows: number;
  overscan: number;
  turns: number;
}) {
  const [path, setPath] = useState<string[]>(['Transcript']);
  return (
    <Stage>
      <NavigationStack
        label="Inbox"
        root={
          <NavigationScreen title="Inbox" scroll="content">
            <WindowedList
              count={rows}
              overscan={overscan}
              renderRow={index => (
                <ListItem
                  label={`Thread ${index + 1}`}
                  description="A covered row"
                />
              )}
            />
          </NavigationScreen>
        }
        path={path}
        onPathChange={setPath}
        getKey={entry => entry}
        renderScreen={entry => (
          <NavigationScreen title={entry}>
            {Array.from({length: turns}, (_, index) => (
              <Text key={index} type="body">
                <strong>
                  {index % 2 === 0 ? 'Question' : 'Answer'} {index + 1}:
                </strong>{' '}
                a turn of the conversation, long enough to wrap onto a second
                line.
              </Text>
            ))}
          </NavigationScreen>
        )}
      />
    </Stage>
  );
}

function InertCostCell() {
  const [params] = useSearchParams();
  const rows = queryNumber(params, 'rows', 2200);
  const turns = queryNumber(params, 'turns', 100);
  const overscan = queryNumber(params, 'overscan', 60);
  const [lines, setLines] = useState<string[]>([]);
  const run = () => {
    const out: string[] = [];
    for (const [label, key] of [
      [`covered list (${rows} rows)`, null],
      [`transcript (${turns} turns)`, 'Transcript'],
    ] as const) {
      const target = cardOf(key);
      if (target == null) {
        out.push(`${label}: no screen`);
        continue;
      }
      const {elements, shapes} = timeToggles(target);
      out.push(
        `${label}, ${elements} elements: inert ${shapes.inert.onMs} / ${shapes.inert.offMs} · pointer-events ${shapes.pointerEventsNone.onMs} / ${shapes.pointerEventsNone.offMs} · aria-hidden ${shapes.ariaHidden.onMs} / ${shapes.ariaHidden.offMs} ms (on / off)`,
      );
    }
    out.push(navigator.userAgent);
    setLines(out);
  };
  return (
    <>
      <CoveredStack rows={rows} overscan={overscan} turns={turns} />
      <Readout
        links={[
          {label: '2,200 rows, 100 turns', href: PAGE},
          {label: '500 rows', href: `${PAGE}?rows=500`},
        ]}
        lines={[
          `Each figure: ms per toggle, the upper median of ${ROUNDS - 1} rounds of ${PAIRS} pairs`,
          ...lines,
        ]}>
        <Button label="Run" variant="primary" size="sm" onClick={run} />
      </Readout>
    </>
  );
}

/** What settle mode does to the covered list: one flip, or none. */
type Arm = 'inert' | 'pointer-events' | 'none';

const ARMS: ReadonlyArray<Arm> = ['inert', 'pointer-events', 'none'];
const SLIDE_MS = 350;
const SLIDE_EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const WATCH_MS = 300;
const PAUSE_MS = 400;
const STRIP_PX = 166;

interface Take {
  index: number;
  arm: Arm;
  /** The flip at the settle, with style and layout forced around it. */
  flipMs: number;
  /** The longest wait between frame callbacks over the next WATCH_MS. */
  gapMs: number;
  /** The flip back when the transcript covers the list again. */
  coverMs: number;
}

const settleStyles = stylex.create({
  instruments: {
    position: 'fixed',
    top: 16,
    insetInlineEnd: 12,
    zIndex: 12,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    pointerEvents: 'none',
  },
  square: {
    width: 44,
    height: 44,
    backgroundColor: 'black',
  },
  lane: {
    position: 'relative',
    width: STRIP_PX + 14,
    height: 14,
    backgroundColor: 'gainsboro',
    marginBlock: 4,
  },
  block: {
    position: 'absolute',
    top: 0,
    insetInlineStart: 0,
    width: 14,
    height: 14,
  },
  frameBlock: {
    backgroundColor: 'crimson',
  },
  compositorBlock: {
    backgroundColor: 'black',
  },
});

const round2 = (ms: number) => Math.round(ms * 100) / 100;
const wait = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

/** Puts the list's covered state for `arm` on or off. */
function setCovered(card: HTMLElement, arm: Arm, covered: boolean): void {
  if (arm === 'inert') {
    SHAPES.inert(card, covered);
  } else if (arm === 'pointer-events') {
    SHAPES.pointerEventsNone(card, covered);
  }
}

/** The ms `change` takes, with style and layout forced before and after. */
function timed(change: () => void): number {
  const force = () => {
    document.documentElement.getBoundingClientRect();
    void document.documentElement.offsetHeight;
  };
  force();
  const start = performance.now();
  change();
  force();
  return performance.now() - start;
}

/** The longest wait between frame callbacks from `since`, over `ms`. */
async function longestGap(since: number, ms: number): Promise<number> {
  return new Promise(resolve => {
    let last = since;
    let longest = 0;
    const tick = () => {
      const now = performance.now();
      longest = Math.max(longest, now - last);
      last = now;
      if (now - since < ms) {
        requestAnimationFrame(tick);
      } else {
        resolve(longest);
      }
    };
    requestAnimationFrame(tick);
  });
}

/** One take: slide the transcript out, flip the list at its settle, slide it back. */
async function runTake(
  index: number,
  arm: Arm,
  onSettle: () => void,
): Promise<Take | null> {
  const list = cardOf(null);
  const top = cardOf('Transcript');
  if (list == null || top == null) {
    return null;
  }
  // The list's covered state for this arm, well before the take.
  SHAPES.inert(list, false);
  SHAPES.pointerEventsNone(list, false);
  setCovered(list, arm, true);
  await wait(PAUSE_MS);
  const timing: KeyframeAnimationOptions = {
    duration: SLIDE_MS,
    easing: SLIDE_EASING,
    fill: 'forwards',
  };
  const out = top.animate(
    [{transform: 'translateX(0)'}, {transform: 'translateX(100%)'}],
    timing,
  );
  await out.finished;
  // The settle: the task where the slide-out finishes.
  onSettle();
  const since = performance.now();
  const flipMs = timed(() => setCovered(list, arm, false));
  const gapMs = await longestGap(since, WATCH_MS);
  await wait(PAUSE_MS);
  const back = top.animate(
    [{transform: 'translateX(100%)'}, {transform: 'translateX(0)'}],
    timing,
  );
  out.cancel();
  await back.finished;
  const coverMs = timed(() => setCovered(list, arm, true));
  back.cancel();
  return {
    index,
    arm,
    flipMs: round2(flipMs),
    gapMs: round2(gapMs),
    coverMs: round2(coverMs),
  };
}

/** A square that changes colour in each settle's task, and the two strips. */
function Instruments({square}: {square: RefObject<HTMLDivElement | null>}) {
  const frameBlock = useRef<HTMLDivElement | null>(null);
  const compositorBlock = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    // Moved by each frame callback: it stops while the main thread is held.
    let frame = 0;
    let x = 0;
    const tick = () => {
      x = (x + 4) % STRIP_PX;
      if (frameBlock.current != null) {
        frameBlock.current.style.transform = `translateX(${x}px)`;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    // Moved by the compositor at a constant speed, whatever the main thread does.
    const animation = compositorBlock.current?.animate(
      [{transform: 'translateX(0)'}, {transform: `translateX(${STRIP_PX}px)`}],
      {duration: 1000, iterations: Infinity, direction: 'alternate'},
    );
    return () => {
      cancelAnimationFrame(frame);
      animation?.cancel();
    };
  }, []);
  return (
    <div aria-hidden {...stylex.props(settleStyles.instruments)}>
      <div>
        <div {...stylex.props(settleStyles.lane)}>
          <div
            ref={frameBlock}
            {...stylex.props(settleStyles.block, settleStyles.frameBlock)}
          />
        </div>
        <div {...stylex.props(settleStyles.lane)}>
          <div
            ref={compositorBlock}
            {...stylex.props(settleStyles.block, settleStyles.compositorBlock)}
          />
        </div>
      </div>
      <div ref={square} {...stylex.props(settleStyles.square)} />
    </div>
  );
}

function SettleCell() {
  const [params] = useSearchParams();
  const rows = queryNumber(params, 'rows', 2200);
  const turns = queryNumber(params, 'turns', 100);
  const overscan = queryNumber(params, 'overscan', 60);
  const count = Math.max(1, Math.floor(queryNumber(params, 'takes', 30)));
  const shapeParam = params.get('shape');
  const pinned = ARMS.find(arm => arm === shapeParam) ?? null;
  const square = useRef<HTMLDivElement | null>(null);
  const [takes, setTakes] = useState<ReadonlyArray<Take>>([]);
  const [elements, setElements] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const onSettle = () => {
    const element = square.current;
    if (element != null) {
      element.style.backgroundColor =
        element.style.backgroundColor === 'gold' ? 'black' : 'gold';
    }
  };
  const run = async () => {
    const list = cardOf(null);
    const top = cardOf('Transcript');
    if (list == null || top == null) {
      setElements('no screen');
      return;
    }
    setElements(
      `covered list ${list.querySelectorAll('*').length} elements · transcript ${top.querySelectorAll('*').length}`,
    );
    setRunning(true);
    setTakes([]);
    const done: Take[] = [];
    for (let index = 0; index < count; index += 1) {
      const arm = pinned ?? ARMS[index % ARMS.length];
      const take = await runTake(index + 1, arm, onSettle);
      if (take == null) {
        break;
      }
      done.push(take);
      setTakes([...done]);
      await wait(PAUSE_MS);
    }
    // Leaves the list as the stack covers it.
    SHAPES.pointerEventsNone(list, false);
    SHAPES.inert(list, true);
    setRunning(false);
  };
  const later = takes.slice(1);
  const summary = (pinned == null ? ARMS : [pinned]).flatMap(arm => {
    const own = later.filter(take => take.arm === arm);
    if (own.length === 0) {
      return [];
    }
    return [
      `${arm}: flip ${round2(upperMedian(own.map(take => take.flipMs)))} ms · longest frame gap ${round2(upperMedian(own.map(take => take.gapMs)))} ms · cover again ${round2(upperMedian(own.map(take => take.coverMs)))} ms (upper median of ${own.length})`,
    ];
  });
  const line = (take: Take) =>
    `#${take.index} ${take.arm}: flip ${take.flipMs} · gap ${take.gapMs} · cover again ${take.coverMs}`;
  return (
    <>
      <CoveredStack rows={rows} overscan={overscan} turns={turns} />
      <Instruments square={square} />
      <Readout
        links={[
          {label: 'toggles', href: PAGE},
          {label: 'settle', href: `${PAGE}?mode=settle`},
        ]}
        lines={[
          `Settle: ${count} takes, ${pinned ?? 'inert, pointer-events, none in turn'}; each flips the list in the task where a ${SLIDE_MS} ms slide-out finishes. Times in ms; the gap is the longest wait between frames over the next ${WATCH_MS} ms`,
          ...(elements != null ? [elements] : []),
          ...summary,
          ...(takes.length > 0 ? [`first take apart: ${line(takes[0])}`] : []),
          ...takes.slice(-6).reverse().map(line),
          navigator.userAgent,
        ]}>
        <Button
          label={
            running ? `Running ${takes.length}/${count}` : `Run ${count} takes`
          }
          variant="primary"
          size="sm"
          isDisabled={running}
          onClick={() => void run()}
        />
      </Readout>
    </>
  );
}

function ModeCell() {
  const [params] = useSearchParams();
  return params.get('mode') === 'settle' ? <SettleCell /> : <InertCostCell />;
}

export default function NavigationStackInertCostPage() {
  return (
    <Suspense>
      <ModeCell />
    </Suspense>
  );
}
