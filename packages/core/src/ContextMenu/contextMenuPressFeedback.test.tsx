// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file contextMenuPressFeedback.test.tsx
 * @input useContextMenuPressFeedback on a trigger, with the animator replaced
 * @output Checks that the growth starts at the onset of the landing the
 *   recognizer reports, and ignores the press machine's mark. It returns
 *   when ContextMenu's recognizer ends the press with no menu. The growth plays
 *   `springs.contextMenuLift`, and each return, then or as the menu closes,
 *   `springs.contextMenuDismiss`
 * @position Unit tests of packages/core/src/ContextMenu/contextMenuPressFeedback.ts
 */

import {render} from '@testing-library/react';
import {useRef} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {contextMenu} from '../motion/uikit/contextMenu';
import {springs} from '../motion/uikit/springs';
import {PRESSED_ATTRIBUTE} from '../utils/pressFeedback';
import {PRESS_ONSET_MS} from '../utils/pressGesture';
import {
  useContextMenuPressFeedback,
  type ContextMenuPressFeedback,
} from './contextMenuPressFeedback';

const animator = vi.hoisted(() => ({
  element: null as HTMLElement | null,
  /** The element each spring ran on, in order. */
  animated: [] as HTMLElement[],
  play: vi.fn((..._args: unknown[]) => ({
    finished: new Promise<boolean>(() => {}),
  })),
  animate: vi.fn((..._args: unknown[]) => ({
    finished: new Promise<boolean>(() => {}),
  })),
  stop: vi.fn(),
  dispose: vi.fn(),
  get: vi.fn(() => 1),
  getVelocity: vi.fn(() => 0),
  reducedMotion: vi.fn(() => 'off'),
}));

vi.mock('../motion/animator', () => ({
  createMotionEngine: (element: HTMLElement) => {
    animator.element = element;
    return {
      ...animator,
      animate: (...args: unknown[]) => {
        animator.animated.push(element);
        return animator.animate(...args);
      },
    };
  },
}));

let feedback: ContextMenuPressFeedback | null = null;

function Trigger() {
  const ref = useRef<HTMLDivElement>(null);
  feedback = useContextMenuPressFeedback(ref, ref, true);
  return <div ref={ref} data-testid="trigger" />;
}

/** What the recognizer follows now, as ContextMenu's refs report it. */
const recognizer = {isFollowing: true};
function TriggerWithRecognizer() {
  const ref = useRef<HTMLDivElement>(null);
  const isFollowedRef = useRef(() => recognizer.isFollowing);
  feedback = useContextMenuPressFeedback(ref, ref, true, isFollowedRef);
  return <div ref={ref} data-testid="trigger" />;
}

/** A trigger whose feedback can go while the trigger stays, as when it is disabled. */
function FeedbackLayer({
  triggerRef,
}: {
  triggerRef: React.RefObject<HTMLDivElement | null>;
}) {
  feedback = useContextMenuPressFeedback(triggerRef, triggerRef, true);
  return null;
}

function TriggerWithLayer({hasLayer}: {hasLayer: boolean}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <>
      <div ref={ref} data-testid="trigger" />
      {hasLayer ? <FeedbackLayer triggerRef={ref} /> : null}
    </>
  );
}

/** A trigger whose content is a pressable control, as a Button is. */
function TriggerWithControl() {
  const ref = useRef<HTMLDivElement>(null);
  feedback = useContextMenuPressFeedback(ref, ref, true);
  return (
    <div ref={ref} data-testid="trigger">
      <button type="button" data-testid="control">
        Open
      </button>
    </div>
  );
}

const nested: {
  outer: ContextMenuPressFeedback | null;
  inner: ContextMenuPressFeedback | null;
} = {outer: null, inner: null};

/** A trigger inside another trigger, beside a plain control of the outer one. */
function NestedTriggers({isInnerShown = true}: {isInnerShown?: boolean}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  nested.outer = useContextMenuPressFeedback(outerRef, outerRef, true);
  nested.inner = useContextMenuPressFeedback(innerRef, innerRef, isInnerShown);
  return (
    <div ref={outerRef} data-testid="outer">
      <button type="button" data-testid="outer-control">
        Outer
      </button>
      <div ref={innerRef} data-testid="inner" />
    </div>
  );
}

