// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input `?start=next-frame|presented|browser` (how a motion from rest takes
 *   its start; next-frame by default), `?work=<ms>` (work the tap's task
 *   runs after the call, 0 by default) and `?hold=<ms>` (how long the curve
 *   holds its first value, 0 by default)
 * @output A card that a row's tap slides in from the trailing edge and Back
 *   slides out, on the push spring, as one Web Animation per change. A ruler
 *   of travel marks sits over it. The readout gives each change's start on
 *   the document timeline and its first moved frame on the page clock
 * @position A raw page for how a tap-started motion from rest takes its
 *   start, filmed on a physical phone: the first frame that shows the change
 *   must show it at its start
 */

import {Suspense, useCallback, useRef} from 'react';
import {useSearchParams} from 'react-router-dom';
import * as stylex from '@stylexjs/stylex';
import {Button} from '@astryxdesign/core/Button';
import {List, ListItem} from '@astryxdesign/core/List';
import {
  busyFor,
  queryNumber,
  Readout,
  Ruler,
  Stage,
  useReadoutLines,
  watchFirstMove,
} from '../../navigationStackCells';

const PAGE = '/sandbox/pages/motion-start-clock/';
const ITEMS = Array.from({length: 16}, (_, index) => `Item ${index + 1}`);

// UIKit's push spring (response 0.3 s, critically damped) and the
// programmatic push's starting velocity (8.773 travels per second), as Core
// measures them. A page can't import Core's internal constants.
const OMEGA = (2 * Math.PI) / 0.3;
const START_VELOCITY = 8.773;
const DURATION_MS = 700;
const STEP_MS = 1000 / 120;
const HOLDS = [17, 33, 50];

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

/** The share of its travel the push spring has covered `t` seconds in. */
function springTravel(t: number): number {
  return 1 - (1 + (OMEGA - START_VELOCITY) * t) * Math.exp(-OMEGA * t);
}

/**
 * The change's keyframes, from `from` to `to` px, sampled at 120 Hz, after
 * `hold` ms at `from`. A hold covers the frames a compositor runs before
 * the screen first shows a new animation.
 */
function springKeyframes(from: number, to: number, hold: number): Keyframe[] {
  const total = hold + DURATION_MS;
  const frames: Keyframe[] =
    hold > 0 ? [{offset: 0, translate: `${from}px 0`}] : [];
  for (let ms = 0; ms < DURATION_MS; ms += STEP_MS) {
    frames.push({
      offset: (hold + ms) / total,
      translate: `${from + (to - from) * springTravel(ms / 1000)}px 0`,
    });
  }
  frames.push({offset: 1, translate: `${to}px 0`});
  return frames;
}

function parseStart(value: string | null): StartMode {
  return START_MODES.find(mode => mode === value) ?? 'next-frame';
}

const round = (ms: number) => Math.round(ms * 10) / 10;

function MotionStartClockCell() {
  const [params] = useSearchParams();
  const start = parseStart(params.get('start'));
  const work = queryNumber(params, 'work', 0);
  const hold = queryNumber(params, 'hold', 0);
  const [lines, addLine] = useReadoutLines();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const shownRef = useRef<'root' | 'card'>('root');
  // The card starts at the trailing edge in px, which the page's watch reads
  // from the computed translate.
  const attachCard = useCallback((card: HTMLDivElement | null) => {
    cardRef.current = card;
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
        const animation = card.animate(springKeyframes(from, to, hold), {
          duration: hold + DURATION_MS,
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
      watchFirstMove(
        card,
        tapped,
        () => from,
        () => to,
        move => {
          addLine(
            `${kind}: started ${startedMs ?? '?'} ms after the tap (document timeline); first moved frame ${move.ms} ms after the tap, at ${Math.round(move.travel * 100)}% of its travel (page clock)`,
          );
        },
      );
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
        <div ref={attachCard} {...stylex.props(styles.card)}>
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
        links={[
          ...START_MODES.flatMap(mode => [
            {label: mode, href: `${PAGE}?start=${mode}`},
            {
              label: `${mode} + 300 ms`,
              href: `${PAGE}?start=${mode}&work=300`,
            },
          ]),
          ...HOLDS.map(ms => ({
            label: `next-frame, hold ${ms} ms`,
            href: `${PAGE}?start=next-frame&hold=${ms}`,
          })),
        ]}
        lines={[
          `start: ${start} · ${work} ms of work in the tap's task · hold ${hold} ms · the first frame must show 0% of the travel`,
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
