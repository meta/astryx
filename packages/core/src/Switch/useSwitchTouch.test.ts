// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useSwitchTouch.test.ts
 * @input vitest (jsdom), useSwitchTouch.ts's controller, and a recording
 *   stand-in for the compositor animator
 * @output Unit tests for what Switch's touch presentation asks the animator
 *   to do: a value change mid-fade swaps the colour layer on its running
 *   clock (a rebase), never from rest
 * @position Testing; the controller's calls, without a browser. The motion
 *   itself is proven in __tests__/Switch.interaction.browser.spec.ts and on
 *   the iOS simulator
 *
 * SYNC: useSwitchTouch.ts.
 */

import {afterEach, describe, expect, it, vi} from 'vitest';

import type * as AnimatorModule from '../motion/animator';

interface Call {
  readonly name: string;
  readonly args: unknown[];
}

interface FakeAnimator {
  readonly element: Element;
  readonly pseudoElement: string | undefined;
  readonly calls: Call[];
  readonly values: Record<string, number>;
  readonly velocities: Record<string, number>;
  /** `atRest` callers, resolved by the test (the fade landing). */
  readonly rest: (() => void)[];
}

const animators: FakeAnimator[] = [];

vi.mock('../motion/animator', async importOriginal => {
  const actual = await importOriginal<typeof AnimatorModule>();
  return {
    ...actual,
    createMotionAnimator: (
      element: Element,
      options: {pseudoElement?: string} = {},
    ) => {
      const fake: FakeAnimator = {
        element,
        pseudoElement: options.pseudoElement,
        calls: [],
        values: {},
        velocities: {},
        rest: [],
      };
      animators.push(fake);
      const record =
        (name: string) =>
        (...args: unknown[]) => {
          fake.calls.push({name, args});
          // The browser has not started the motion within a test.
          return {
            finished: Promise.resolve(),
            started: new Promise<number>(() => {}),
          };
        };
      return {
        element,
        get: (property: string) => fake.values[property] ?? 0,
        getVelocity: (property: string) => fake.velocities[property] ?? 0,
        set: record('set'),
        animate: record('animate'),
        play: record('play'),
        rebase: record('rebase'),
        decay: record('decay'),
        stop: record('stop'),
        atRest: async () =>
          new Promise<void>(resolve => {
            fake.rest.push(resolve);
          }),
        reducedMotion: () => 'off',
        dispose: () => {},
      };
    },
  };
});

const {SwitchTouchController} = await import('./useSwitchTouch');
const {switchTouchGeometry} = await import('./switchTouch');
const {trackStateOf} = await import('./switchFill');

function mount() {
  // The theme's two fills, as the track's classes paint them.
  const style = document.createElement('style');
  style.textContent =
    '.off { background-color: rgb(212, 212, 212) } .on { background-color: rgb(27, 27, 27) }';
  document.head.append(style);
  const surface = document.createElement('div');
  const input = document.createElement('input');
  input.type = 'checkbox';
  const track = document.createElement('div');
  track.className = 'off';
  const thumb = document.createElement('div');
  track.append(thumb);
  surface.append(input, track);
  document.body.append(surface);
  const controller = new SwitchTouchController(
    false,
    switchTouchGeometry(40, 24),
  );
  controller.setOtherTrack(trackStateOf({className: 'on'}));
  controller.attach({surface, input, thumb, track}, 'touch');
  const fade = animators.find(
    animator =>
      animator.element === track && animator.pseudoElement === '::after',
  );
  if (fade == null) {
    throw new Error('no colour layer animator');
  }
  return {controller, fade, track};
}

/** The value the app renders: the track's class, then the controller. */
function render(
  controller: InstanceType<typeof SwitchTouchController>,
  track: HTMLElement,
  isOn: boolean,
) {
  track.className = isOn ? 'on' : 'off';
  controller.setOtherTrack(trackStateOf({className: isOn ? 'off' : 'on'}));
  controller.setValue(isOn);
}

/** Where the visuals head, as a release or a drag that flipped leaves it. */
function headTo(
  controller: InstanceType<typeof SwitchTouchController>,
  isOn: boolean,
) {
  (controller as unknown as {isVisuallyOn: boolean}).isVisuallyOn = isOn;
}

