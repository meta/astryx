// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input `?arm=`: main (the default), workaround, retarget or option2.
 *   `?mode=`: fold (the default), release or nowork.
 * @output A try-it page for filming a motion hand-off on a phone. In fold, a
 *   tap folds the rows above the card three times, 200 ms apart, so the
 *   second and third folds move the card mid-glide. In release, a one-finger
 *   drag moves the card, and the lift hands it to a spring; every arm runs the
 *   same release. In nowork, the card rests and nothing hands off. At a fold,
 *   the main arm takes the plain public path: `set`, then `animate` from rest.
 *   The workaround arm reads `get` and `getVelocity`, then calls `set` and an
 *   `animate` with that velocity. The retarget arm uses public calls only: a
 *   wrapper takes the layout's move with `set`, and the card's own glide is
 *   retargeted with `animate`, which keeps its velocity. The option2 arm calls
 *   `shift`. A corner square flips colour in each hand-off's own task, a ruler
 *   marks every 10 px, the step size prints one frame's travel at the
 *   hand-off, and a strip that a Web Animation moves at a constant speed shows
 *   each frame the compositor draws. After each hand-off, a one-line reading
 *   lists the card's steps on screen over the next 6 frames, from where the
 *   last frame drew it, read in frame callbacks. Both text lines keep a fixed
 *   height, so their text never moves the card.
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

type Arm = 'main' | 'workaround' | 'retarget' | 'option2';
const ARMS: ReadonlyArray<Arm> = ['main', 'workaround', 'retarget', 'option2'];
type Mode = 'fold' | 'release' | 'nowork';

/** How far one fold moves the card, and the folds a tap makes. */
const FOLD_PX = 120;
const FOLDS_PER_TAP = 3;
const FOLD_GAP_MS = 200;
const FRAMES_PER_SECOND = 60;
/** The frames after a hand-off whose steps the second line lists. */
const WATCHED_FRAMES = 6;

