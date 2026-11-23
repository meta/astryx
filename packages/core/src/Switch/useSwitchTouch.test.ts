// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useSwitchTouch.test.ts
 * @input vitest (jsdom), useSwitchTouch.ts's controller, and a recording
 *   stand-in for the compositor animator
 * @output Unit tests for what Switch's touch presentation asks the animator
 *   to do. A value change mid-fade swaps the colour layer on its running
 *   clock (a rebase), never from rest. A press's settle takes the theme's
 *   tempo, as its lift does. A switch reads no style when it attaches
 * @position Testing; the controller's calls, without a browser. The motion
 *   itself is proven in __tests__/Switch.interaction.browser.spec.ts and on
 *   the iOS simulator
 *
 * SYNC: useSwitchTouch.ts.
 */

import {afterEach, describe, expect, it, vi} from 'vitest';

import type * as AnimatorModule from '../motion/animator';
import type {MotionCurve} from '../motion/animator';

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
    createMotionEngine: (
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

/** Every controller a test attaches. The top-level afterEach detaches them. */
const controllers: InstanceType<typeof SwitchTouchController>[] = [];

function mount({
  isRtl = false,
  isOn = false,
  thumbClassName = '',
}: {isRtl?: boolean; isOn?: boolean; thumbClassName?: string} = {}) {
  // The theme's two fills, as the track's classes paint them.
  const style = document.createElement('style');
  style.textContent =
    '.off { background-color: rgb(212, 212, 212) } .on { background-color: rgb(27, 27, 27) }';
  document.head.append(style);
  const surface = document.createElement('div');
  const input = document.createElement('input');
  input.type = 'checkbox';
  const track = document.createElement('div');
  track.className = isOn ? 'on' : 'off';
  const thumb = document.createElement('div');
  thumb.className = thumbClassName;
  track.append(thumb);
  surface.append(input, track);
  document.body.append(surface);
  if (isRtl) {
    surface.style.direction = 'rtl';
  }
  const controller = new SwitchTouchController(
    isOn,
    switchTouchGeometry(40, 24),
  );
  controllers.push(controller);
  controller.setOtherTrack(trackStateOf({className: isOn ? 'off' : 'on'}));
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
  // A lift starts a 300 ms wait for the browser's click. Detach ends the
  // wait, so its timer cannot fire after the test environment removes the
  // window.
  for (const controller of controllers.splice(0)) {
    controller.detach();
  }
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

describe('the thumb when the value changes', () => {
  it('rebases toward the new rest, so a spring already heading there moves whole, then sends it there', () => {
    const {controller, track} = mount();
    const element = track.firstElementChild;
    const thumb = animators.find(
      animator =>
        animator.element === element && animator.pseudoElement == null,
    );
    if (thumb == null) {
      throw new Error('no thumb animator');
    }
    thumb.calls.length = 0;
    render(controller, track, true);
    // The CSS rest moved by the travel. The shift names the rest the spring
    // heads for after it. The animator moves a spring whole only when its
    // target lands there, and otherwise rebases as before.
    const travel = switchTouchGeometry(40, 24).travel;
    const rebase = thumb.calls.find(call => call.name === 'rebase');
    expect(rebase?.args).toEqual([{x: -travel}, {towards: {x: 0}}]);
    const animates = thumb.calls.filter(call => call.name === 'animate');
    expect(animates.at(-1)?.args[0]).toEqual({x: 0});
  });
});

describe("the press's lift and settle at the theme's tempo", () => {
  /** The release curve's length when the thumb's theme plays at `tempo`. */
  function settleSeconds(tempo: number): number {
    const style = document.createElement('style');
    style.textContent = `.paced { --_astryx-motion-tempo: ${tempo}; }`;
    document.head.append(style);
    const {controller, track} = mount();
    const thumbElement = track.firstElementChild as HTMLElement;
    thumbElement.className = 'paced';
    const thumb = animators.find(
      animator =>
        animator.element === thumbElement && animator.pseudoElement == null,
    );
    if (thumb == null) {
      throw new Error('no thumb animator');
    }
    // A press released at once: the settle waits out the minimum lift.
    const press = controller as unknown as {
      lift(time: number): void;
      settle(time: number, touchRelease: boolean): void;
    };
    press.lift(0);
    press.settle(0, false);
    const play = thumb.calls.find(call => call.name === 'play');
    const curve = (play?.args[0] as Record<string, MotionCurve>).scaleX;
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    animators.length = 0;
    return curve.duration;
  }

  it('waits the minimum lift and settles on springs that all take the tempo times as long', () => {
    const atOne = settleSeconds(1);
    // The minimum lift alone is 235 ms, so the curve is on screen.
    expect(atOne).toBeGreaterThan(0.235);
    expect(settleSeconds(1.5) / atOne).toBeCloseTo(1.5, 6);
    expect(settleSeconds(0.75) / atOne).toBeCloseTo(0.75, 6);
  });
});

describe('the track geometry', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    animators.length = 0;
  });

  it('reads no box when it attaches, and reads the track once at each press', () => {
    const boxReads: Element[] = [];
    const original = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        boxReads.push(this);
        return original.call(this);
      },
    );
    const {controller, track} = mount();
    expect(boxReads.filter(element => element === track)).toHaveLength(0);

    const press = controller as unknown as {
      onControlEvent(event: string, touch: {x: number; startX: number}): void;
    };
    press.onControlEvent('touchDown', {x: 0, startX: 0});
    expect(boxReads.filter(element => element === track)).toHaveLength(1);
    press.onControlEvent('touchUpInside', {x: 0, startX: 0});
    press.onControlEvent('touchDown', {x: 0, startX: 0});
    expect(boxReads.filter(element => element === track)).toHaveLength(2);
  });
});

