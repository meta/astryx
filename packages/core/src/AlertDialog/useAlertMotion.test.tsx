// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useAlertMotion.test.tsx
 * @input A component using useAlertMotion, with the dialog's CSS animations
 *   replaced by stand-ins that end when the test says so
 * @output The hook's state contract. It covers the touch look's styles and the
 *   start scale. An exit keeps the alert presented until its end, or closes at
 *   once at 0 ms, and holds its input meanwhile: inert content, focus out. It
 *   also covers the backstop, a reopen mid-exit that gives the content and
 *   focus back, and a disabled hook that follows the caller. The reopen gives
 *   focus back in a same-origin iframe too
 * @position jsdom tests of packages/core/src/AlertDialog/useAlertMotion.ts
 */

import {act, render} from '@testing-library/react';
import {hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  SCALE_FROM_PROPERTY,
  useAlertMotion,
  type AlertMotion,
} from './useAlertMotion';

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
    finished,
    effect: {getComputedTiming: () => ({endTime})},
  } as unknown as Animation;
  return {animation, end};
}

/** What the dialog's `getAnimations()` returns next. */
let running: StandIn[] = [];
let latest: AlertMotion | null = null;

function Alert({isOpen, isEnabled}: {isOpen: boolean; isEnabled: boolean}) {
  const motion = useAlertMotion({isOpen, isEnabled});
  latest = motion;
  return (
    <div
      ref={element => {
        if (element != null) {
          element.getAnimations = () => running.map(r => r.animation);
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
  );
}

const motion = (): AlertMotion => {
  if (latest == null) {
    throw new Error('not rendered');
  }
  return latest;
};

/** Lets the stand-ins' ends reach the hook. */
const settle = async () => {
  await act(async () => {});
};

beforeEach(() => {
  running = [];
  latest = null;
});

afterEach(() => {
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
    expect(motion().isPresented).toBe(true);
    // 360 / 320: the 1.2 start would pass the viewport's edges.
    expect(
      view.getByTestId('alert').style.getPropertyValue(SCALE_FROM_PROPERTY),
    ).toBe(String(360 / 320));
  });

  it('closes at once when the exit is 0 ms', async () => {
    running = [];
    const view = render(<Alert isOpen isEnabled />);
    await settle();
    running = [standIn(0)];
    view.rerender(<Alert isOpen={false} isEnabled />);
    expect(motion().isPresented).toBe(false);
    expect(motion().isLeaving).toBe(false);
  });

  it('stays presented while the exit plays, holds its input with its content inert and focus out of it, and closes at its end', async () => {
    const view = render(<Alert isOpen isEnabled />);
    await settle();
    const cancel = view.getByRole('button', {name: 'Cancel'});
    cancel.focus();
    const exit = standIn(300);
    running = [exit];
    view.rerender(<Alert isOpen={false} isEnabled />);
    expect(motion().look).toBe('exit');
    expect(motion().isLeaving).toBe(true);
    expect(motion().isPresented).toBe(true);
    expect(cancel).toHaveAttribute('inert');
    expect(cancel).not.toHaveFocus();
    exit.end();
    await settle();
    expect(motion().isPresented).toBe(false);
    expect(cancel).not.toHaveAttribute('inert');
  });

  it('closes once the exit has had its time when its end is never reported', async () => {
    vi.useFakeTimers();
    const view = render(<Alert isOpen isEnabled />);
    await settle();
    running = [standIn(300)];
    view.rerender(<Alert isOpen={false} isEnabled />);
    act(() => {
      vi.advanceTimersByTime(399);
    });
    expect(motion().isPresented).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(motion().isPresented).toBe(false);
  });

  it('returns to rest at once when reopened mid-exit: the content is live again, and the action it blurred takes focus back', async () => {
    const view = render(<Alert isOpen isEnabled />);
    await settle();
    const cancel = view.getByRole('button', {name: 'Cancel'});
    cancel.focus();
    running = [standIn(300)];
    view.rerender(<Alert isOpen={false} isEnabled />);
    expect(cancel).toHaveAttribute('inert');
    view.rerender(<Alert isOpen isEnabled />);
    expect(motion().look).toBe('settled');
    expect(motion().isLeaving).toBe(false);
    expect(cancel).not.toHaveAttribute('inert');
    expect(cancel).toHaveFocus();
  });

  it('gives the blurred action focus back on a reopen mid-exit in a same-origin iframe too', async () => {
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
    running = [standIn(300)];
    view.rerender(<Alert isOpen={false} isEnabled />);
    expect(cancel.hasAttribute('inert')).toBe(true);
    expect(hasFocus()).toBe(false);
    view.rerender(<Alert isOpen isEnabled />);
    expect(cancel.hasAttribute('inert')).toBe(false);
    expect(hasFocus()).toBe(true);
    view.unmount();
    frame.remove();
  });

  it('does nothing when disabled: no touch style and no hold, and it closes with the caller', () => {
    running = [standIn(550)];
    const view = render(<Alert isOpen isEnabled={false} />);
    expect(motion().look).toBe('none');
    view.rerender(<Alert isOpen={false} isEnabled={false} />);
    expect(motion().isPresented).toBe(false);
    expect(view.getByRole('button', {name: 'Cancel'})).not.toHaveAttribute(
      'inert',
    );
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
    running = [standIn(0)];
    await act(async () => root.render(<Alert isOpen={false} isEnabled />));
    running = [];
    await act(async () => root.render(<Alert isOpen isEnabled />));
    expect(motion().look).toBe('entrance');
    await act(async () => root.unmount());
    container.remove();
  });

  it('leaves no timer behind when unmounted mid-exit', async () => {
    vi.useFakeTimers();
    const view = render(<Alert isOpen isEnabled />);
    await settle();
    running = [standIn(300)];
    view.rerender(<Alert isOpen={false} isEnabled />);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
