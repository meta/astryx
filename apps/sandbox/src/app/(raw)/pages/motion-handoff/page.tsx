// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input `?arm=`: main (the default) or option2. `?mode=`: fold (the
 *   default), release or nowork.
 * @output A try-it page for filming a motion hand-off on a phone. In fold, a
 *   tap folds the rows above the card three times, 200 ms apart, so the
 *   second and third folds move the card mid-glide. In release, a one-finger
 *   drag moves the card, and the lift hands it to a spring. In nowork, the
 *   card rests and nothing hands off. The main arm keeps a moved card in place
 *   with `set` and starts a new `animate` from `get` and `getVelocity`. The
 *   option2 arm keeps the glide with `shift`. A corner square flips colour in
 *   each hand-off's own task, a ruler marks every 10 px, the step size prints
 *   one frame's travel at the hand-off, and a strip that a Web Animation moves
 *   at a constant speed shows each frame the compositor draws.
 * @position A raw try-it page for the animator hand-off request. It comes out
 *   before the decision unless the spec owner keeps it.
 */

import {
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import {useSearchParams} from 'react-router-dom';
import * as stylex from '@stylexjs/stylex';
import {createAnimator, type Animator} from '@astryxdesign/core';

type Arm = 'main' | 'option2';
type Mode = 'fold' | 'release' | 'nowork';

/** How far one fold moves the card, and the folds a tap makes. */
const FOLD_PX = 120;
const FOLDS_PER_TAP = 3;
const FOLD_GAP_MS = 200;
const FRAMES_PER_SECOND = 60;

const styles = stylex.create({
  page: {
    position: 'relative',
    minHeight: '100dvh',
    boxSizing: 'border-box',
    overflow: 'hidden',
    // Clear of the status bar, the corner square and the strip, and of
    // Safari's toolbar.
    paddingBlockStart: 112,
    paddingBlockEnd: 160,
    paddingInline: 16,
    backgroundColor: 'white',
    color: 'black',
    fontFamily: 'system-ui, sans-serif',
    fontSize: 16,
  },
  readout: {
    fontVariantNumeric: 'tabular-nums',
    marginBlock: 0,
    minHeight: 48,
  },
  marker: {
    position: 'fixed',
    insetBlockStart: 56,
    insetInlineEnd: 12,
    width: 44,
    height: 44,
    backgroundColor: 'black',
    zIndex: 2,
  },
  strip: {
    position: 'fixed',
    insetBlockStart: 56,
    insetInlineStart: 12,
    width: 180,
    height: 14,
    backgroundColor: 'gainsboro',
    zIndex: 2,
  },
  stripBlock: {
    width: 14,
    height: 14,
    backgroundColor: 'black',
  },
  trigger: {
    display: 'block',
    width: '100%',
    height: 72,
    marginBlockStart: 16,
    borderStyle: 'none',
    borderRadius: 12,
    backgroundColor: 'black',
    color: 'white',
    fontSize: 22,
    fontWeight: 700,
    touchAction: 'manipulation',
  },
  // The rows above the card before the first fold: three folds of 120 px.
  rows: {
    height: 360,
    overflow: 'hidden',
    backgroundImage:
      'repeating-linear-gradient(to bottom, gainsboro 0 28px, white 28px 40px)',
  },
  stage: {
    position: 'relative',
    marginBlockStart: 16,
  },
  dragArea: {
    position: 'relative',
    height: 360,
    marginBlockStart: 16,
    borderRadius: 12,
    backgroundColor: 'lightyellow',
    outlineWidth: 3,
    outlineStyle: 'solid',
    outlineColor: 'black',
    touchAction: 'none',
    overflow: 'hidden',
  },
  card: {
    position: 'relative',
    width: 120,
    height: 80,
    borderRadius: 8,
    backgroundColor: 'black',
    // A white edge line to read the card's place frame by frame.
    backgroundImage:
      'linear-gradient(to right, transparent 58px, white 58px 62px, transparent 62px)',
  },
  dragCard: {
    position: 'absolute',
    insetBlockStart: 140,
    insetInlineStart: 24,
  },
  // Beside the card's whole travel: the rows and the card below them.
  rulerColumn: {
    position: 'absolute',
    insetBlockStart: 0,
    insetInlineEnd: 0,
    width: 44,
    height: 560,
    pointerEvents: 'none',
    backgroundImage:
      'repeating-linear-gradient(to bottom, black 0 1px, transparent 1px 10px), repeating-linear-gradient(to bottom, black 0 2px, transparent 2px 50px)',
    backgroundSize: '12px 100%, 28px 100%',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right top, right top',
  },
  rulerRow: {
    position: 'absolute',
    insetBlockEnd: 0,
    insetInlineStart: 0,
    insetInlineEnd: 0,
    height: 36,
    pointerEvents: 'none',
    backgroundImage:
      'repeating-linear-gradient(to right, black 0 1px, transparent 1px 10px), repeating-linear-gradient(to right, black 0 2px, transparent 2px 50px)',
    backgroundSize: '100% 12px, 100% 28px',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'left bottom, left bottom',
  },
});

function useControlStrip(block: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    // A constant speed on the compositor: 166 px in one second, each way.
    const animation = block.current?.animate(
      [{transform: 'translateX(0)'}, {transform: 'translateX(166px)'}],
      {duration: 1000, iterations: Infinity, direction: 'alternate'},
    );
    return () => animation?.cancel();
  }, [block]);
}

function useAnimatorOn(element: RefObject<HTMLDivElement | null>) {
  const animator = useRef<Animator | null>(null);
  useEffect(() => {
    if (element.current == null) {
      return;
    }
    const created = createAnimator(element.current);
    animator.current = created;
    return () => {
      created.destroy();
      animator.current = null;
    };
  }, [element]);
  return animator;
}

