// Copyright (c) Meta Platforms, Inc. and affiliates.

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from 'vitest';
import {GestureHost} from '../gestures/GestureHost';
import {subscribeInput} from '../utils/inputStream';
import {
  holdInput,
  holdsTouch,
  isInHeldLayer,
  isInputShield,
  type InputHoldScope,
} from './inputHold';
import {markModalOutletHost, subscribeModalOutlets} from './modalOutlet';

function deferred() {
  let resolve: () => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
}

/** A layer root with a child, in the document. */
function mountLayer(): {layer: HTMLElement; child: HTMLElement} {
  const layer = document.createElement('div');
  const child = document.createElement('button');
  layer.append(child);
  document.body.append(layer);
  return {layer, child};
}

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

/**
 * What a listener throws during a case: jsdom reports it as an `error` event
 * on the window and goes on dispatching, so a hold whose listener throws
 * would otherwise pass. None is expected.
 */
const listenerErrors: unknown[] = [];
window.addEventListener('error', event => {
  listenerErrors.push(event.error);
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  expect(listenerErrors.splice(0)).toEqual([]);
});

describe('holdInput', () => {
  it('holds a presenting layer with a shield over the viewport until its end settles', async () => {
    const {layer, child} = mountLayer();
    const outside = document.createElement('div');
    document.body.append(outside);
    const end = deferred();
    holdInput(layer, {until: end.promise, scope: 'viewport'});
    const shield = layer.lastElementChild as HTMLElement;
    expect(shield).not.toBe(child);
    expect(shield.getAttribute('popover')).toBe('manual');
    expect(shield.style.position).toBe('fixed');
    // No pan, and a pinch still zooms the page (spec:AST-094 FR10).
    expect(shield.style.touchAction).toBe('pinch-zoom');
    // Its own hit-testing, whatever the layer root's (the browser proof holds
    // a root that is pointer-events: none).
    expect(shield.style.pointerEvents).toBe('auto');
    expect(shield.style.visibility).toBe('visible');
    expect(isInHeldLayer(child)).toBe(true);
    expect(isInHeldLayer(shield)).toBe(true);
    expect(isInHeldLayer(outside)).toBe(false);
    // Keys and assistive technology stay live while presenting.
    expect(layer.hasAttribute('inert')).toBe(false);
    end.resolve();
    await flush();
    expect(shield.isConnected).toBe(false);
    expect(isInHeldLayer(child)).toBe(false);
  });

  it('swallows a press and a click on the shield before they reach the page, and leaves a touch its start so a pinch can still zoom', () => {
    const {layer} = mountLayer();
    holdInput(layer, {until: new Promise(() => {}), scope: 'viewport'});
    const shield = layer.lastElementChild as HTMLElement;
    const seen: string[] = [];
    for (const type of ['pointerdown', 'click', 'touchstart']) {
      document.addEventListener(type, () => seen.push(type));
    }
    const press = new Event('pointerdown', {bubbles: true, cancelable: true});
    const click = new MouseEvent('click', {bubbles: true, cancelable: true});
    const touch = new Event('touchstart', {bubbles: true, cancelable: true});
    // A touch event carries its touch lists.
    Object.defineProperty(touch, 'changedTouches', {value: [{identifier: 0}]});
    Object.defineProperty(touch, 'touches', {value: [{identifier: 0}]});
    shield.dispatchEvent(press);
    shield.dispatchEvent(click);
    shield.dispatchEvent(touch);
    // A touch that starts also ends.
    const touchEnd = new Event('touchend', {bubbles: true, cancelable: true});
    Object.defineProperty(touchEnd, 'changedTouches', {
      value: [{identifier: 0}],
    });
    Object.defineProperty(touchEnd, 'touches', {value: []});
    shield.dispatchEvent(touchEnd);
    expect(seen).toEqual([]);
    expect(press.defaultPrevented).toBe(true);
    expect(click.defaultPrevented).toBe(true);
    // Cancelling a touch's start would cancel the page's pinch-zoom too.
    expect(touch.defaultPrevented).toBe(false);
  });

  it("holds only a non-modal layer's own box with a 'surface' hold: its shield covers the layer, not the viewport (spec:AST-094 FR35)", async () => {
    const {layer, child} = mountLayer();
    const outside = document.createElement('div');
    document.body.append(outside);
    const end = deferred();
    holdInput(layer, {until: end.promise, scope: 'surface'});
    const shield = layer.lastElementChild as HTMLElement;
    expect(shield).not.toBe(child);
    // Inside the layer's box, not over the viewport from the top layer.
    expect(shield.hasAttribute('popover')).toBe(false);
    expect(shield.style.position).toBe('absolute');
    expect(shield.style.inset).toBe('0');
    expect(shield.style.touchAction).toBe('pinch-zoom');
    expect(shield.style.pointerEvents).toBe('auto');
    expect(isInputShield(shield)).toBe(true);
    expect(isInHeldLayer(child)).toBe(true);
    expect(isInHeldLayer(outside)).toBe(false);
    expect(layer.hasAttribute('inert')).toBe(false);
    end.resolve();
    await flush();
    expect(shield.isConnected).toBe(false);
  });

  it("holds a dismissing layer: its content inert, the layer itself live under the shield, each element's inert given back", async () => {
    const {layer, child} = mountLayer();
    const already = document.createElement('div');
    already.setAttribute('inert', '');
    layer.append(already);
    child.focus();
    expect(document.activeElement).toBe(child);
    const end = deferred();
    holdInput(layer, {until: end.promise, scope: 'layer'});
    // Focus leaves the content: a focused element that turns inert would
    // keep its key activation.
    expect(document.activeElement).not.toBe(child);
    const shield = layer.lastElementChild as HTMLElement;
    expect(shield.getAttribute('popover')).toBe('manual');
    // The layer stays live so the shield inside it catches every hit: an
    // inert subtree is no hit target.
    expect(layer.hasAttribute('inert')).toBe(false);
    expect(shield.hasAttribute('inert')).toBe(false);
    expect(child.hasAttribute('inert')).toBe(true);
    expect(isInHeldLayer(child)).toBe(true);
    end.reject(new Error('interrupted'));
    await flush();
    expect(child.hasAttribute('inert')).toBe(false);
    expect(already.hasAttribute('inert')).toBe(true);
    expect(shield.isConnected).toBe(false);
    expect(isInHeldLayer(child)).toBe(false);
  });

  it('leaves a live region with nothing focusable in a dismissing layer live: it takes no input, and inert would drop its words (spec:AST-086 FR2)', async () => {
    const {layer, child} = mountLayer();
    const polite = document.createElement('div');
    polite.setAttribute('aria-live', 'polite');
    const status = document.createElement('div');
    status.setAttribute('role', 'status');
    const off = document.createElement('div');
    off.setAttribute('role', 'status');
    off.setAttribute('aria-live', 'off');
    layer.append(polite, status, off);
    const end = deferred();
    holdInput(layer, {until: end.promise, scope: 'layer'});
    expect(child.hasAttribute('inert')).toBe(true);
    expect(polite.hasAttribute('inert')).toBe(false);
    expect(status.hasAttribute('inert')).toBe(false);
    expect(off.hasAttribute('inert')).toBe(true);
    end.resolve();
    await flush();
    expect(off.hasAttribute('inert')).toBe(false);
  });

  it('keeps a live region that holds something focusable in a dismissing layer inert, so the hold still keeps input away from it', async () => {
    const {layer} = mountLayer();
    const region = document.createElement('div');
    region.setAttribute('role', 'status');
    const button = document.createElement('button');
    region.append(button);
    const tabStop = document.createElement('div');
    tabStop.setAttribute('aria-live', 'assertive');
    tabStop.tabIndex = 0;
    layer.append(region, tabStop);
    const end = deferred();
    holdInput(layer, {until: end.promise, scope: 'layer'});
    expect(region.hasAttribute('inert')).toBe(true);
    expect(tabStop.hasAttribute('inert')).toBe(true);
    end.resolve();
    await flush();
    expect(region.hasAttribute('inert')).toBe(false);
  });

  it('leaves a global host in a dismissing layer live, and puts it back above the shield (spec:AST-003 FR16)', async () => {
    const {layer, child} = mountLayer();
    const host = document.createElement('div');
    layer.append(host);
    const unmark = markModalOutletHost(host);
    // The last child of the layer when the hosts are told to re-enter.
    let lastAtEntry: Element | null = null;
    const unsubscribe = subscribeModalOutlets(change => {
      if (change === 'entry') {
        lastAtEntry = layer.lastElementChild;
      }
    });
    const end = deferred();
    holdInput(layer, {until: end.promise, scope: 'layer'});
    const shield = layer.lastElementChild as HTMLElement;
    expect(isInputShield(shield)).toBe(true);
    expect(child.hasAttribute('inert')).toBe(true);
    expect(host.hasAttribute('inert')).toBe(false);
    // The hosts re-enter the top layer after the shield went up, so they
    // paint above it.
    expect(lastAtEntry).toBe(shield);
    end.resolve();
    await flush();
    expect(child.hasAttribute('inert')).toBe(false);
    expect(host.hasAttribute('inert')).toBe(false);
    unsubscribe();
    unmark();
  });

  it('leaves a global host deeper in a dismissing layer live with the elements around it, whose other children go inert', async () => {
    const {layer, child} = mountLayer();
    // The host sits two levels down, beside other content at each level.
    const outer = document.createElement('div');
    const outerSibling = document.createElement('button');
    const inner = document.createElement('div');
    const innerSibling = document.createElement('button');
    const host = document.createElement('div');
    inner.append(innerSibling, host);
    outer.append(outerSibling, inner);
    layer.append(outer);
    const unmark = markModalOutletHost(host);
    const end = deferred();
    holdInput(layer, {until: end.promise, scope: 'layer'});
    expect(child.hasAttribute('inert')).toBe(true);
    expect(outerSibling.hasAttribute('inert')).toBe(true);
    expect(innerSibling.hasAttribute('inert')).toBe(true);
    for (const live of [outer, inner, host]) {
      expect(live.closest('[inert]')).toBeNull();
    }
    end.resolve();
    await flush();
    expect(layer.querySelector('[inert]')).toBeNull();
    unmark();
  });

  it('names a live hold’s shield, and only it, so a hit test can skip it', () => {
    const {layer, child} = mountLayer();
    const popover = document.createElement('div');
    popover.setAttribute('popover', 'manual');
    document.body.append(popover);
    const release = holdInput(layer, {
      until: new Promise(() => {}),
      scope: 'viewport',
    });
    const shield = layer.lastElementChild as HTMLElement;
    expect(isInputShield(shield)).toBe(true);
    for (const other of [layer, child, popover, null]) {
      expect(isInputShield(other)).toBe(false);
    }
    release();
    expect(isInputShield(shield)).toBe(false);
  });

  it('sees slotted content as held: the flat tree, a slotted node to its slot', () => {
    const host = document.createElement('div');
    const slotted = document.createElement('button');
    host.append(slotted);
    document.body.append(host);
    const root = host.attachShadow({mode: 'open'});
    const layer = document.createElement('div');
    layer.append(document.createElement('slot'));
    root.append(layer);
    expect(isInHeldLayer(slotted)).toBe(false);
    const release = holdInput(layer, {
      until: new Promise(() => {}),
      scope: 'viewport',
    });
    expect(isInHeldLayer(slotted)).toBe(true);
    release();
    expect(isInHeldLayer(slotted)).toBe(false);
  });

  it('takes an animator handle, ending with its finished', async () => {
    const {layer, child} = mountLayer();
    const end = deferred();
    holdInput(layer, {until: {finished: end.promise}, scope: 'layer'});
    expect(isInHeldLayer(child)).toBe(true);
    end.resolve();
    await flush();
    expect(isInHeldLayer(child)).toBe(false);
  });

  it('stacks holds on one layer, either scope, under one shield: it comes back when the last one ends', () => {
    const {layer, child} = mountLayer();
    const first = holdInput(layer, {
      until: new Promise(() => {}),
      scope: 'viewport',
    });
    const second = holdInput(layer, {
      until: new Promise(() => {}),
      scope: 'layer',
    });
    expect(layer.querySelectorAll('[popover]')).toHaveLength(1);
    expect(child.hasAttribute('inert')).toBe(true);
    first();
    first();
    expect(isInHeldLayer(child)).toBe(true);
    expect(layer.querySelectorAll('[popover]')).toHaveLength(1);
    second();
    expect(isInHeldLayer(child)).toBe(false);
    expect(child.hasAttribute('inert')).toBe(false);
    expect(layer.querySelectorAll('[popover]')).toHaveLength(0);
  });

  it('registers nothing with the gesture host: the host asks holdsTouch for each touch', () => {
    const addTouchGate = vi.spyOn(GestureHost.prototype, 'addTouchGate');
    const {layer, child} = mountLayer();
    const releaseLayer = holdInput(layer, {
      until: new Promise(() => {}),
      scope: 'layer',
    });
    const release = holdInput(layer, {
      until: new Promise(() => {}),
      scope: 'viewport',
    });
    expect(addTouchGate).not.toHaveBeenCalled();
    expect(isInHeldLayer(child)).toBe(true);
    expect(holdsTouch(child)).toBe(true);
    expect(holdsTouch(document.body)).toBe(false);
    release();
    releaseLayer();
    expect(isInHeldLayer(child)).toBe(false);
    expect(holdsTouch(child)).toBe(false);
  });
});

