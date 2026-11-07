// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useAlertMotion.test.tsx
 * @input A component using useAlertMotion, with the alert's exit copy
 *   replaced by a stand-in whose fade ends when the test says so
 * @output The hook's state contract: the touch look and the start scale. A
 *   close takes the copy before the close commit changes the DOM. It places
 *   the copy with the page inert and focus out until the fade ends. Focus
 *   then returns to the opener. It also covers an exit of 0 ms, the backstop,
 *   a reopen mid-fade, an unmount mid-fade and a disabled hook
 * @position jsdom tests of packages/core/src/AlertDialog/useAlertMotion.ts
 */

import {act, render} from '@testing-library/react';
import {hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {LayoutChangeSnapshot} from '../motion/LayoutChangeSnapshot';
import {
  SCALE_FROM_PROPERTY,
  useAlertMotion,
  type AlertMotion,
} from './useAlertMotion';

/** The stand-in copies placed, and the fade the next one plays. */
const exitCopies = vi.hoisted(() => ({
  fade: [] as Animation[],
  placed: [] as HTMLElement[],
}));

// jsdom has no top layer, so the real copy is never shown there.
vi.mock('../privateAttributes/alertExit.stylex', () => ({
  takeAlertExitCopy: (element: HTMLElement) => {
    const copy = element.ownerDocument.createElement('div');
    const fade = exitCopies.fade;
    copy.getAnimations = () => fade;
    return {
      copy,
      place: () => {
        element.after(copy);
        exitCopies.placed.push(copy);
      },
    };
  },
}));

/** The exit copy's own style, as AlertDialog passes it. */
const EXIT_COPY_STYLE = {'animation-name': 'fade-out'};

/** A CSS animation stand-in that ends when `end` runs. */
interface StandIn {
  animation: Animation;
  end: () => void;
}

function standIn(endTime: number): StandIn {
  let end: () => void = () => {};
  const finished = new Promise<Animation>(resolve => {
    end = () => resolve(animation);
  });
  const animation = {
    ready: Promise.resolve(),
    finished,
    startTime: null,
    effect: {getComputedTiming: () => ({endTime})},
  } as unknown as Animation;
  return {animation, end};
}

/** Plays `fade` on the next copy. */
const fadeNext = (...fade: StandIn[]) => {
  exitCopies.fade = fade.map(item => item.animation);
};

let latest: AlertMotion | null = null;

function Alert({isOpen, isEnabled}: {isOpen: boolean; isEnabled: boolean}) {
  const motion = useAlertMotion({
    isOpen,
    isEnabled,
    exitCopyStyle: EXIT_COPY_STYLE,
  });
  latest = motion;
  return (
    <>
      {/* As AlertDialog does: the copy is taken before the close commit. */}
      <LayoutChangeSnapshot
        value={isOpen}
        onBeforeChange={motion.beforeOpenChange}
      />
      <div
        ref={element => {
          if (element != null) {
            Object.defineProperty(element, 'offsetWidth', {
              configurable: true,
              value: 320,
            });
          }
          motion.ref(element);
        }}
        data-testid="alert">
        <button type="button">Cancel</button>
      </div>
    </>
  );
}

/** The alert with the control that opens it. */
function Page({isOpen, isEnabled}: {isOpen: boolean; isEnabled: boolean}) {
  return (
    <>
      <button type="button">Open</button>
      <Alert isOpen={isOpen} isEnabled={isEnabled} />
    </>
  );
}

const motion = (): AlertMotion => {
  if (latest == null) {
    throw new Error('not rendered');
  }
  return latest;
};

/** Lets the stand-ins' ends and queued focus moves reach the page. */
const settle = async () => {
  await act(async () => {});
};

/** Lets two animation frames run: the fade starts on the second. */
const nextFrames = async () => {
  await act(async () => {
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });
  });
};

/** Opens the alert from the focused Open button, and focuses Cancel. */
async function openFromOpener() {
  const view = render(<Page isOpen={false} isEnabled />);
  const opener = view.getByRole('button', {name: 'Open'});
  opener.focus();
  view.rerender(<Page isOpen isEnabled />);
  await settle();
  const cancel = view.getByRole('button', {name: 'Cancel'});
  cancel.focus();
  return {view, opener, cancel};
}

const lastCopy = () => exitCopies.placed.at(-1);

