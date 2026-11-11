// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {stubMatchMedia} from '../__tests__/stubMatchMedia';
import {holdEntranceInput} from './holdEntranceInput';
import {subscribeInput} from '../utils/inputStream';
import {isInHeldLayer, isInputShield} from './inputHold';

function deferred() {
  let resolve: () => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
}

/** A fake animation: running, and ending at `endTime` (Infinity: endless). */
function fakeAnimation(
  finished: Promise<unknown>,
  {
    endTime = 300,
    playState = 'running',
  }: {endTime?: number; playState?: AnimationPlayState} = {},
): Animation {
  return {
    playState,
    finished,
    effect: {getComputedTiming: () => ({endTime})},
  } as unknown as Animation;
}

/** A layer root in the document whose own animations are `animations`. */
function mountLayer(animations: Animation[]): HTMLElement {
  const layer = document.createElement('div');
  layer.append(document.createElement('button'));
  document.body.append(layer);
  Object.defineProperty(layer, 'getAnimations', {
    configurable: true,
    value: () => animations,
  });
  return layer;
}

const INIT = {bubbles: true, cancelable: true, composed: true};

/** A press and its click on `element`: the events that reached it. */
function tap(element: Element, pointerType: string, pointerId: number) {
  const reached: string[] = [];
  const record = (event: Event) => reached.push(event.type);
  const types = ['pointerdown', 'pointerup', 'click'];
  for (const type of types) {
    element.addEventListener(type, record);
  }
  element.dispatchEvent(
    new PointerEvent('pointerdown', {...INIT, pointerId, pointerType}),
  );
  element.dispatchEvent(
    new PointerEvent('pointerup', {...INIT, pointerId, pointerType}),
  );
  element.dispatchEvent(
    new PointerEvent('click', {...INIT, pointerType, detail: 1}),
  );
  for (const type of types) {
    element.removeEventListener(type, record);
  }
  return reached;
}

/** The holds a case starts, released after it: a hold listens on the window. */
const releases: (() => void)[] = [];

function hold(layer: Element): (() => void) | null {
  const release = holdEntranceInput(layer);
  if (release != null) {
    releases.push(release);
  }
  return release;
}

const flush = async () => {
  for (let i = 0; i < 4; i += 1) {
    await Promise.resolve();
  }
};

// A touch presentation: the primary pointer is coarse (spec:AST-094 FR13).
beforeEach(() => {
  stubMatchMedia({pointer: 'coarse'});
});