const styles = stylex.create({
  page: {
    position: 'relative',
    minHeight: '100dvh',
    boxSizing: 'border-box',
    overflow: 'hidden',
    // Clear of the status bar, the corner square and the strip, and of
    // Safari's toolbar.
    paddingBlockStart: 104,
    paddingBlockEnd: 160,
    paddingInline: 16,
    backgroundColor: 'white',
    color: 'black',
    fontFamily: 'system-ui, sans-serif',
    fontSize: 16,
  },
  // Both lines keep a fixed height: a line that wraps anew would move the
  // rows and the card below it mid-glide, on film.
  readout: {
    fontVariantNumeric: 'tabular-nums',
    marginBlock: 0,
    height: 48,
    lineHeight: '24px',
    overflow: 'hidden',
  },
  steps: {
    fontVariantNumeric: 'tabular-nums',
    marginBlock: 0,
    height: 16,
    fontSize: 12,
    lineHeight: '16px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
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
    marginBlockStart: 8,
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
  const armParam = searchParams.get('arm');
  const arm: Arm = ARMS.find(name => name === armParam) ?? 'main';
  const modeParam = searchParams.get('mode');
  const mode: Mode =
    modeParam === 'release' || modeParam === 'nowork' ? modeParam : 'fold';
  const marker = useRef<HTMLDivElement>(null);
  const stripBlock = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const rows = useRef<HTMLDivElement>(null);
  const readout = useRef<HTMLParagraphElement>(null);
  const steps = useRef<HTMLParagraphElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const animator = useAnimatorOn(card);
  // The retarget arm's wrapper, with its own animator: it takes the layout's
  // move, and the card's own glide goes on inside it.
  const holderAnimator = useAnimatorOn(holder);
  const holderY = useRef(0);
  const cardTarget = useRef(0);
  const foldSerial = useRef(0);
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

  /**
   * Lists the card's steps on screen over the frames after a hand-off, from
   * where the last frame drew it, read in frame callbacks: the page's own
   * reading of whether it holds, slows or jumps. A film decides.
   */
  const watchSteps = (axis: 'top' | 'left', drawn: number, step: number) => {
    const element = card.current;
    if (element == null) {
      return;
    }
    const places = [drawn];
    const tick = () => {
      places.push(element.getBoundingClientRect()[axis]);
      if (places.length <= WATCHED_FRAMES) {
        requestAnimationFrame(tick);
        return;
      }
      const moves = places
        .slice(1)
        .map((place, index) => Math.abs(place - places[index]));
      const moving = step > 1;
      // Holds: a frame that does not move while the card was moving.
      const holds = moving ? moves.filter(move => move < 0.25).length : 0;
      // Slows: a frame in the first three that moves less than half the
      // hand-off's step, as when the glide starts over from rest.
      const slows =
        moving &&
        moves.slice(0, 3).some(move => move >= 0.25 && move < step / 2);
      // Jumps: a catch-up, one step well over the window's other steps.
      const sorted = [...moves].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
      const jumps = median > 1 && moves.some(move => move > 1.6 * median);
      const flags = [
        ...(holds > 0 ? [`holds ${holds} frame${holds === 1 ? '' : 's'}`] : []),
        ...(slows ? ['slows'] : []),
        ...(jumps ? ['jumps'] : []),
      ];
      if (steps.current != null) {
        steps.current.textContent = `${flags.length > 0 ? flags.join(', ') : 'steady'}: ${moves.map(move => move.toFixed(1)).join(' ')} px`;
      }
    };
    requestAnimationFrame(tick);
  };

  /** Flips the corner square and prints the hand-off, in its own task. */
  const mark = (velocity: number, detail: string, drawn: number) => {
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
    watchSteps(mode === 'release' ? 'left' : 'top', drawn, step);
  };

  /** One fold: the rows above the card change height in this task. */
  const fold = (by: number) => {
    const element = card.current;
    const area = rows.current;
    const motion = animator.current;
    if (element == null || area == null || motion == null) {
      return;
    }
    // The layout's move, read on the wrapper: once the wrapper has a
    // translate, it is the card's offsetParent, so the card's own offsetTop
    // stops following the layout.
    const placed = holder.current ?? element;
    const drawnBefore = element.getBoundingClientRect().top;
    const before = placed.offsetTop;
    area.style.height = `${area.offsetHeight + by}px`;
    const moved = placed.offsetTop - before;
    const y = motion.get().y;
    const velocity = motion.getVelocity().y;
    const gliding = y !== cardTarget.current || velocity !== 0;
    const holderMotion = holderAnimator.current;
    if (arm === 'retarget' && holderMotion != null) {
      // Public calls only. The wrapper takes the layout's move at once, with
      // no motion of its own, so the card stays where it is drawn. The card's
      // glide is retargeted by as much and keeps its velocity.
      holderY.current -= moved;
      holderMotion.set({y: holderY.current});
      cardTarget.current += moved;
      const serial = (foldSerial.current += 1);
      void motion.animate({y: cardTarget.current}).then(() => {
        // At rest after the last fold: both offsets go back to 0 together, in
        // one task, so nothing moves on screen.
        if (
          serial === foldSerial.current &&
          motion.getVelocity().y === 0 &&
          motion.get().y === cardTarget.current
        ) {
          holderY.current = 0;
          cardTarget.current = 0;
          holderMotion.set({y: 0});
          motion.set({y: 0});
        }
      });
    } else if (arm === 'option2' && gliding) {
      // The glide goes on: the card stays where it is drawn.
      motion.shift({y: -moved});
    } else if (arm === 'workaround') {
      // Today's tightest public path: put the card back where it is drawn,
      // then a new spring from there with the speed it had, in this task.
      motion.set({y: y - moved});
      void motion.animate(
        {y: 0},
        velocity !== 0 ? {velocity: {y: velocity}} : undefined,
      );
    } else {
      // The plain public path: put the card back where it is drawn, then a
      // new spring from rest.
      motion.set({y: y - moved});
      void motion.animate({y: 0});
    }
    mark(
      velocity,
      `fold ${moved > 0 ? '+' : ''}${moved} px ${gliding ? 'mid-glide' : 'from rest'}`,
      drawnBefore,
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
    const drawn = card.current?.getBoundingClientRect().left ?? 0;
    void animator.current.animate({x: 0}, {velocity: {x: velocity}});
    mark(velocity, `release from ${Math.round(last.x)} px`, drawn);
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
      <p ref={steps} {...stylex.props(styles.steps)} />
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
            <div ref={holder}>
              <div ref={card} {...stylex.props(styles.card)} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
