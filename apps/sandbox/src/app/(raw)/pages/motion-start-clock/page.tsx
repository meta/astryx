// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input `?start=next-frame|presented|browser` (how a motion from rest takes
 *   its start; next-frame by default) and `?work=<ms>` (work the tap's task
 *   runs after the call, 0 by default)
 * @output A card that a row's tap slides in from the trailing edge and Back
 *   slides out, on the push spring, as one Web Animation per change. A ruler
 *   of travel marks sits over it. The readout gives each change's start on
 *   the document timeline and its first moved frame on the page clock
 * @position A raw page for how a tap-started motion from rest takes its
 *   start, filmed on a physical phone: the first frame that shows the change
 *   must show it at its start
 */

import {Suspense, useCallback, useLayoutEffect, useRef} from 'react';
import {useSearchParams} from 'react-router-dom';
import * as stylex from '@stylexjs/stylex';
import {Button} from '@astryxdesign/core/Button';
import {List, ListItem} from '@astryxdesign/core/List';
import {
  busyFor,
  queryNumber,
  Readout,
  Stage,
  useReadoutLines,
} from '../../navigationStackCells';

const PAGE = '/sandbox/pages/motion-start-clock/';
const ITEMS = Array.from({length: 16}, (_, index) => `Item ${index + 1}`);
const MARKS = Array.from({length: 11}, (_, index) => index * 10);

// UIKit's push spring (response 0.3 s, critically damped) and the
// programmatic push's starting velocity (8.773 travels per second), as Core
// measures them. A page can't import Core's internal constants.
const OMEGA = (2 * Math.PI) / 0.3;
const START_VELOCITY = 8.773;
const DURATION_MS = 700;
const STEP_MS = 1000 / 120;

/**
 * How a change takes its start. `next-frame`: the animation is made in the
 * tap's task, and script sets its start to the clock read in the first frame
 * after that task, as NavigationStack starts a tap's change today.
 * `presented`: it is made two frames after the tap, once the frame at rest
 * has been presented, and the browser dates it. `browser`: it is made in the
 * tap's task, and the browser dates it.
 */
type StartMode = 'next-frame' | 'presented' | 'browser';

const START_MODES: ReadonlyArray<StartMode> = [
  'next-frame',
  'presented',
  'browser',
];

const styles = stylex.create({
  ruler: {
    position: 'fixed',
    insetInline: 0,
    top: 0,
    height: 14,
    zIndex: 11,
    pointerEvents: 'none',
  },
  mark: (percent: number) => ({
    position: 'absolute',
    top: 0,
    insetInlineStart: `${percent}%`,
    width: 1,
    height: percent % 50 === 0 ? 14 : 8,
    backgroundColor: 'rgba(220, 0, 0, 0.8)',
  }),
  root: {
    position: 'absolute',
    inset: 0,
    overflowY: 'auto',
    paddingTop: 20,
  },
  card: {
    position: 'absolute',
    inset: 0,
    overflowY: 'auto',
    paddingTop: 20,
    backgroundColor: 'Canvas',
    boxShadow: '-2px 0 12px rgba(0, 0, 0, 0.2)',
    translate: '100% 0',
    // Mobile Safari runs an animation whose start script sets on its
    // compositor only for an element that already has a compositing layer.
    willChange: 'translate',
  },
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    paddingInline: 12,
    paddingBlock: 8,
  },
});

/** Marks every tenth of the screen's width, for reading a film. */
function Ruler() {
  return (
    <div aria-hidden {...stylex.props(styles.ruler)}>
      {MARKS.map(percent => (
        <span key={percent} {...stylex.props(styles.mark(percent))} />
      ))}
    </div>
  );
}

/** The share of its travel the push spring has covered `t` seconds in. */
function springTravel(t: number): number {
  return 1 - (1 + (OMEGA - START_VELOCITY) * t) * Math.exp(-OMEGA * t);
}

/** The change's keyframes, from `from` to `to` px, sampled at 120 Hz. */
function springKeyframes(from: number, to: number): Keyframe[] {
  const frames: Keyframe[] = [];
  for (let ms = 0; ms < DURATION_MS; ms += STEP_MS) {
    frames.push({
      offset: ms / DURATION_MS,
      translate: `${from + (to - from) * springTravel(ms / 1000)}px 0`,
    });
  }
  frames.push({offset: 1, translate: `${to}px 0`});
  return frames;
}

/** The x the element shows now, in px. */
function shownX(element: HTMLElement): number {
  const translate = getComputedStyle(element).translate;
  return translate === 'none' ? 0 : Number.parseFloat(translate);
}