beforeEach(() => {
  exitCopies.fade = [];
  exitCopies.placed = [];
  latest = null;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('useAlertMotion', () => {
  it('takes the touch entrance when it opens, from a start scale that stays inside the viewport', () => {
    Object.defineProperty(document.documentElement, 'clientWidth', {
      configurable: true,
      value: 360,
    });
    const view = render(<Alert isOpen isEnabled />);
    expect(motion().look).toBe('entrance');
    // 360 / 320: the 1.2 start would pass the viewport's edges.
    expect(
      view.getByTestId('alert').style.getPropertyValue(SCALE_FROM_PROPERTY),
    ).toBe(String(360 / 320));
  });

  it('closes at once, with no copy and no hold, when the exit is 0 ms', async () => {
    const {view} = await openFromOpener();
    fadeNext(standIn(0));
    view.rerender(<Page isOpen={false} isEnabled />);
    expect(lastCopy()?.isConnected).toBe(false);
    expect(document.querySelector('[inert]')).toBeNull();
  });

  it('closes the Dialog as the copy fades, keeps the page inert with focus out until the fade ends, then returns focus to the opener', async () => {
    const {view, opener, cancel} = await openFromOpener();
    const fade = standIn(300);
    fadeNext(fade);
    view.rerender(<Page isOpen={false} isEnabled />);
    // Taken before the close commit changed the DOM, and placed once the
    // page was inert.
    expect(lastCopy()?.isConnected).toBe(true);
    expect(opener.closest('[inert]')).not.toBeNull();
    expect(cancel.closest('[inert]')).not.toBeNull();
    expect(document.activeElement).toBe(document.body);
    fade.end();
    await nextFrames();
    await settle();
    expect(lastCopy()?.isConnected).toBe(false);
    expect(document.querySelector('[inert]')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('holds the fade at its start until a frame has shown the copy, then plays it from that frame', async () => {
    const {view} = await openFromOpener();
    vi.useFakeTimers();
    const fade = standIn(300);
    fadeNext(fade);
    view.rerender(<Page isOpen={false} isEnabled />);
    const playState = () =>
      lastCopy()?.style.getPropertyValue('animation-play-state');
    expect(playState()).toBe('paused');
    let shownAt = 0;
    window.requestAnimationFrame(time => {
      shownAt = time;
    });
    act(() => {
      vi.advanceTimersToNextFrame();
    });
    // The frame that shows the copy, at the fade's start.
    expect(playState()).toBe('paused');
    act(() => {
      vi.advanceTimersToNextFrame();
    });
    expect(playState()).toBe('');
    expect(fade.animation.startTime).toBe(shownAt);
    expect(lastCopy()?.isConnected).toBe(true);
  });

  it('starts the fade 1 s after the close when no frame comes, and its backstop then ends the close: the copy goes, the page is live again, and focus returns', async () => {
    const {view, opener} = await openFromOpener();
    vi.useFakeTimers();
    // A hidden page: no frame comes.
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
    fadeNext(standIn(300));
    view.rerender(<Page isOpen={false} isEnabled />);
    const playState = () =>
      lastCopy()?.style.getPropertyValue('animation-play-state');
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(playState()).toBe('paused');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    // The copy never goes without its fade.
    expect(playState()).toBe('');
    expect(lastCopy()?.isConnected).toBe(true);
    expect(document.querySelector('[inert]')).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(lastCopy()?.isConnected).toBe(false);
    expect(document.querySelector('[inert]')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('starts a fade whose frame comes late from one frame before it: after a main-thread block, the fade does not skip its curve', async () => {
    const {view} = await openFromOpener();
    vi.useFakeTimers();
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frames.push(callback);
      return frames.length;
    });
    const fade = standIn(1000);
    fadeNext(fade);
    view.rerender(<Page isOpen={false} isEnabled />);
    const shownAt = performance.now();
    act(() => {
      frames.shift()?.(shownAt);
    });
    // A 300 ms task, then the next frame with the old frame time.
    act(() => {
      vi.advanceTimersByTime(300);
    });
    act(() => {
      frames.shift()?.(shownAt + 16);
    });
    expect(fade.animation.startTime).toBe(performance.now() - 1000 / 60);
  });

  it('never starts the fade before the frame that shows the copy runs: a frame time from before the copy was placed does not date it', async () => {
    const {view} = await openFromOpener();
    vi.useFakeTimers();
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frames.push(callback);
      return frames.length;
    });
    const fade = standIn(1000);
    fadeNext(fade);
    view.rerender(<Page isOpen={false} isEnabled />);
    act(() => {
      vi.advanceTimersByTime(5);
    });
    const shownAt = performance.now();
    // The first frame carries a time from before the copy was placed, and the
    // next frame follows at once.
    act(() => {
      frames.shift()?.(shownAt - 50);
    });
    act(() => {
      frames.shift()?.(shownAt - 34);
    });
    expect(fade.animation.startTime).toBe(shownAt);
  });

  it('ends the fade once it has had its time, from its first frame, when its end is never reported', async () => {
    const {view, opener} = await openFromOpener();
    vi.useFakeTimers();
    fadeNext(standIn(300));
    view.rerender(<Page isOpen={false} isEnabled />);
    // The fade waits at its start for the frame that shows the copy, then
    // plays: its first frame has come.
    act(() => {
      vi.advanceTimersToNextFrame();
      vi.advanceTimersToNextFrame();
    });
    await settle();
    act(() => {
      vi.advanceTimersByTime(399);
    });
    expect(lastCopy()?.isConnected).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(lastCopy()?.isConnected).toBe(false);
    expect(document.querySelector('[inert]')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('returns to rest at once when reopened mid-fade: the copy goes, the page is live again, and the action it blurred takes focus back', async () => {
    const {view, cancel} = await openFromOpener();
    fadeNext(standIn(300));
    view.rerender(<Page isOpen={false} isEnabled />);
    expect(cancel.closest('[inert]')).not.toBeNull();
    view.rerender(<Page isOpen isEnabled />);
    await settle();
    expect(motion().look).toBe('settled');
    expect(lastCopy()?.isConnected).toBe(false);
    expect(document.querySelector('[inert]')).toBeNull();
    expect(cancel).toHaveFocus();
  });

  it('gives the blurred action focus back on a reopen mid-fade in a same-origin iframe too', async () => {
    // A same-origin iframe's document: its nodes belong to that window.
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const doc = frame.contentDocument as Document;
    const container = doc.body.appendChild(doc.createElement('div'));
    const view = render(<Alert isOpen isEnabled />, {container});
    await settle();
    const cancel = view.getByRole('button', {name: 'Cancel'});
    // Another realm: this window's classes do not match the iframe's nodes.
    expect(cancel instanceof HTMLElement).toBe(false);
    // Compared as booleans: printing another window's node fails here.
    const hasFocus = () => doc.activeElement === cancel;
    cancel.focus();
    expect(hasFocus()).toBe(true);
    fadeNext(standIn(300));
    view.rerender(<Alert isOpen={false} isEnabled />);
    expect(cancel.closest('[inert]') != null).toBe(true);
    expect(hasFocus()).toBe(false);
    view.rerender(<Alert isOpen isEnabled />);
    await settle();
    expect(cancel.closest('[inert]') == null).toBe(true);
    expect(hasFocus()).toBe(true);
    view.unmount();
    frame.remove();
  });

  it('does nothing when disabled: no touch style, no copy and no hold, and it closes with the caller', () => {
    fadeNext(standIn(550));
    const view = render(<Page isOpen isEnabled={false} />);
    expect(motion().look).toBe('none');
    view.rerender(<Page isOpen={false} isEnabled={false} />);
    expect(exitCopies.placed).toHaveLength(0);
    expect(document.querySelector('[inert]')).toBeNull();
  });

  it('opens at rest after hydration when the server markup had it open, and enters on a later open', async () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(<Alert isOpen isEnabled />);
    document.body.appendChild(container);
    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, <Alert isOpen isEnabled />);
    });
    expect(motion().look).toBe('settled');
    fadeNext(standIn(0));
    await act(async () => root.render(<Alert isOpen={false} isEnabled />));
    await act(async () => root.render(<Alert isOpen isEnabled />));
    expect(motion().look).toBe('entrance');
    await act(async () => root.unmount());
    container.remove();
  });

  it('lets go when unmounted mid-fade: no timer, no copy and no inert page are left', async () => {
    const {view} = await openFromOpener();
    vi.useFakeTimers();
    fadeNext(standIn(300));
    view.rerender(<Page isOpen={false} isEnabled />);
    const page = view.container;
    expect(page.hasAttribute('inert')).toBe(true);
    view.unmount();
    // jsdom's own selection update queues a 0 ms timer as focus moves.
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(vi.getTimerCount()).toBe(0);
    expect(lastCopy()?.isConnected).toBe(false);
    expect(page.hasAttribute('inert')).toBe(false);
  });
});
