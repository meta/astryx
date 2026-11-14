// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file gestureCounter.test.ts
 * @input claimPress and claimContextMenuPress with a stubbed layer box,
 *   stubbed pointer capture, and a layer inside an open shadow root
 * @output The claim compares the pointer with the layer's box read once (no
 *   hit test or layout read per move), lets go over the layer, and ends when
 *   the layer closes while the button is still down. A primary press's claim
 *   ends at its release and runs once per press and layer. A release target
 *   holds the pointer while the pointer is over it, and no window listener
 *   stays after the press. The context-menu claim takes only a press that
 *   fired `contextmenu`. A claim runs its onRelease at its release, and no
 *   other. A claim ends when another control takes the pointer. A release
 *   is in flight from its pointerup to its click or the next task, and
 *   afterRelease runs once, at that click or that task. A press mark names
 *   a pointer press, survives another pointer's press for its own pointer,
 *   and is null for a keystroke
 * @position Unit test of packages/core/src/Layer/gestureCounter.ts
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  afterRelease,
  claimContextMenuPress,
  claimPress,
  currentGesture,
  isPressInFlight,
  isReleaseInFlight,
} from './gestureCounter';
import {armClickGuard, disarmClickGuard} from '../utils/clickGuard';

/** A touch pointer event of `type` for `pointerId`. */
function touchPointerEvent(type: string, pointerId: number): Event {
  const event = new Event(type, {bubbles: true});
  Object.defineProperty(event, 'pointerId', {value: pointerId});
  Object.defineProperty(event, 'pointerType', {value: 'touch'});
  return event;
}

/** The browser's click for a release: `detail` counts the clicks. */
function browserClick(target: Element): void {
  target.dispatchEvent(new MouseEvent('click', {bubbles: true, detail: 1}));
}

/** A pointer event of `type` for `pointerId`, which jsdom's events lack. */
function pointerEvent(
  type: string,
  pointerId: number,
  {button = 0, x = 0, y = 0} = {},
): Event {
  return Object.assign(
    new MouseEvent(type, {
      bubbles: true,
      composed: true,
      button,
      clientX: x,
      clientY: y,
    }),
    {pointerId},
  );
}