export default function MotionHandoffPage() {
  const [searchParams] = useSearchParams();
  const arm: Arm = searchParams.get('arm') === 'option2' ? 'option2' : 'main';
  const modeParam = searchParams.get('mode');
  const mode: Mode =
    modeParam === 'release' || modeParam === 'nowork' ? modeParam : 'fold';
  const marker = useRef<HTMLDivElement>(null);
  const stripBlock = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const rows = useRef<HTMLDivElement>(null);
  const readout = useRef<HTMLParagraphElement>(null);
  const animator = useAnimatorOn(card);
  const folded = useRef(false);
  const timers = useRef<number[]>([]);
  const drag = useRef<{
    startX: number;
    samples: Array<{t: number; x: number}>;
  } | null>(null);
  // Kept out of React state: a render during a hand-off would add main-thread
  // work to the frames being filmed.
  const handoffs = useRef(0);
  useControlStrip(stripBlock);

  useEffect(
    () => () => {
      for (const timer of timers.current) {
        window.clearTimeout(timer);
      }
    },
    [],
  );

  /** Flips the corner square and prints the hand-off, in its own task. */
  const mark = (velocity: number, detail: string) => {
    handoffs.current += 1;
    const square = marker.current;
    if (square != null) {
      square.style.backgroundColor =
        square.style.backgroundColor === 'gold' ? 'black' : 'gold';
    }
    const step = Math.abs(velocity) / FRAMES_PER_SECOND;
    if (readout.current != null) {
      readout.current.textContent = `${arm} · ${mode} · #${handoffs.current} · step ${step.toFixed(1)} px/frame at 60 fps · ${detail}`;
    }
  };

  /** One fold: the rows above the card change height in this task. */
  const fold = (by: number) => {
    const element = card.current;
    const area = rows.current;
    const motion = animator.current;
    if (element == null || area == null || motion == null) {
      return;
    }
    const before = element.offsetTop;
    area.style.height = `${area.offsetHeight + by}px`;
    const moved = element.offsetTop - before;
    const y = motion.get().y;
    const velocity = motion.getVelocity().y;
    const gliding = y !== 0 || velocity !== 0;
    if (arm === 'option2' && gliding) {
      // The glide goes on: the card stays where it is drawn.
      motion.shift({y: -moved});
    } else {
      // Today's public path: put the card back where it is drawn, then a new
      // spring from there with the speed it had.
      motion.set({y: y - moved});
      void motion.animate(
        {y: 0},
        velocity !== 0 ? {velocity: {y: velocity}} : undefined,
      );
    }
    mark(
      velocity,
      `fold ${moved > 0 ? '+' : ''}${moved} px ${gliding ? 'mid-glide' : 'from rest'}`,
    );
  };

  const onTrigger = () => {
    if (mode !== 'fold') {
      return;
    }
    const by = folded.current ? FOLD_PX : -FOLD_PX;
    folded.current = !folded.current;
    fold(by);
    for (let index = 1; index < FOLDS_PER_TAP; index += 1) {
      timers.current.push(
        window.setTimeout(() => fold(by), index * FOLD_GAP_MS),
      );
    }
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (mode !== 'release' || !event.isPrimary) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    animator.current?.stop();
    const x = animator.current?.get().x ?? 0;
    drag.current = {
      startX: event.clientX - x,
      samples: [{t: event.timeStamp, x}],
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (current == null) {
      return;
    }
    const x = event.clientX - current.startX;
    animator.current?.set({x});
    current.samples = [...current.samples.slice(-1), {t: event.timeStamp, x}];
  };

  const onPointerUp = () => {
    const current = drag.current;
    drag.current = null;
    if (current == null || animator.current == null) {
      return;
    }
    // The last segment of the move sets the release velocity.
    const [first, last] =
      current.samples.length > 1
        ? current.samples
        : [current.samples[0], current.samples[0]];
    const elapsed = last.t - first.t;
    const velocity = elapsed > 0 ? ((last.x - first.x) / elapsed) * 1000 : 0;
    void animator.current.animate({x: 0}, {velocity: {x: velocity}});
    mark(velocity, `release from ${Math.round(last.x)} px`);
  };

  return (
    <div {...stylex.props(styles.page)}>
      <div ref={marker} {...stylex.props(styles.marker)} aria-hidden />
      <div {...stylex.props(styles.strip)} aria-hidden>
        <div ref={stripBlock} {...stylex.props(styles.stripBlock)} />
      </div>
      <p ref={readout} {...stylex.props(styles.readout)} aria-live="polite">
        {`${arm} · ${mode} · no hand-off yet`}
      </p>
      {mode === 'release' ? (
        <div
          {...stylex.props(styles.dragArea)}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}>
          <div ref={card} {...stylex.props(styles.card, styles.dragCard)} />
          <div {...stylex.props(styles.rulerRow)} aria-hidden />
        </div>
      ) : (
        <>
          <button
            type="button"
            {...stylex.props(styles.trigger)}
            onClick={onTrigger}
            disabled={mode === 'nowork'}>
            {mode === 'nowork' ? 'No work: the card rests' : 'Fold'}
          </button>
          <div {...stylex.props(styles.stage)}>
            <div {...stylex.props(styles.rulerColumn)} aria-hidden />
            <div ref={rows} {...stylex.props(styles.rows)} aria-hidden />
            <div ref={card} {...stylex.props(styles.card)} />
          </div>
        </>
      )}
    </div>
  );
}