describe('the style reads', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    animators.length = 0;
  });

  /** Counts every computed-style read, through `window` or the global. */
  function countStyleReads(): () => number {
    let count = 0;
    for (const owner of new Set<Window>([
      window,
      globalThis as unknown as Window,
    ])) {
      const original = owner.getComputedStyle;
      vi.spyOn(owner, 'getComputedStyle').mockImplementation((...args) => {
        count++;
        return original.apply(window, args);
      });
    }
    return () => count;
  }

  /** A switch attached under a mouse or a pen, with no touch presentation. */
  function attachForPointer() {
    const surface = document.createElement('div');
    const input = document.createElement('input');
    input.type = 'checkbox';
    const track = document.createElement('div');
    const thumb = document.createElement('div');
    track.append(thumb);
    surface.append(input, track);
    document.body.append(surface);
    const controller = new SwitchTouchController(
      false,
      switchTouchGeometry(40, 24),
    );
    controllers.push(controller);
    controller.attach({surface, input, thumb, track}, 'pointer');
  }

  // A style read at mount forces the browser to compute styles inside the
  // task that mounts the switch, such as a dialog's open.
  it('reads no style when it attaches under a finger', () => {
    const reads = countStyleReads();
    mount();
    expect(reads()).toBe(0);
  });

  it('reads no style when it attaches under a mouse or a pen', () => {
    const reads = countStyleReads();
    attachForPointer();
    expect(reads()).toBe(0);
  });

  /** The thumb's rebase on a switch's first change off to on. */
  function firstRebase(isRtl: boolean): number {
    const {controller, track} = mount({isRtl});
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        return this === track
          ? DOMRect.fromRect({x: 0, y: 0, width: 40, height: 24})
          : DOMRect.fromRect();
      },
    );
    controller.setDefaultThumb({off: 16, on: 20});
    const thumbElement = track.firstElementChild as HTMLElement;
    thumbElement.style.width = '20px';
    thumbElement.style.height = '20px';
    const thumb = animators.find(
      animator =>
        animator.element === thumbElement && animator.pseudoElement == null,
    );
    render(controller, track, true);
    const rebase = thumb?.calls.find(call => call.name === 'rebase');
    return (rebase?.args[0] as {x: number}).x;
  }

  it('moves the thumb toward the inline end on the first change, right to left as left to right', () => {
    const travel = switchTouchGeometry(40, 24, {width: 16, height: 16}).travel;
    const leftToRight = firstRebase(false);
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    animators.length = 0;
    const rightToLeft = firstRebase(true);
    // Off to on: the thumb is shifted back by its travel, toward the start.
    expect(leftToRight).toBeCloseTo(-travel, 6);
    expect(rightToLeft).toBeCloseTo(travel, 6);
  });

  /**
   * A switch mounted under a finger in `isOn`, and the fade colour painted
   * when each motion of its fade layer starts.
   */
  function fadeColours(isOn: boolean) {
    const {controller, fade, track} = mount({isOn});
    const colours: string[] = [];
    const push = fade.calls.push.bind(fade.calls);
    fade.calls.push = (...calls: Call[]) => {
      for (const call of calls) {
        if (call.name !== 'set') {
          colours.push(track.style.getPropertyValue('--_switch-fade-fill'));
        }
      }
      return push(...calls);
    };
    return {controller, track, colours};
  }

  const OFF_FILL = 'rgb(212, 212, 212)';
  const ON_FILL = 'rgb(27, 27, 27)';

  it("paints the fade layer's colour before its first motion after a finger mount, in both states", () => {
    for (const isOn of [false, true]) {
      // The app changes the value first: the layer shows the fill it left.
      const changed = fadeColours(isOn);
      render(changed.controller, changed.track, !isOn);
      expect(changed.colours.length).toBeGreaterThan(0);
      expect(new Set(changed.colours)).toEqual(
        new Set([isOn ? ON_FILL : OFF_FILL]),
      );
      // A tap first: the layer heads for the other state's fill.
      const tapped = fadeColours(isOn);
      const press = tapped.controller as unknown as {
        onControlEvent(event: string, touch: {x: number; startX: number}): void;
      };
      press.onControlEvent('touchDown', {x: 0, startX: 0});
      press.onControlEvent('touchUpInside', {x: 0, startX: 0});
      expect(tapped.colours.length).toBeGreaterThan(0);
      expect(new Set(tapped.colours)).toEqual(
        new Set([isOn ? OFF_FILL : ON_FILL]),
      );
    }
  });

  it("takes the theme's circle for the state the switch attached in, though the theme sizes each state", () => {
    // As a theme's compiled CSS sizes `switch-thumb` by its checked state.
    const style = document.createElement('style');
    style.textContent =
      '.astryx-switch-thumb { --_switch-thumb-width: 27px; } .astryx-switch-thumb[data-checked] { --_switch-thumb-width: 20px; }';
    document.head.append(style);
    // It attaches off: the theme's off circle is 27px.
    const {controller, track} = mount({thumbClassName: 'astryx-switch-thumb'});
    const thumbElement = track.firstElementChild as HTMLElement;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        return this === track
          ? DOMRect.fromRect({x: 0, y: 0, width: 51, height: 31})
          : DOMRect.fromRect();
      },
    );
    controller.setDefaultThumb({off: 16, on: 20});
    const thumb = animators.find(
      animator =>
        animator.element === thumbElement && animator.pseudoElement == null,
    );
    if (thumb == null) {
      throw new Error('no thumb animator');
    }
    thumb.values.scaleX = 1;
    thumb.values.scaleY = 1;
    // The value turns on: the thumb now renders the on state's 20px circle.
    thumbElement.setAttribute('data-checked', 'checked');
    thumbElement.style.width = '20px';
    thumbElement.style.height = '20px';
    render(controller, track, true);
    // The thumb's scale takes the 27px circle over and settles to the 20px
    // one. The travel is the same for any circle, so only the scale shows
    // which circle it attached with.
    const scales = thumb.calls
      .filter(call => call.name === 'play')
      .map(call => (call.args[0] as {scaleX?: MotionCurve}).scaleX)
      .filter(curve => curve != null);
    expect(scales).toHaveLength(1);
    expect(scales[0]?.at(0)).toBeCloseTo(27 / 20, 6);
  });
});