describe('claimContextMenuPress', () => {
  let captured: number[];
  let released: number[];
  let isCaptured: boolean;

  beforeEach(() => {
    captured = [];
    released = [];
    isCaptured = false;
    HTMLElement.prototype.setPointerCapture = (pointerId: number) => {
      captured.push(pointerId);
      isCaptured = true;
    };
    HTMLElement.prototype.hasPointerCapture = () => isCaptured;
    HTMLElement.prototype.releasePointerCapture = (pointerId: number) => {
      released.push(pointerId);
      isCaptured = false;
    };
  });

  afterEach(() => {
    document.dispatchEvent(pointerEvent('pointerup', 7));
    document.body.replaceChildren();
    vi.restoreAllMocks();
    delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture;
    delete (HTMLElement.prototype as Partial<HTMLElement>).hasPointerCapture;
    delete (HTMLElement.prototype as Partial<HTMLElement>)
      .releasePointerCapture;
  });

  /** Presses the right button on `zone` and claims the press for `layer`. */
  function openFromRightClick(zone: Element, layer: HTMLElement) {
    // Reading the gesture installs its listeners before the press.
    currentGesture();
    zone.dispatchEvent(pointerEvent('pointerdown', 7, {button: 2}));
    zone.dispatchEvent(
      new MouseEvent('contextmenu', {bubbles: true, composed: true}),
    );
    claimContextMenuPress(layer);
  }

  function stubLayerBox(layer: HTMLElement) {
    return vi.spyOn(layer, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      right: 200,
      top: 100,
      bottom: 200,
      width: 100,
      height: 100,
      x: 100,
      y: 100,
      toJSON() {
        return this;
      },
    });
  }

  it('keeps no pointerup listener at rest, only while a press is down', () => {
    const zone = document.createElement('div');
    document.body.append(zone);
    currentGesture();
    const added = vi.spyOn(window, 'addEventListener');
    const removed = vi.spyOn(window, 'removeEventListener');
    const types = (spy: typeof added | typeof removed) =>
      spy.mock.calls.map(([type]) => type);

    zone.dispatchEvent(pointerEvent('pointerdown', 9));
    expect(types(added)).toContain('pointerup');
    zone.dispatchEvent(pointerEvent('pointerup', 9));
    expect(types(removed)).toContain('pointerup');
  });

  it('lets go over the layer and holds outside it, reading the layer box once', () => {
    const zone = document.createElement('div');
    const layer = document.createElement('div');
    document.body.append(zone, layer);
    const box = stubLayerBox(layer);

    openFromRightClick(zone, layer);
    expect(captured).toEqual([7]);

    layer.dispatchEvent(pointerEvent('pointermove', 7, {x: 150, y: 150}));
    expect(released).toEqual([7]);
    zone.dispatchEvent(pointerEvent('pointermove', 7, {x: 20, y: 20}));
    expect(captured).toEqual([7, 7]);
    layer.dispatchEvent(pointerEvent('pointermove', 7, {x: 120, y: 180}));
    expect(released).toEqual([7, 7]);
    expect(box).toHaveBeenCalledTimes(1);
  });

  it('reads the layer box again after a scroll', () => {
    const zone = document.createElement('div');
    const layer = document.createElement('div');
    document.body.append(zone, layer);
    const box = stubLayerBox(layer);

    openFromRightClick(zone, layer);
    layer.dispatchEvent(pointerEvent('pointermove', 7, {x: 150, y: 150}));
    expect(box).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new Event('scroll'));
    layer.dispatchEvent(pointerEvent('pointermove', 7, {x: 150, y: 150}));
    expect(box).toHaveBeenCalledTimes(2);
  });

  it('works for a layer inside an open shadow root', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const shadow = host.attachShadow({mode: 'open'});
    const zone = document.createElement('div');
    const layer = document.createElement('div');
    shadow.append(zone, layer);
    stubLayerBox(layer);

    openFromRightClick(zone, layer);
    expect(captured).toEqual([7]);
    layer.dispatchEvent(pointerEvent('pointermove', 7, {x: 150, y: 150}));
    expect(released).toEqual([7]);
  });

  it('lets the pointer go when the layer closes while the button is still down', () => {
    const zone = document.createElement('div');
    const layer = document.createElement('div');
    document.body.append(zone, layer);
    stubLayerBox(layer);

    openFromRightClick(zone, layer);
    expect(captured).toEqual([7]);

    // Escape closes the layer before the release.
    layer.dispatchEvent(
      Object.assign(new Event('toggle'), {newState: 'closed'}),
    );
    expect(released).toEqual([7]);

    // The claim has ended: a later move outside captures nothing.
    zone.dispatchEvent(pointerEvent('pointermove', 7, {x: 20, y: 20}));
    expect(captured).toEqual([7]);
  });
});