const growths = () =>
  animator.animate.mock.calls.filter(
    ([to]) => ((to as {scale?: number}).scale ?? 1) > 1,
  );

// The growth starts in the next animation frame.
const flush = async () =>
  new Promise(resolve => {
    requestAnimationFrame(() => {
      setTimeout(resolve, 0);
    });
  });

// Fake animation frames come every 16 ms.
const FRAME_MS = 16;
const FAKE_TIMERS = {
  toFake: [
    'setTimeout',
    'clearTimeout',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'performance',
  ] as const,
};
const startsOf = () => growths().map(call => (call[2] as {at: number}).at);
// One growth, started from rest in the first frame at or after the onset.
/** The recognizer took a contact on `target` whose onset is now. */
const landNow = (target: Element) =>
  feedback?.begin(performance.now() - PRESS_ONSET_MS, target);
const expectGrowthFromOnsetFrame = (onsetAt: number) => {
  const starts = startsOf();
  expect(starts).toHaveLength(1);
  expect(starts[0]).toBeGreaterThanOrEqual(onsetAt);
  expect(starts[0]).toBeLessThan(onsetAt + FRAME_MS);
};

describe('useContextMenuPressFeedback', () => {
  afterEach(() => {
    vi.clearAllMocks();
    animator.animated.length = 0;
    animator.element = null;
    feedback = null;
  });

  it('ignores the press machine’s mark: it grows from the landing, and springs back when the recognizer ends the press', async () => {
    const {getByTestId} = render(<Trigger />);
    const trigger = getByTestId('trigger');
    landNow(trigger);
    await flush();
    expect(animator.animate).toHaveBeenCalledOnce();
    trigger.setAttribute(PRESSED_ATTRIBUTE, 'on');
    trigger.removeAttribute(PRESSED_ATTRIBUTE);
    await flush();
    expect(animator.animate).toHaveBeenCalledOnce();
    feedback?.end(performance.now());
    expect(animator.animate).toHaveBeenCalledTimes(2);
  });

  it('grows for a landing on a control inside the trigger', async () => {
    const {getByTestId} = render(<TriggerWithControl />);
    landNow(getByTestId('control'));
    await flush();
    expect(animator.animate).toHaveBeenCalledOnce();
  });

  it('grows only the outer trigger for a landing on its own control beside a nested trigger', async () => {
    const {getByTestId} = render(<NestedTriggers />);
    const control = getByTestId('outer-control');
    const landedAt = performance.now() - PRESS_ONSET_MS;
    nested.outer?.begin(landedAt, control);
    nested.inner?.begin(landedAt, control);
    await flush();
    expect(animator.animated).toEqual([getByTestId('outer')]);
  });

  it('grows no outer trigger for a landing on a nested trigger that shows no growth', async () => {
    const {getByTestId} = render(<NestedTriggers isInnerShown={false} />);
    const inner = getByTestId('inner');
    const landedAt = performance.now() - PRESS_ONSET_MS;
    nested.outer?.begin(landedAt, inner);
    nested.inner?.begin(landedAt, inner);
    await flush();
    expect(animator.animated).toEqual([]);
  });

  it('gives the trigger back its size when its feedback goes while the menu it opened is up', async () => {
    const {getByTestId, rerender} = render(<TriggerWithLayer hasLayer />);
    const trigger = getByTestId('trigger');
    landNow(trigger);
    await flush();
    expect(animator.animate).toHaveBeenCalledOnce();
    // The menu opened: the animator froze the growth on the element.
    feedback?.hold();
    trigger.style.scale = '1.0735';
    rerender(<TriggerWithLayer hasLayer={false} />);
    expect(trigger.style.scale).toBe('');
    expect(animator.dispose).toHaveBeenCalledOnce();
  });

  it('grows toward the held scale on springs.contextMenuLift, from the onset', async () => {
    const {getByTestId} = render(<Trigger />);
    const trigger = getByTestId('trigger');
    landNow(trigger);
    await flush();
    const [to, transition, options] = animator.animate.mock
      .lastCall as unknown as [
      {scale: number},
      {spring: unknown},
      {at: number},
    ];
    expect(to).toEqual({scale: contextMenu.press.heldScale});
    expect(transition).toEqual({spring: springs.contextMenuLift});
    expect(typeof options.at).toBe('number');
    expect(animator.play).not.toHaveBeenCalled();
  });

  it('returns on springs.contextMenuDismiss, at the time the recognizer ended the press', async () => {
    const {getByTestId} = render(<Trigger />);
    const trigger = getByTestId('trigger');
    landNow(trigger);
    await flush();
    feedback?.end(1000);
    expect(animator.animate.mock.lastCall).toEqual([
      {scale: 1},
      {spring: springs.contextMenuDismiss},
      {at: 1000},
    ]);
    expect(animator.play).not.toHaveBeenCalled();
  });

  it('grows a finger at its onset, 150 ms after the landing the recognizer reports', async () => {
    vi.useFakeTimers({toFake: [...FAKE_TIMERS.toFake]});
    try {
      const {getByTestId} = render(<Trigger />);
      vi.advanceTimersByTime(1000);
      // The recognizer reports the landing 40 ms late, on a busy main thread.
      const landedAt = performance.now() - 40;
      feedback?.begin(landedAt, getByTestId('trigger'));
      await vi.advanceTimersByTimeAsync(109);
      expect(growths()).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(1 + FRAME_MS);
      expectGrowthFromOnsetFrame(landedAt + 150);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps a landing’s onset when the press machine marks the press later', async () => {
    vi.useFakeTimers({toFake: [...FAKE_TIMERS.toFake]});
    try {
      const {getByTestId} = render(<TriggerWithRecognizer />);
      vi.advanceTimersByTime(1000);
      const landedAt = performance.now();
      feedback?.begin(landedAt, getByTestId('trigger'));
      await vi.advanceTimersByTimeAsync(240);
      getByTestId('trigger').setAttribute(PRESSED_ATTRIBUTE, 'on');
      await vi.advanceTimersByTimeAsync(200);
      expectGrowthFromOnsetFrame(landedAt + 150);
    } finally {
      vi.useRealTimers();
    }
  });

  it('grows only the innermost trigger for a finger the recognizer reports on a nested trigger', async () => {
    vi.useFakeTimers({toFake: [...FAKE_TIMERS.toFake]});
    try {
      const {getByTestId} = render(<NestedTriggers />);
      const inner = getByTestId('inner');
      nested.outer?.begin(performance.now(), inner);
      nested.inner?.begin(performance.now(), inner);
      await vi.advanceTimersByTimeAsync(150 + FRAME_MS);
      expect(animator.animated).toEqual([inner]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('builds the motion engine in the first frame after the landing, before the onset', async () => {
    vi.useFakeTimers({toFake: [...FAKE_TIMERS.toFake]});
    try {
      const {getByTestId} = render(<Trigger />);
      const trigger = getByTestId('trigger');
      feedback?.begin(performance.now(), trigger);
      expect(animator.element).toBeNull();
      await vi.advanceTimersByTimeAsync(FRAME_MS);
      expect(animator.element).toBe(trigger);
      expect(growths()).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ['the recognizer ends the press', () => feedback?.end(performance.now())],
    ['the menu shows', () => feedback?.hold()],
  ])(
    'stops watching frames for the onset when %s before it',
    async (_, stop) => {
      vi.useFakeTimers({toFake: [...FAKE_TIMERS.toFake]});
      try {
        const {getByTestId} = render(<Trigger />);
        feedback?.begin(performance.now(), getByTestId('trigger'));
        await vi.advanceTimersByTimeAsync(60);
        const frames = vi.spyOn(window, 'requestAnimationFrame');
        try {
          stop();
          await vi.advanceTimersByTimeAsync(200);
          expect(frames).not.toHaveBeenCalled();
          expect(growths()).toHaveLength(0);
        } finally {
          frames.mockRestore();
        }
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it('returns on springs.contextMenuDismiss when the menu the press opened closes', async () => {
    const {getByTestId} = render(<Trigger />);
    const trigger = getByTestId('trigger');
    landNow(trigger);
    await flush();
    feedback?.hold();
    feedback?.release();
    expect(animator.animate.mock.lastCall).toEqual([
      {scale: 1},
      {spring: springs.contextMenuDismiss},
    ]);
    expect(animator.play).not.toHaveBeenCalled();
  });
});