afterEach(() => {
  for (const release of releases.splice(0)) {
    release();
  }
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('holdEntranceInput', () => {
  it('holds the layer until its entrance ends under a coarse primary pointer', async () => {
    const entrance = deferred();
    const layer = mountLayer([fakeAnimation(entrance.promise)]);

    expect(hold(layer)).toBeTypeOf('function');
    expect(isInHeldLayer(layer.firstElementChild)).toBe(true);

    entrance.resolve();
    await flush();
    expect(isInHeldLayer(layer.firstElementChild)).toBe(false);
  });

  it('waits for every animation of the entrance', async () => {
    const short = deferred();
    const long = deferred();
    const layer = mountLayer([
      fakeAnimation(short.promise, {endTime: 200}),
      fakeAnimation(long.promise, {endTime: 400}),
    ]);

    hold(layer);
    short.resolve();
    await flush();
    expect(isInHeldLayer(layer)).toBe(true);

    long.resolve();
    await flush();
    expect(isInHeldLayer(layer)).toBe(false);
  });

  it('ends the hold when the entrance is canceled (a close midway)', async () => {
    const entrance = deferred();
    const layer = mountLayer([fakeAnimation(entrance.promise)]);

    hold(layer);
    entrance.reject(new DOMException('canceled', 'AbortError'));
    await flush();
    expect(isInHeldLayer(layer)).toBe(false);
  });

  it('returns a release that ends the hold early', () => {
    const layer = mountLayer([fakeAnimation(new Promise(() => {}))]);

    const release = hold(layer);
    release?.();
    expect(isInHeldLayer(layer)).toBe(false);
  });

  it("decides by each event's pointer: a finger's tap is held, a mouse's click passes (spec:AST-094 FR35)", () => {
    const layer = mountLayer([fakeAnimation(new Promise(() => {}))]);
    const button = layer.firstElementChild as Element;

    hold(layer);
    expect(tap(button, 'touch', 1)).toEqual([]);
    expect(tap(button, 'pen', 2)).toEqual([]);
    expect(tap(button, 'mouse', 3)).toEqual([
      'pointerdown',
      'pointerup',
      'click',
    ]);
  });

  it("after a finger, leaves open the point where the mouse rests: a still mouse's press reaches the layer, a finger's is held (spec:AST-094 FR35)", () => {
    // Press feedback hears the page's pointer moves through the stream on any
    // page with a pressable. The mouse came to rest; then a finger opened the
    // layer.
    const stop = subscribeInput(window, 'pointermove', () => {});
    document.body.dispatchEvent(
      new PointerEvent('pointermove', {
        ...INIT,
        pointerType: 'mouse',
        clientX: 50,
        clientY: 30,
      }),
    );
    document.body.dispatchEvent(
      new PointerEvent('pointermove', {...INIT, pointerType: 'touch'}),
    );
    stop();
    const layer = mountLayer([fakeAnimation(new Promise(() => {}))]);
    const button = layer.firstElementChild as Element;

    hold(layer);
    const shield = [...layer.children].find(child =>
      isInputShield(child),
    ) as HTMLElement;
    expect(shield.style.pointerEvents).toBe('auto');
    expect(shield.style.getPropertyValue('clip-path')).toContain(
      '48px 28px, 48px 32px, 52px 32px, 52px 28px',
    );
    expect(tap(button, 'touch', 1)).toEqual([]);
    expect(tap(button, 'mouse', 2)).toEqual([
      'pointerdown',
      'pointerup',
      'click',
    ]);
  });

  it('holds nothing under a fine primary pointer: a mouse press made before the mouse moves reaches the layer, and no window listener is added (spec:AST-094 FR35, FR24)', () => {
    stubMatchMedia({pointer: 'fine'});
    const added = vi.spyOn(window, 'addEventListener');
    const layer = mountLayer([fakeAnimation(new Promise(() => {}))]);
    const button = layer.firstElementChild as Element;

    expect(hold(layer)).toBeNull();
    expect(isInHeldLayer(button)).toBe(false);
    expect([...layer.children].some(child => isInputShield(child))).toBe(false);
    expect(added).not.toHaveBeenCalled();
    expect(tap(button, 'mouse', 4)).toEqual([
      'pointerdown',
      'pointerup',
      'click',
    ]);
  });

  it("reads the entrance from another element and holds the layer until that element's entrance ends", async () => {
    const layer = mountLayer([]);
    const panel = mountLayer([]);
    const slide = deferred();
    Object.defineProperty(panel, 'getAnimations', {
      configurable: true,
      value: () => [fakeAnimation(slide.promise)],
    });
    const release = holdEntranceInput(layer, {entrance: panel});
    expect(release).not.toBeNull();
    releases.push(release as () => void);
    expect(isInHeldLayer(layer)).toBe(true);
    expect(isInHeldLayer(panel)).toBe(false);

    slide.resolve();
    await flush();
    expect(isInHeldLayer(layer)).toBe(false);
  });

  it('ends the hold at `capMs` when the entrance runs longer, and not before', async () => {
    vi.useFakeTimers();
    try {
      const layer = mountLayer([fakeAnimation(new Promise(() => {}))]);
      const release = holdEntranceInput(layer, {capMs: 550});
      releases.push(release as () => void);
      vi.advanceTimersByTime(540);
      await flush();
      expect(isInHeldLayer(layer)).toBe(true);

      vi.advanceTimersByTime(20);
      await flush();
      expect(isInHeldLayer(layer)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('holds nothing when the entrance element is missing', () => {
    const layer = mountLayer([fakeAnimation(new Promise(() => {}))]);
    expect(holdEntranceInput(layer, {entrance: null})).toBeNull();
    expect(isInHeldLayer(layer)).toBe(false);
  });

  it('holds nothing when no entrance runs: none, finished, or endless', () => {
    const never = new Promise(() => {});
    for (const animations of [
      [],
      [fakeAnimation(Promise.resolve(), {playState: 'finished'})],
      [fakeAnimation(never, {endTime: Infinity})],
    ]) {
      const layer = mountLayer(animations);
      expect(hold(layer)).toBeNull();
      expect(isInHeldLayer(layer)).toBe(false);
    }
  });
});