describe('the first value change before any measurement', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    animators.length = 0;
  });

  /** The track's rendered box and the thumb's circle, as a browser lays them out. */
  function layOut(track: HTMLElement, thumbSize: number) {
    const thumb = track.firstElementChild as HTMLElement;
    thumb.style.width = `${thumbSize}px`;
    thumb.style.height = `${thumbSize}px`;
  }

  function trackReads(track: HTMLElement): () => number {
    const reads: Element[] = [];
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        reads.push(this);
        return this === track
          ? DOMRect.fromRect({x: 0, y: 0, width: 40, height: 24})
          : DOMRect.fromRect();
      },
    );
    return () => reads.filter(element => element === track).length;
  }

  it('animates the thumb from the previous default circle, then uses the measured one', () => {
    const {controller, track} = mount();
    const reads = trackReads(track);
    controller.setDefaultThumb({off: 16, on: 20});
    const thumbElement = track.firstElementChild as HTMLElement;
    const thumb = animators.find(
      animator =>
        animator.element === thumbElement && animator.pseudoElement == null,
    );
    if (thumb == null) {
      throw new Error('no thumb animator');
    }
    thumb.values.scaleX = 1;
    thumb.values.scaleY = 1;
    expect(reads()).toBe(0);

    // An app-driven value, a label tap and a key all reach this change.
    layOut(track, 20);
    render(controller, track, true);
    const scales = () =>
      thumb.calls.filter(
        call =>
          call.name === 'play' &&
          (call.args[0] as Record<string, unknown>).scaleX != null,
      ).length;
    // The 16 px circle grows into the 20 px one CSS now renders.
    expect(scales()).toBe(1);
    expect(reads()).toBe(1);

    // The second change starts from the measured circle.
    layOut(track, 16);
    render(controller, track, false);
    expect(scales()).toBe(2);
    expect(
      (controller as unknown as {geometry: {thumbWidth: number}}).geometry
        .thumbWidth,
    ).toBe(16);
  });

  it('shifts the thumb by the rendered track on the first change, so a themed track does not jump', () => {
    const {controller, track} = mount();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        // A theme sizes this track 36 × 24, not the default 40 × 24.
        return this === track
          ? DOMRect.fromRect({x: 0, y: 0, width: 36, height: 24})
          : DOMRect.fromRect();
      },
    );
    controller.setDefaultThumb({off: 16, on: 20});
    const thumbElement = track.firstElementChild as HTMLElement;
    const thumb = animators.find(
      animator =>
        animator.element === thumbElement && animator.pseudoElement == null,
    );
    if (thumb == null) {
      throw new Error('no thumb animator');
    }
    layOut(track, 20);
    render(controller, track, true);
    const rebase = thumb.calls.find(call => call.name === 'rebase');
    // Off to on: back by the travel of the 36 px track with the 16 px circle.
    expect((rebase?.args[0] as {x: number}).x).toBeCloseTo(
      -switchTouchGeometry(36, 24, {width: 16, height: 16}).travel,
      6,
    );
  });

  /** The thumb animator, after a theme sizes the thumb it attached with. */
  function themedMount(attached: string | null) {
    const {controller, track} = mountWith(attached);
    const thumbElement = track.firstElementChild as HTMLElement;
    const thumb = animators.find(
      animator =>
        animator.element === thumbElement && animator.pseudoElement == null,
    );
    if (thumb == null) {
      throw new Error('no thumb animator');
    }
    thumb.values.scaleX = 1;
    thumb.values.scaleY = 1;
    return {controller, track, thumb};
  }

  function mountWith(attached: string | null) {
    // The theme's size for the state the switch attaches in, as its
    // compiled CSS sets it on the thumb.
    const style = document.createElement('style');
    if (attached != null) {
      style.textContent = `div div { --_switch-thumb-width: ${attached}; }`;
    }
    document.head.append(style);
    return mount();
  }

  const scaleFrom = (thumb: (typeof animators)[number]) =>
    thumb.calls.filter(
      call =>
        call.name === 'play' &&
        (call.args[0] as Record<string, unknown>).scaleX != null,
    );

  function boxes(track: HTMLElement, width: number, height: number) {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        return this === track
          ? DOMRect.fromRect({x: 0, y: 0, width, height})
          : DOMRect.fromRect();
      },
    );
  }

  it('keeps a theme-sized circle on the first change: no shrink to the default and back', () => {
    const {controller, track, thumb} = themedMount('27px');
    boxes(track, 51, 31);
    controller.setDefaultThumb({off: 16, on: 20});
    layOut(track, 27);
    render(controller, track, true);
    // The circle was 27px before the change and is after: nothing to scale.
    expect(
      scaleFrom(thumb).filter(
        call => (call.args[0] as {scaleX: number}).scaleX !== 1,
      ),
    ).toEqual([]);
    const rebase = thumb.calls.find(call => call.name === 'rebase');
    expect((rebase?.args[0] as {x: number}).x).toBeCloseTo(
      -switchTouchGeometry(51, 31, {width: 27, height: 27}).travel,
      6,
    );
  });

  it('keeps a theme circle the size of a shipped one: a uniform 20px thumb does not shrink first', () => {
    const {controller, track, thumb} = themedMount('20px');
    boxes(track, 40, 24);
    controller.setDefaultThumb({off: 16, on: 20});
    layOut(track, 20);
    render(controller, track, true);
    expect(
      scaleFrom(thumb).filter(
        call => (call.args[0] as {scaleX: number}).scaleX !== 1,
      ),
    ).toEqual([]);
  });

  it('grows a thumb a theme sizes only when on from the default off circle', () => {
    // No theme size for the off state it attached in.
    const {controller, track, thumb} = themedMount(null);
    boxes(track, 51, 31);
    controller.setDefaultThumb({off: 16, on: 20});
    layOut(track, 27);
    render(controller, track, true);
    // The 16px default grows into the 27px circle the theme draws on.
    expect(scaleFrom(thumb)).toHaveLength(1);
  });

  it('flips a mouse drag after a toggle at the current circle, not the mounted one', () => {
    const surface = document.createElement('div');
    const input = document.createElement('input');
    input.type = 'checkbox';
    const track = document.createElement('div');
    const thumbElement = document.createElement('div');
    track.append(thumbElement);
    surface.append(input, track);
    document.body.append(surface);
    trackReads(track);
    layOut(track, 16);
    const controller = new SwitchTouchController(
      false,
      switchTouchGeometry(40, 24),
    );
    controllers.push(controller);
    controller.attach({surface, input, thumb: thumbElement, track}, 'pointer');

    layOut(track, 20);
    controller.setValue(true);
    const press = controller as unknown as {
      onControlEvent(event: string, touch: {x: number; startX: number}): void;
      geometry: {flipDistance: number};
    };
    press.onControlEvent('touchDown', {x: 0, startX: 0});
    // Track width less the 20 px circle the switch shows now.
    expect(press.geometry.flipDistance).toBe(20);
  });
});