describe('claimPress', () => {
  let captured: number[];
  let released: number[];

  beforeEach(() => {
    captured = [];
    released = [];
    HTMLElement.prototype.setPointerCapture = (pointerId: number) => {
      captured.push(pointerId);
    };
    HTMLElement.prototype.hasPointerCapture = () => true;
    HTMLElement.prototype.releasePointerCapture = (pointerId: number) => {
      released.push(pointerId);
    };
  });

  afterEach(() => {
    document.dispatchEvent(pointerEvent('pointerup', 7));
    document.body.replaceChildren();
    vi.restoreAllMocks();
    delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture;
    delete (HTMLElement.prototype as Partial<HTMLElement>).hasPointerCapture;
    delete (HTMLElement.prototype as Partial<HTMLElement>)
      .releasePointerCapture;
  });

  /** A trigger and a layer whose box spans 100 to 200 on both axes. */
  function mountLayer() {
    const trigger = document.createElement('button');
    const layer = document.createElement('div');
    document.body.append(trigger, layer);
    vi.spyOn(layer, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(100, 100, 100, 100),
    );
    // Reading the gesture installs its listeners before the press.
    currentGesture();
    return {trigger, layer};
  }

  it('captures a primary press outside the layer, lets go over it, and ends at the release', () => {
    const {trigger, layer} = mountLayer();
    trigger.dispatchEvent(pointerEvent('pointerdown', 7));
    expect(isPressInFlight()).toBe(true);
    claimPress(layer);
    expect(captured).toEqual([7]);

    layer.dispatchEvent(pointerEvent('pointermove', 7, {x: 150, y: 150}));
    expect(released).toEqual([7]);
    trigger.dispatchEvent(pointerEvent('pointermove', 7, {x: 20, y: 20}));
    expect(captured).toEqual([7, 7]);

    trigger.dispatchEvent(pointerEvent('pointerup', 7, {x: 20, y: 20}));
    expect(isPressInFlight()).toBe(false);
    // The claim ended with its press.
    trigger.dispatchEvent(pointerEvent('pointermove', 7, {x: 20, y: 20}));
    expect(captured).toEqual([7, 7]);
  });

  it('claims a press once for a layer', () => {
    const {trigger, layer} = mountLayer();
    trigger.dispatchEvent(pointerEvent('pointerdown', 7));
    claimPress(layer);
    claimPress(layer);
    expect(captured).toEqual([7]);
    // One claim follows the pointer, not two.
    trigger.dispatchEvent(pointerEvent('pointermove', 7, {x: 20, y: 20}));
    expect(captured).toEqual([7, 7]);
  });

  it('claims nothing when no press is down', () => {
    const {trigger, layer} = mountLayer();
    trigger.dispatchEvent(pointerEvent('pointerdown', 7));
    trigger.dispatchEvent(pointerEvent('pointerup', 7));
    claimPress(layer);
    expect(captured).toEqual([]);
  });

  it('gives the pointer to the release target over it, lets go over the layer, and gives it to the layer outside both', () => {
    const {trigger, layer} = mountLayer();
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 50, 20),
    );
    // One element holds the pointer at a time, as in a browser.
    let holder: Element | null = null;
    const holders: Element[] = [];
    const take = (element: Element) => {
      holder = element;
      holders.push(element);
    };
    const letGo = (element: Element) => {
      if (holder === element) {
        holder = null;
      }
    };
    HTMLElement.prototype.setPointerCapture = function (this: HTMLElement) {
      take(this);
    };
    HTMLElement.prototype.hasPointerCapture = function (this: HTMLElement) {
      return holder === this;
    };
    HTMLElement.prototype.releasePointerCapture = function (this: HTMLElement) {
      letGo(this);
    };
    trigger.dispatchEvent(pointerEvent('pointerdown', 7));
    claimPress(layer, {releaseTarget: trigger});
    // The press began on the release target, so it holds the pointer.
    expect(holders).toEqual([trigger]);

    layer.dispatchEvent(pointerEvent('pointermove', 7, {x: 150, y: 150}));
    expect(holder).toBeNull();
    document.body.dispatchEvent(
      pointerEvent('pointermove', 7, {x: 300, y: 300}),
    );
    expect(holder).toBe(layer);
    trigger.dispatchEvent(pointerEvent('pointermove', 7, {x: 10, y: 10}));
    expect(holder).toBe(trigger);
    expect(holders).toEqual([trigger, layer, trigger]);
  });

  it('leaves the window listening as before once its press ends', () => {
    const {trigger, layer} = mountLayer();
    // Spies that pass through: each add and remove still reaches the window.
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    trigger.dispatchEvent(pointerEvent('pointerdown', 7));
    claimPress(layer, {releaseTarget: trigger});
    trigger.dispatchEvent(pointerEvent('pointermove', 7, {x: 300, y: 300}));
    trigger.dispatchEvent(pointerEvent('pointerup', 7, {x: 300, y: 300}));
    const listening = new Map<string, number>();
    for (const [type] of add.mock.calls) {
      listening.set(type, (listening.get(type) ?? 0) + 1);
    }
    for (const [type] of remove.mock.calls) {
      listening.set(type, (listening.get(type) ?? 0) - 1);
    }
    // Every window listener the press and its claim added is gone.
    expect(add).toHaveBeenCalled();
    expect([...listening].filter(([, n]) => n !== 0)).toEqual([]);
  });

  it('runs onRelease at the release of a claim that is still held', () => {
    const {trigger, layer} = mountLayer();
    const onRelease = vi.fn();
    trigger.dispatchEvent(pointerEvent('pointerdown', 7));
    claimPress(layer, {onRelease});
    expect(onRelease).not.toHaveBeenCalled();
    trigger.dispatchEvent(pointerEvent('pointerup', 7));
    expect(onRelease).toHaveBeenCalledOnce();
  });

  it('runs no onRelease for a claim whose layer closed first, or a cancelled press', () => {
    const {trigger, layer} = mountLayer();
    const onRelease = vi.fn();
    trigger.dispatchEvent(pointerEvent('pointerdown', 7));
    claimPress(layer, {onRelease});
    layer.dispatchEvent(
      Object.assign(new Event('toggle'), {newState: 'closed'}),
    );
    trigger.dispatchEvent(pointerEvent('pointerup', 7));

    trigger.dispatchEvent(pointerEvent('pointerdown', 7));
    claimPress(layer, {onRelease});
    trigger.dispatchEvent(pointerEvent('pointercancel', 7));
    expect(onRelease).not.toHaveBeenCalled();
  });

  it('ends when another control takes the pointer, and then neither takes it back nor runs onRelease', () => {
    const {trigger, layer} = mountLayer();
    const row = document.createElement('div');
    document.body.append(row);
    const onRelease = vi.fn();
    trigger.dispatchEvent(pointerEvent('pointerdown', 7));
    claimPress(layer, {onRelease});
    expect(captured).toEqual([7]);
    row.dispatchEvent(pointerEvent('gotpointercapture', 7));
    row.dispatchEvent(pointerEvent('pointermove', 7, {x: 20, y: 20}));
    expect(captured).toEqual([7]);
    row.dispatchEvent(pointerEvent('pointerup', 7, {x: 20, y: 20}));
    expect(onRelease).not.toHaveBeenCalled();
  });

  it('keeps the claim when the layer itself takes the pointer', () => {
    const {trigger, layer} = mountLayer();
    const onRelease = vi.fn();
    trigger.dispatchEvent(pointerEvent('pointerdown', 7));
    claimPress(layer, {onRelease});
    layer.dispatchEvent(pointerEvent('gotpointercapture', 7));
    trigger.dispatchEvent(pointerEvent('pointerup', 7));
    expect(onRelease).toHaveBeenCalledOnce();
  });

  it('claims a press for the context menu only once that press fired contextmenu', () => {
    const {trigger, layer} = mountLayer();
    trigger.dispatchEvent(pointerEvent('pointerdown', 7));
    claimContextMenuPress(layer);
    expect(captured).toEqual([]);
    trigger.dispatchEvent(
      new MouseEvent('contextmenu', {bubbles: true, composed: true}),
    );
    claimContextMenuPress(layer);
    expect(captured).toEqual([7]);
  });
});