const flush = async () => {
  for (let i = 0; i < 3; i++) {
    await Promise.resolve();
  }
};

afterEach(() => {
  animators.length = 0;
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

describe('the colour layer when the value changes', () => {
  it('swaps on its running clock mid-fade when the visuals were not heading there: a rebase to the complement, never a set from rest', () => {
    const {controller, fade} = mount();
    // Mid-fade toward the other side: 0.3 of the other fill, rising.
    fade.values.opacity = 0.3;
    fade.velocities.opacity = 2;
    fade.calls.length = 0;
    controller.setValue(true);
    // A set would end the running fade and start the swapped curve from rest,
    // at the frame that commits it. A long task in that frame would make the
    // track step back toward the fill it left.
    expect(
      fade.calls.filter(
        call =>
          call.name === 'set' &&
          'opacity' in (call.args[0] as Record<string, number>),
      ),
    ).toEqual([]);
    const rebase = fade.calls.find(call => call.name === 'rebase');
    expect(rebase?.args[0]).toEqual({opacity: expect.closeTo(0.4, 9)});
    // The swapped curve continues from the swap, its velocity mirrored, and
    // the layer ends clear. Neither carries a start of its own. The animator
    // starts a curve that continues motion at the call, never before or after
    // the frame on screen.
    const animates = fade.calls.filter(call => call.name === 'animate');
    expect(animates.length).toBeGreaterThan(0);
    const [first] = animates;
    expect((first.args[1] as {velocity?: unknown}).velocity).toEqual({
      opacity: -2,
    });
    expect((rebase?.args[1] as {at?: number} | undefined)?.at).toBeUndefined();
    for (const call of animates) {
      expect((call.args[2] as {at?: number} | undefined)?.at).toBeUndefined();
    }
    expect(animates[animates.length - 1].args[0]).toEqual({opacity: 0});
  });

  it('holds the previous fill when the fade already heads to the change: no curve and no repaint in its frame', async () => {
    const {controller, fade, track} = mount();
    headTo(controller, true);
    // Mid-fade toward on: 0.6 of the on fill, rising.
    fade.values.opacity = 0.6;
    fade.velocities.opacity = 1.5;
    fade.calls.length = 0;
    render(controller, track, true);
    // The track keeps the off fill under the layer; the running fade is
    // left alone. WebKit would play a curve built in a frame a long task
    // holds from its start once the task ends (iOS 26.2).
    expect(track.style.backgroundColor).toBe('rgb(212, 212, 212)');
    expect(fade.calls).toEqual([]);
    expect(fade.rest.length).toBe(1);
    // The fade lands (opaque): the swap happens under it.
    fade.values.opacity = 1;
    fade.velocities.opacity = 0;
    fade.rest[0]();
    await flush();
    expect(track.style.backgroundColor).toBe('');
    const rebase = fade.calls.find(call => call.name === 'rebase');
    expect(rebase?.args[0]).toEqual({opacity: -1});
    const animates = fade.calls.filter(call => call.name === 'animate');
    expect(animates[animates.length - 1]?.args[0]).toEqual({opacity: 0});
  });

  it('lands a held fill early, keeping the picture, when the next change or a new other state comes first', async () => {
    const {controller, fade, track} = mount();
    headTo(controller, true);
    fade.values.opacity = 0.6;
    render(controller, track, true);
    expect(track.style.backgroundColor).toBe('rgb(212, 212, 212)');
    // A re-render with the same other state keeps the hold.
    controller.setOtherTrack(trackStateOf({className: 'off'}));
    expect(track.style.backgroundColor).toBe('rgb(212, 212, 212)');
    // A new other state (a theme or a state class changed) lands it now: the
    // layer swaps to the complement where it is.
    fade.calls.length = 0;
    controller.setOtherTrack(trackStateOf({className: 'off', 'data-x': ''}));
    expect(track.style.backgroundColor).toBe('');
    expect(fade.calls.find(call => call.name === 'rebase')?.args[0]).toEqual({
      opacity: expect.closeTo(-0.2, 9),
    });
    // Its late landing changes nothing.
    fade.calls.length = 0;
    fade.rest[0]();
    await flush();
    expect(fade.calls).toEqual([]);
  });
});