describe("holdInput decides by each event's pointer (spec:AST-094 FR35)", () => {
  const INIT = {bubbles: true, cancelable: true, composed: true};

  /** The holds a case starts, released after it: a hold listens on the window. */
  const releases: (() => void)[] = [];
  const hold = (layer: Element, scope: InputHoldScope = 'viewport') => {
    const release = holdInput(layer, {until: new Promise(() => {}), scope});
    releases.push(release);
    return release;
  };

  /** Makes `type` the stream's last pointer, as a page's earlier input does. */
  function lastPointerWas(type: string) {
    const stop = subscribeInput(window, 'pointermove', () => {});
    pointer(document.body, 'pointermove', type);
    stop();
  }

  // Each case starts as after a finger: no earlier case's mouse lowers its
  // shield.
  beforeEach(() => {
    lastPointerWas('touch');
  });

  afterEach(() => {
    for (const release of releases.splice(0)) {
      release();
    }
    // A new press ends a released hold's click window (the held press's
    // click can no longer come), so its subscriptions end before the next
    // case rather than lingering into it.
    pointer(document.body, 'pointerdown', 'mouse');
    pointer(document.body, 'pointerup', 'mouse');
  });

  /** A button that records every event that reaches it. */
  function recorder(parent: Element = document.body) {
    const button = document.createElement('button');
    parent.append(button);
    const reached: string[] = [];
    for (const type of [
      'pointerdown',
      'pointermove',
      'pointerup',
      'touchstart',
      'touchmove',
      'touchend',
      'mousedown',
      'mouseup',
      'click',
      'contextmenu',
    ]) {
      button.addEventListener(type, () => reached.push(type));
    }
    return {button, reached};
  }

  function pointer(
    element: Element,
    type: string,
    pointerType: string,
    pointerId = 1,
    buttons = 0,
  ): Event {
    const event = new PointerEvent(type, {
      ...INIT,
      pointerId,
      pointerType,
      buttons,
    });
    element.dispatchEvent(event);
    return event;
  }

  /** A click as a browser sends it: a pointer event naming its pointer. */
  function click(element: Element, pointerType: string, detail = 1): Event {
    const event = new PointerEvent('click', {...INIT, pointerType, detail});
    element.dispatchEvent(event);
    return event;
  }

  /** A compatibility mouse event, or a click sent as a plain mouse event. */
  function mouse(element: Element, type: string, detail = 1): Event {
    const event = new MouseEvent(type, {...INIT, detail});
    element.dispatchEvent(event);
    return event;
  }

  function touch(
    element: Element,
    type: string,
    identifiers: number[],
    down: number = identifiers.length,
  ): Event {
    const event = new Event(type, INIT);
    const list = identifiers.map(identifier => ({identifier, target: element}));
    Object.defineProperty(event, 'changedTouches', {value: list});
    Object.defineProperty(event, 'touches', {
      value: Array.from({length: down}, (_, identifier) => ({identifier})),
    });
    element.dispatchEvent(event);
    return event;
  }

  /** A finger's or a pen's tap: down, up, then the browser's click. */
  function tap(element: Element, pointerType: 'touch' | 'pen', pointerId = 1) {
    pointer(element, 'pointerdown', pointerType, pointerId);
    pointer(element, 'pointerup', pointerType, pointerId);
    click(element, pointerType);
  }

  it("keeps a held press from the input stream's other subscribers, so press feedback and the gesture host never hear it", () => {
    const {layer} = mountLayer();
    const heard: string[] = [];
    // Subscribed before the hold, as press feedback is on a page with a
    // pressable.
    const stops = (['pointerdown', 'pointerup'] as const).map(type =>
      subscribeInput(window, type, event => {
        heard.push(`${type}:${event.pointerType}`);
      }),
    );
    hold(layer);
    pointer(document.body, 'pointerdown', 'touch', 7);
    pointer(document.body, 'pointerup', 'touch', 7);
    expect(heard).toEqual([]);
    // A mouse's press is not held: the other subscribers hear it.
    pointer(document.body, 'pointerdown', 'mouse', 8);
    pointer(document.body, 'pointerup', 'mouse', 8);
    expect(heard).toEqual(['pointerdown:mouse', 'pointerup:mouse']);
    for (const stop of stops) {
      stop();
    }
  });
  it("holds a finger's press anywhere in the page, with its moves, release and click, whatever the primary pointer", () => {
    const {layer} = mountLayer();
    const {button, reached} = recorder();
    hold(layer);
    const down = pointer(button, 'pointerdown', 'touch');
    pointer(button, 'pointermove', 'touch');
    pointer(button, 'pointerup', 'touch');
    click(button, 'touch');
    // Canceled: the browser sends no compatibility mouse events for it, and
    // no focus move.
    expect(down.defaultPrevented).toBe(true);
    expect(reached).toEqual([]);
  });

  it("holds a finger's press on a layer under a 'surface' hold and leaves one on the page alone, with its moves, release and click (spec:AST-094 FR35)", () => {
    const {layer} = mountLayer();
    const onLayer = recorder(layer);
    const onPage = recorder();
    hold(layer, 'surface');
    // On the page: the page stays live.
    const down = pointer(onPage.button, 'pointerdown', 'touch', 1);
    pointer(onPage.button, 'pointermove', 'touch', 1);
    pointer(onPage.button, 'pointerup', 'touch', 1);
    click(onPage.button, 'touch');
    expect(down.defaultPrevented).toBe(false);
    expect(onPage.reached).toEqual([
      'pointerdown',
      'pointermove',
      'pointerup',
      'click',
    ]);
    const start = touch(onPage.button, 'touchstart', [7]);
    const move = touch(onPage.button, 'touchmove', [7]);
    touch(onPage.button, 'touchend', [7], 0);
    expect(move.defaultPrevented).toBe(false);
    expect(start.defaultPrevented).toBe(false);
    expect(onPage.reached.slice(-3)).toEqual([
      'touchstart',
      'touchmove',
      'touchend',
    ]);
    expect(holdsTouch(onPage.button)).toBe(false);
    // On the layer: held, as under a presentation's hold.
    tap(onLayer.button, 'touch', 2);
    expect(onLayer.reached).toEqual([]);
    expect(holdsTouch(onLayer.button)).toBe(true);
  });

  it("leaves a finger's press on a global host in a dismissing layer alone, and holds it under a presentation", () => {
    const {layer} = mountLayer();
    const host = document.createElement('div');
    layer.append(host);
    const unmark = markModalOutletHost(host);
    const onHost = recorder(host);
    const onLayer = recorder(layer);
    hold(layer, 'layer');
    // A toast in the leaving layer takes the tap.
    tap(onHost.button, 'touch', 3);
    expect(onHost.reached).toEqual(['pointerdown', 'pointerup', 'click']);
    expect(holdsTouch(onHost.button)).toBe(false);
    // The layer's own content stays held.
    tap(onLayer.button, 'touch', 4);
    expect(onLayer.reached).toEqual([]);
    expect(holdsTouch(onLayer.button)).toBe(true);
    // A presentation's hold still holds a press anywhere.
    hold(layer, 'viewport');
    tap(onHost.button, 'touch', 5);
    expect(onHost.reached).toEqual(['pointerdown', 'pointerup', 'click']);
    expect(holdsTouch(onHost.button)).toBe(true);
    unmark();
  });

  it("leaves a finger's press on a global host in a dismissing layer alone in a same-origin iframe too", () => {
    // A same-origin iframe's document, as a component rendered into another
    // window's document has: its nodes and events belong to that window.
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const doc = frame.contentDocument as Document;
    const view = doc.defaultView as Window & typeof globalThis;
    const layer = doc.createElement('div');
    const host = doc.createElement('div');
    const onHost = doc.createElement('button');
    const onLayer = doc.createElement('button');
    host.append(onHost);
    layer.append(host, onLayer);
    doc.body.append(layer);
    // Another realm: this window's classes do not match the iframe's nodes.
    expect(onHost instanceof Element).toBe(false);
    const reached: string[] = [];
    for (const type of ['pointerdown', 'pointerup', 'click']) {
      onHost.addEventListener(type, () => reached.push(type));
    }
    const send = (target: Element, type: string, pointerType: string) =>
      target.dispatchEvent(
        new view.PointerEvent(type, {
          ...INIT,
          pointerId: 7,
          pointerType,
        }),
      );
    const unmark = markModalOutletHost(host);
    const release = holdInput(layer, {
      until: new Promise(() => {}),
      scope: 'layer',
    });
    // A toast in the leaving layer takes the tap.
    send(onHost, 'pointerdown', 'touch');
    send(onHost, 'pointerup', 'touch');
    send(onHost, 'click', 'touch');
    expect(reached).toEqual(['pointerdown', 'pointerup', 'click']);
    expect(holdsTouch(onHost)).toBe(false);
    // The layer's own content stays held.
    expect(holdsTouch(onLayer)).toBe(true);
    release();
    unmark();
    // A new press ends the released hold's click window in that document.
    send(doc.body, 'pointerdown', 'mouse');
    send(doc.body, 'pointerup', 'mouse');
  });

  it("holds a pen's press as a finger's", () => {
    const {layer} = mountLayer();
    const {button, reached} = recorder(layer);
    hold(layer);
    tap(button, 'pen');
    expect(reached).toEqual([]);
  });

  it("leaves a mouse's press and click alone during a presentation, a click sent as a plain mouse event included", () => {
    const {layer} = mountLayer();
    const {button, reached} = recorder(layer);
    hold(layer);
    const down = pointer(button, 'pointerdown', 'mouse');
    mouse(button, 'mousedown');
    pointer(button, 'pointerup', 'mouse');
    mouse(button, 'mouseup');
    click(button, 'mouse');
    mouse(button, 'click');
    expect(down.defaultPrevented).toBe(false);
    expect(reached).toEqual([
      'pointerdown',
      'mousedown',
      'pointerup',
      'mouseup',
      'click',
      'click',
    ]);
  });

  it("lets a mouse through a presentation's shield once it moves, takes hits again at a finger's press, and keeps a dismissal's shield taking every hit", () => {
    const {layer} = mountLayer();
    const {button} = recorder(layer);
    hold(layer);
    const shield = layer.lastElementChild as HTMLElement;
    expect(shield.style.pointerEvents).toBe('auto');
    // A mouse or a trackpad moving on a touch screen: what it points at is
    // hit, as with no hold.
    pointer(document.body, 'pointermove', 'mouse');
    expect(shield.style.pointerEvents).toBe('none');
    // A finger: the shield is the hit target again for the next one.
    pointer(button, 'pointerdown', 'touch', 2);
    expect(shield.style.pointerEvents).toBe('auto');
    pointer(button, 'pointerup', 'touch', 2);
    // A dismissal's content is inert: a mouse would fall through it to the
    // page, so its shield keeps every hit.
    hold(layer, 'layer');
    pointer(document.body, 'pointermove', 'mouse');
    expect(shield.style.pointerEvents).toBe('auto');
  });

  it("starts a presentation's shield lowered when the stream last heard a mouse: a press where the mouse rests reaches the layer (spec:AST-094 FR35)", () => {
    const {layer, child} = mountLayer();
    const {button, reached} = recorder(layer);
    // Press feedback hears the page's pointer moves through the stream on any
    // page with a pressable; the mouse moved last, before the layer opened.
    const stop = subscribeInput(window, 'pointermove', () => {});
    pointer(document.body, 'pointermove', 'mouse');
    stop();
    hold(layer);
    const shield = layer.lastElementChild as HTMLElement;
    expect(isInputShield(shield)).toBe(true);
    expect(shield.style.pointerEvents).toBe('none');
    expect(holdsTouch(child)).toBe(false);
    // A key opened the layer; the resting mouse presses without moving.
    pointer(button, 'pointerdown', 'mouse', 1, 1);
    pointer(button, 'pointerup', 'mouse');
    click(button, 'mouse');
    expect(reached).toEqual(['pointerdown', 'pointerup', 'click']);
    // A dismissal's shield still takes every hit.
    hold(layer, 'layer');
    expect(shield.style.pointerEvents).toBe('auto');
  });

  /** A mouse comes to rest at (x, y), heard as press feedback hears it. */
  function mouseRestsAt(x: number, y: number) {
    const stop = subscribeInput(window, 'pointermove', () => {});
    document.body.dispatchEvent(
      new PointerEvent('pointermove', {
        ...INIT,
        pointerType: 'mouse',
        clientX: x,
        clientY: y,
      }),
    );
    stop();
  }

  /** The clip-path that leaves a 4 px square open around (x, y). */
  const openingAt = (x: number, y: number) =>
    `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 ${y - 2}px, ${x - 2}px ${y - 2}px, ${x - 2}px ${y + 2}px, ${x + 2}px ${y + 2}px, ${x + 2}px ${y - 2}px, 0 ${y - 2}px)`;

  it("leaves the point where the mouse rests open on a presentation's shield that a finger raised: a still mouse's press reaches what is under it, a finger's press is still held, and a dismissal's shield stays whole (spec:AST-094 FR35)", () => {
    const {layer} = mountLayer();
    const {button, reached} = recorder(layer);
    mouseRestsAt(120, 80);
    // A finger opened the layer: it is the stream's last pointer.
    lastPointerWas('touch');
    hold(layer);
    const shield = layer.lastElementChild as HTMLElement;
    expect(shield.style.pointerEvents).toBe('auto');
    expect(shield.style.getPropertyValue('clip-path')).toBe(openingAt(120, 80));
    // A finger's or a pen's press is held wherever it lands, there too.
    pointer(button, 'pointerdown', 'touch', 2);
    pointer(button, 'pointerup', 'touch', 2);
    click(button, 'touch');
    pointer(button, 'pointerdown', 'pen', 4);
    pointer(button, 'pointerup', 'pen', 4);
    click(button, 'pen');
    expect(reached).toEqual([]);
    expect(shield.style.getPropertyValue('clip-path')).toBe(openingAt(120, 80));
    // The still mouse's press, which the browser hit-tests through the opening.
    pointer(button, 'pointerdown', 'mouse', 1, 1);
    pointer(button, 'pointerup', 'mouse');
    click(button, 'mouse');
    expect(reached).toEqual(['pointerdown', 'pointerup', 'click']);
    // A moving mouse lowers the shield, and the opening goes with it.
    mouseRestsAt(130, 90);
    expect(shield.style.pointerEvents).toBe('none');
    expect(shield.style.getPropertyValue('clip-path')).toBe('');
    // A finger raises it again, open where the mouse now rests.
    pointer(button, 'pointerdown', 'touch', 3);
    expect(shield.style.pointerEvents).toBe('auto');
    expect(shield.style.getPropertyValue('clip-path')).toBe(openingAt(130, 90));
    pointer(button, 'pointerup', 'touch', 3);
    // A dismissal's shield takes every hit, a mouse's included.
    hold(layer, 'layer');
    expect(shield.style.pointerEvents).toBe('auto');
    expect(shield.style.getPropertyValue('clip-path')).toBe('');
  });

  /** The part of a clip-path that leaves a 4 px square open around (x, y). */
  const holeAt = (x: number, y: number) =>
    `0 ${y - 2}px, ${x - 2}px ${y - 2}px, ${x - 2}px ${y + 2}px, ${x + 2}px ${y + 2}px, ${x + 2}px ${y - 2}px, 0 ${y - 2}px`;

  it("leaves a presentation's shield open where a finger or pen went down before it came up, follows that press, and closes the opening when it lifts", () => {
    const {layer} = mountLayer();
    const outside = document.createElement('button');
    document.body.append(outside);
    const stops = (
      ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'] as const
    ).map(type => subscribeInput(window, type, () => {}));
    const press = (
      type: string,
      pointerType: string,
      id: number,
      x: number,
      y: number,
    ) =>
      outside.dispatchEvent(
        new PointerEvent(type, {
          ...INIT,
          pointerId: id,
          pointerType,
          clientX: x,
          clientY: y,
        }),
      );
    press('pointerdown', 'touch', 61, 20, 680);
    press('pointerdown', 'pen', 62, 300, 40);
    press('pointerdown', 'touch', 63, 90, 90);
    press('pointerup', 'touch', 63, 90, 90);
    hold(layer);
    const shield = layer.lastElementChild as HTMLElement;
    const clip = () => shield.style.getPropertyValue('clip-path');
    expect(clip()).toContain(holeAt(20, 680));
    expect(clip()).toContain(holeAt(300, 40));
    expect(clip()).not.toContain(holeAt(90, 90));
    // The opening follows the press, and closes when it lifts.
    press('pointermove', 'touch', 61, 24, 676);
    expect(clip()).toContain(holeAt(24, 676));
    expect(clip()).not.toContain(holeAt(20, 680));
    press('pointerup', 'touch', 61, 24, 676);
    expect(clip()).not.toContain(holeAt(24, 676));
    press('pointercancel', 'pen', 62, 300, 40);
    expect(clip()).not.toContain(holeAt(300, 40));
    for (const stop of stops) {
      stop();
    }
    outside.remove();
  });

  it('merges an earlier press opening that overlaps the still-mouse opening into one box', () => {
    const {layer} = mountLayer();
    mouseRestsAt(100, 100);
    lastPointerWas('touch');
    const stops = (['pointerdown', 'pointerup', 'pointercancel'] as const).map(
      type => subscribeInput(window, type, () => {}),
    );
    document.body.dispatchEvent(
      new PointerEvent('pointerdown', {
        ...INIT,
        pointerId: 81,
        pointerType: 'touch',
        clientX: 103,
        clientY: 101,
      }),
    );
    hold(layer);
    const shield = layer.lastElementChild as HTMLElement;
    expect(shield.style.getPropertyValue('clip-path')).toBe(
      'polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 98px, 98px 98px, 98px 103px, 105px 103px, 105px 98px, 0 98px)',
    );
    document.body.dispatchEvent(
      new PointerEvent('pointerup', {
        ...INIT,
        pointerId: 81,
        pointerType: 'touch',
        clientX: 103,
        clientY: 101,
      }),
    );
    expect(shield.style.getPropertyValue('clip-path')).toBe(
      openingAt(100, 100),
    );
    for (const stop of stops) {
      stop();
    }
  });

  it("gives no opening to a press the press hold holds, and none on a dismissal's shield", () => {
    const {layer, child} = mountLayer();
    const stops = (['pointerdown', 'pointerup', 'pointercancel'] as const).map(
      type => subscribeInput(window, type, () => {}),
    );
    const press = (
      target: Element,
      type: string,
      id: number,
      x: number,
      y: number,
    ) =>
      target.dispatchEvent(
        new PointerEvent(type, {
          ...INIT,
          pointerId: id,
          pointerType: 'touch',
          clientX: x,
          clientY: y,
        }),
      );
    press(document.body, 'pointerdown', 71, 10, 10);
    hold(layer, 'surface');
    // Held: it lands on the layer during the surface hold.
    press(child, 'pointerdown', 72, 50, 50);
    hold(layer, 'viewport');
    const shield = layer.lastElementChild as HTMLElement;
    expect(shield.style.getPropertyValue('clip-path')).toContain(
      holeAt(10, 10),
    );
    expect(shield.style.getPropertyValue('clip-path')).not.toContain(
      holeAt(50, 50),
    );
    // A dismissal's shield takes every hit.
    hold(layer, 'layer');
    expect(shield.style.getPropertyValue('clip-path')).toBe('');
    press(document.body, 'pointerup', 71, 10, 10);
    press(child, 'pointerup', 72, 50, 50);
    for (const stop of stops) {
      stop();
    }
  });

  it("stops a shield over the layer's box alone from taking hits once the stream heard a mouse, while a finger's press on the layer is still held (spec:AST-094 FR35)", () => {
    const {layer} = mountLayer();
    const {button, reached} = recorder(layer);
    mouseRestsAt(40, 40);
    lastPointerWas('touch');
    hold(layer, 'surface');
    const shield = layer.lastElementChild as HTMLElement;
    expect(isInputShield(shield)).toBe(true);
    expect(shield.style.pointerEvents).toBe('none');
    pointer(button, 'pointerdown', 'touch', 2);
    pointer(button, 'pointerup', 'touch', 2);
    click(button, 'touch');
    expect(reached).toEqual([]);
    expect(shield.style.pointerEvents).toBe('none');
  });

  it("starts a presentation's shield up when the stream last heard a finger, or no pointer at all", () => {
    const {layer, child} = mountLayer();
    lastPointerWas('touch');
    hold(layer);
    const shield = layer.lastElementChild as HTMLElement;
    expect(shield.style.pointerEvents).toBe('auto');
    expect(holdsTouch(child)).toBe(true);
    // Once a mouse moves during the hold, it passes.
    pointer(document.body, 'pointermove', 'mouse');
    expect(shield.style.pointerEvents).toBe('none');
    expect(holdsTouch(child)).toBe(false);
  });

  it('adds its window listeners only while a layer is held, once per document however many layers are held, and removes every one after the last hold ends (spec:AST-094 FR24)', () => {
    const added = vi.spyOn(window, 'addEventListener');
    const removed = vi.spyOn(window, 'removeEventListener');
    const listening = () => added.mock.calls.length - removed.mock.calls.length;
    const first = mountLayer().layer;
    const second = mountLayer().layer;
    const releaseFirst = hold(first);
    const once = listening();
    expect(once).toBeGreaterThan(0);
    const releaseSecond = hold(second, 'layer');
    expect(listening()).toBe(once);
    releaseFirst();
    expect(listening()).toBe(once);
    releaseSecond();
    expect(listening()).toBe(0);
  });

  it("answers the gesture host's question only while a layer is held, and false after the last hold ends, registering nothing (spec:AST-094 FR24)", () => {
    const addTouchGate = vi.spyOn(GestureHost.prototype, 'addTouchGate');
    const {layer, child} = mountLayer();
    const release = hold(layer);
    expect(holdsTouch(child)).toBe(true);
    hold(mountLayer().layer)();
    expect(holdsTouch(child)).toBe(true);
    release();
    expect(holdsTouch(child)).toBe(false);
    expect(addTouchGate).not.toHaveBeenCalled();
  });

  it("lets the gesture host's gate pass a mouse during a presentation and hold it during a dismissal", () => {
    const {layer, child} = mountLayer();
    hold(layer);
    // What the gesture host asks the hold for every touch.
    const isGated = holdsTouch;
    // Before any pointer: held.
    expect(isGated(child)).toBe(true);
    pointer(child, 'pointermove', 'mouse');
    pointer(child, 'pointerdown', 'mouse');
    expect(isGated(child)).toBe(false);
    pointer(child, 'pointerup', 'mouse');
    pointer(child, 'pointerdown', 'touch', 2);
    expect(isGated(child)).toBe(true);
    pointer(child, 'pointerup', 'touch', 2);
    hold(layer, 'layer');
    pointer(child, 'pointermove', 'mouse');
    pointer(child, 'pointerdown', 'mouse');
    expect(isGated(child)).toBe(true);
    expect(isGated(document.body)).toBe(false);
  });

  it("keeps a presentation's shield up for a mouse press that begins on it, to that press's end, and the gate holds what lands on the shield: its release and click are the shield's, not what lies beneath", () => {
    const {layer, child} = mountLayer();
    hold(layer);
    const shield = layer.lastElementChild as HTMLElement;
    const isGated = holdsTouch;
    // A mouse that has not moved during the hold presses: the press meets
    // the shield, which stays up through the press, a drag included.
    pointer(shield, 'pointerdown', 'mouse', 1, 1);
    expect(shield.style.pointerEvents).toBe('auto');
    pointer(shield, 'pointermove', 'mouse', 1, 1);
    expect(shield.style.pointerEvents).toBe('auto');
    expect(isGated(shield)).toBe(true);
    pointer(shield, 'pointerup', 'mouse');
    // Only a mouse moving with no button down lets it through.
    pointer(document.body, 'pointermove', 'mouse');
    expect(shield.style.pointerEvents).toBe('none');
    expect(isGated(child)).toBe(false);
    // What lands on a shield is held, a mouse's press included.
    expect(isGated(shield)).toBe(true);
  });

  it('swallows a synthetic press that lands past a lowered shield without capturing it: it has no active pointer to capture', () => {
    // jsdom implements no pointer capture; a browser's setPointerCapture
    // throws NotFoundError for a pointer that is not active, as a synthetic
    // press's is not.
    const setPointerCapture = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: setPointerCapture,
    });
    onTestFinished(() => {
      Reflect.deleteProperty(HTMLElement.prototype, 'setPointerCapture');
    });
    const {layer} = mountLayer();
    const {button, reached} = recorder();
    hold(layer);
    // A moving mouse lowers the shield, so the finger lands past it.
    pointer(document.body, 'pointermove', 'mouse');
    const down = pointer(button, 'pointerdown', 'touch');
    pointer(button, 'pointerup', 'touch');
    click(button, 'touch');
    expect(setPointerCapture).not.toHaveBeenCalled();
    expect(down.defaultPrevented).toBe(true);
    expect(reached).toEqual([]);
  });

  it('lets a key or assistive technology click through: it counts no press', () => {
    const {layer} = mountLayer();
    const {button, reached} = recorder(layer);
    hold(layer);
    pointer(button, 'pointerdown', 'touch');
    pointer(button, 'pointerup', 'touch');
    click(button, '', 0);
    expect(reached).toEqual(['click']);
  });

  it("never cancels a touch's start, and cancels a move only while one finger is down", () => {
    const {layer} = mountLayer();
    const {button, reached} = recorder(layer);
    hold(layer);
    expect(touch(button, 'touchstart', [1]).defaultPrevented).toBe(false);
    expect(touch(button, 'touchmove', [1]).defaultPrevented).toBe(true);
    // A second finger: a pinch, which still zooms the page.
    expect(touch(button, 'touchstart', [2], 2).defaultPrevented).toBe(false);
    expect(touch(button, 'touchmove', [1, 2]).defaultPrevented).toBe(false);
    touch(button, 'touchend', [1, 2], 0);
    expect(reached).toEqual([]);
  });

  it('swallows the compatibility mouse events and the click a browser sends after a held touch', () => {
    const {layer} = mountLayer();
    const {button, reached} = recorder(layer);
    hold(layer);
    touch(button, 'touchstart', [1]);
    expect(touch(button, 'touchend', [1], 0).defaultPrevented).toBe(true);
    mouse(button, 'mousedown');
    mouse(button, 'mouseup');
    mouse(button, 'click');
    expect(reached).toEqual([]);
  });

  it('follows a press that landed during the hold to its end, past the release, and leaves the next tap alone', () => {
    const {layer} = mountLayer();
    const {button, reached} = recorder();
    const release = hold(layer);
    pointer(button, 'pointerdown', 'touch');
    release();
    pointer(button, 'pointerup', 'touch');
    click(button, 'touch');
    expect(reached).toEqual([]);
    // The next tap is the page's again.
    tap(button, 'touch', 2);
    expect(reached).toEqual(['pointerdown', 'pointerup', 'click']);
  });

  it('lets a touch after the release through when a held touch ended where the window could not hear it, its identifier reused', () => {
    const {layer} = mountLayer();
    const {button, reached} = recorder();
    const release = hold(layer);
    // A held touch whose end went to its removed target, unheard here.
    touch(button, 'touchstart', [0]);
    release();
    // The next touch reuses its identifier: it is the page's, and so is its
    // end, which the browser follows with a click.
    touch(button, 'touchstart', [0]);
    const end = touch(button, 'touchend', [0], 0);
    expect(end.defaultPrevented).toBe(false);
    mouse(button, 'click');
    expect(reached).toEqual(['touchstart', 'touchend', 'click']);
  });

  it('holds nothing once its layer has left the document', () => {
    const {layer} = mountLayer();
    hold(layer);
    layer.remove();
    const {button, reached} = recorder();
    tap(button, 'touch');
    expect(reached).toEqual(['pointerdown', 'pointerup', 'click']);
  });
});