/**
 * Calls `onMove` at the first animation frame after `since` in which the
 * element shows away from `from`, with its travel toward `to`.
 */
function watchFirstMove(
  element: HTMLElement,
  since: number,
  from: number,
  to: number,
  onMove: (ms: number, travel: number) => void,
): void {
  const deadline = since + 3000;
  const tick = (time: number) => {
    const x = shownX(element);
    if (Math.abs(x - from) > 0.5) {
      onMove(
        Math.round((time - since) * 10) / 10,
        Math.round(((x - from) / (to - from)) * 1000) / 1000,
      );
      return;
    }
    if (time < deadline) {
      requestAnimationFrame(tick);
    }
  };
  requestAnimationFrame(tick);
}

function parseStart(value: string | null): StartMode {
  return START_MODES.find(mode => mode === value) ?? 'next-frame';
}

const round = (ms: number) => Math.round(ms * 10) / 10;

function MotionStartClockCell() {
  const [params] = useSearchParams();
  const start = parseStart(params.get('start'));
  const work = queryNumber(params, 'work', 0);
  const [lines, addLine] = useReadoutLines();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const shownRef = useRef<'root' | 'card'>('root');

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (card != null) {
      card.style.translate = `${stageRef.current?.clientWidth ?? card.clientWidth}px 0`;
    }
  }, []);

  const change = useCallback(
    (kind: 'push' | 'pop') => {
      const card = cardRef.current;
      if (card == null || (kind === 'push') !== (shownRef.current === 'root')) {
        return;
      }
      shownRef.current = kind === 'push' ? 'card' : 'root';
      const tapped = performance.now();
      const width = stageRef.current?.clientWidth ?? card.clientWidth;
      const from = kind === 'push' ? width : 0;
      const to = kind === 'push' ? 0 : width;
      let startedMs: number | null = null;
      const run = () => {
        const animation = card.animate(springKeyframes(from, to), {
          duration: DURATION_MS,
          fill: 'forwards',
        });
        animation.finished.then(
          () => {
            card.style.translate = `${to}px 0`;
            animation.cancel();
          },
          () => {},
        );
        if (start === 'next-frame') {
          requestAnimationFrame(() => {
            const at = performance.now();
            if (
              animation.startTime == null &&
              animation.playState === 'running'
            ) {
              animation.startTime = at;
            }
            startedMs = round(at - tapped);
          });
        } else {
          animation.ready.then(
            () => {
              const time = animation.startTime;
              startedMs =
                typeof time === 'number' ? round(time - tapped) : null;
            },
            () => {},
          );
        }
      };
      if (start === 'presented') {
        requestAnimationFrame(() => requestAnimationFrame(run));
      } else {
        run();
      }
      if (work > 0) {
        // In the tap's own task, after the call, as a later listener's work.
        busyFor(work);
      }
      watchFirstMove(card, tapped, from, to, (ms, travel) => {
        addLine(
          `${kind}: started ${startedMs ?? '?'} ms after the tap (document timeline); first moved frame ${ms} ms after the tap, at ${Math.round(travel * 100)}% of its travel (page clock)`,
        );
      });
    },
    [start, work, addLine],
  );

  return (
    <>
      <Ruler />
      <Stage>
        <div ref={stageRef} {...stylex.props(styles.root)}>
          <List>
            {ITEMS.map(item => (
              <ListItem
                key={item}
                label={item}
                description={`Slides a card in, start: ${start}, ${work} ms of work in the tap's task`}
                onClick={() => change('push')}
              />
            ))}
          </List>
        </div>
        <div ref={cardRef} {...stylex.props(styles.card)}>
          <div {...stylex.props(styles.bar)}>
            <Button
              label="Back"
              variant="secondary"
              size="sm"
              onClick={() => change('pop')}
            />
          </div>
          <List>
            {ITEMS.map(item => (
              <ListItem key={item} label={`Card, ${item}`} />
            ))}
          </List>
        </div>
      </Stage>
      <Readout
        links={START_MODES.flatMap(mode => [
          {label: mode, href: `${PAGE}?start=${mode}`},
          {
            label: `${mode} + 300 ms`,
            href: `${PAGE}?start=${mode}&work=300`,
          },
        ])}
        lines={[
          `start: ${start} · ${work} ms of work in the tap's task · the first frame must show 0% of the travel`,
          ...lines,
        ]}
      />
    </>
  );
}

export default function MotionStartClockPage() {
  return (
    <Suspense>
      <MotionStartClockCell />
    </Suspense>
  );
}