describe('the release in flight and afterRelease', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  /** A press on a fresh button: down, then up, as the window sees them. */
  function press(pointerId = 3) {
    const button = document.createElement('button');
    document.body.append(button);
    currentGesture();
    button.dispatchEvent(pointerEvent('pointerdown', pointerId));
    return {
      button,
      release: () => button.dispatchEvent(pointerEvent('pointerup', pointerId)),
    };
  }

  it('is in flight from the release until its click', () => {
    const {button, release} = press();
    expect(isReleaseInFlight()).toBe(false);
    let duringRelease = false;
    button.addEventListener('pointerup', () => {
      duringRelease = isReleaseInFlight();
    });
    release();
    expect(duringRelease).toBe(true);
    browserClick(button);
    expect(isReleaseInFlight()).toBe(false);
  });

  it('stays in flight through a click the page dispatches inside the release', () => {
    const {button, release} = press();
    let afterDispatch = false;
    button.addEventListener('pointerup', () => {
      // A menu row's activation: a dispatched click, `detail` 0.
      button.click();
      afterDispatch = isReleaseInFlight();
    });
    release();
    expect(afterDispatch).toBe(true);
    browserClick(button);
    expect(isReleaseInFlight()).toBe(false);
  });

  it('ends at a click the page dispatches after the release', () => {
    const {button, release} = press();
    release();
    expect(isReleaseInFlight()).toBe(true);
    // A dispatched click in a later task, as a test or an app sends one.
    button.click();
    expect(isReleaseInFlight()).toBe(false);
  });

  it('ends at the next task when no click comes', () => {
    vi.useFakeTimers();
    const {release} = press();
    release();
    expect(isReleaseInFlight()).toBe(true);
    vi.runOnlyPendingTimers();
    expect(isReleaseInFlight()).toBe(false);
  });

  it('runs afterRelease once, at the click, and not again at the next task', () => {
    vi.useFakeTimers();
    const {button, release} = press();
    const callback = vi.fn();
    button.addEventListener('pointerup', () => {
      afterRelease(document, callback);
    });
    release();
    expect(callback).not.toHaveBeenCalled();
    browserClick(button);
    expect(callback).toHaveBeenCalledTimes(1);
    vi.runOnlyPendingTimers();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('ends the release at its click before afterRelease runs, so a show it asks for is not held again', () => {
    const {button, release} = press();
    let inFlightInCallback: boolean | null = null;
    button.addEventListener('pointerup', () => {
      afterRelease(document, () => {
        inFlightInCallback = isReleaseInFlight();
      });
    });
    release();
    browserClick(button);
    expect(inFlightInCallback).toBe(false);
  });

  it('holds no touch release whose touchend the click guard cancels', () => {
    const button = document.createElement('button');
    document.body.append(button);
    currentGesture();
    button.dispatchEvent(touchPointerEvent('pointerdown', 9));
    button.addEventListener(
      'pointerup',
      () => armClickGuard(document, {cancelsTouchEnd: true}),
      {once: true},
    );
    let inFlight: boolean | null = null;
    button.addEventListener(
      'pointerup',
      () => {
        inFlight = isReleaseInFlight();
      },
      {once: true},
    );
    button.dispatchEvent(touchPointerEvent('pointerup', 9));
    expect(inFlight).toBe(false);
    disarmClickGuard(document);
  });

  it('holds a touch release after a stale mark from an earlier press', () => {
    const button = document.createElement('button');
    document.body.append(button);
    currentGesture();
    // An earlier touch armed the guard, and its touchend never came.
    button.dispatchEvent(touchPointerEvent('pointerdown', 11));
    button.addEventListener(
      'pointerup',
      () => armClickGuard(document, {cancelsTouchEnd: true}),
      {once: true},
    );
    button.dispatchEvent(touchPointerEvent('pointerup', 11));
    // The next press clears the mark; its release is held.
    button.dispatchEvent(touchPointerEvent('pointerdown', 12));
    let inFlight: boolean | null = null;
    button.addEventListener(
      'pointerup',
      () => {
        inFlight = isReleaseInFlight();
      },
      {once: true},
    );
    button.dispatchEvent(touchPointerEvent('pointerup', 12));
    expect(inFlight).toBe(true);
    disarmClickGuard(document);
  });

  it('reads a mark that a second copy of Core writes', async () => {
    vi.resetModules();
    const secondCopy = await import('../utils/touchEndMark');
    const button = document.createElement('button');
    document.body.append(button);
    currentGesture();
    button.dispatchEvent(touchPointerEvent('pointerdown', 13));
    button.addEventListener(
      'pointerup',
      () => secondCopy.markTouchEndCancelled(),
      {once: true},
    );
    let inFlight: boolean | null = null;
    button.addEventListener(
      'pointerup',
      () => {
        inFlight = isReleaseInFlight();
      },
      {once: true},
    );
    button.dispatchEvent(touchPointerEvent('pointerup', 13));
    expect(inFlight).toBe(false);
  });

  it('holds a touch release that the click guard does not cancel', () => {
    const button = document.createElement('button');
    document.body.append(button);
    currentGesture();
    button.dispatchEvent(touchPointerEvent('pointerdown', 10));
    let inFlight: boolean | null = null;
    button.addEventListener(
      'pointerup',
      () => {
        inFlight = isReleaseInFlight();
      },
      {once: true},
    );
    button.dispatchEvent(touchPointerEvent('pointerup', 10));
    expect(inFlight).toBe(true);
  });

  it('runs afterRelease once at the next task when no click comes', () => {
    vi.useFakeTimers();
    const {button, release} = press();
    const callback = vi.fn();
    button.addEventListener('pointerup', () => {
      afterRelease(document, callback);
    });
    release();
    vi.runOnlyPendingTimers();
    expect(callback).toHaveBeenCalledTimes(1);
    browserClick(button);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('runs nothing once cancelled', () => {
    vi.useFakeTimers();
    const {button, release} = press();
    const callback = vi.fn();
    let cancel = () => {};
    button.addEventListener('pointerup', () => {
      cancel = afterRelease(document, callback);
    });
    release();
    cancel();
    browserClick(button);
    vi.runOnlyPendingTimers();
    expect(callback).not.toHaveBeenCalled();
  });
});
