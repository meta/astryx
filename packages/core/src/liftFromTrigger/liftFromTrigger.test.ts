// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file liftFromTrigger.test.ts
 * @input vitest (jsdom), the lift, stand-ins for the popover API and for
 *   layout (jsdom has neither) and a spy on the input hold
 * @output Checks the lift's bookkeeping in the page. While up it adds the
 *   layer and one placeholder, and nothing at rest. A drop or an unmount puts
 *   back what the source had inline. Nothing outlives repeated lifts. It also
 *   checks the gutter, the holds and backdrop taps, and the geometry: how
 *   far a source grows, where it lands inside the gutter, and a surface's
 *   side in either direction
 * @position Testing; the motion, the top layer and the counts in real
 *   engines are proven in __tests__/liftFromTrigger.interaction.browser.spec.ts
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as inputHold from '../Layer/inputHold';
import type * as InputStream from '../utils/inputStream';
import {
  createLiftFromTrigger,
  type LiftFromTriggerOptions,
  type LiftFromTriggerResult,
  liftFromTriggerRect,
  liftFromTriggerScale,
  surfacePlacement,
  type LiftFromTriggerViewport,
} from './liftFromTrigger';

vi.mock('../Layer/inputHold', async importOriginal => ({
  ...(await importOriginal<typeof inputHold>()),
  holdInput: vi.fn(() => () => {}),
}));

const {holdInput} = inputHold;

// The input-stream subscriptions this test made and has not ended.
const stream = vi.hoisted(() => ({live: new Set<object>()}));
vi.mock('../utils/inputStream', async importOriginal => {
  const actual = await importOriginal<typeof InputStream>();
  const subscribeInput: typeof actual.subscribeInput = (...args) => {
    const stop = actual.subscribeInput(...args);
    const {live} = stream;
    const subscription = {};
    live.add(subscription);
    return () => {
      live.delete(subscription);
      stop();
    };
  };
  return {...actual, subscribeInput};
});

const SPRING = {response: 0.3, dampingRatio: 1};

function options(
  overrides: Partial<LiftFromTriggerOptions> = {},
): LiftFromTriggerOptions {
  return {
    motion: {
      lift: SPRING,
      drop: SPRING,
      clear: SPRING,
      surfaceIn: SPRING,
    },
    scale: {maxScale: 1.15, scaleUpPoints: 26},
    attribute: 'data-test-lift',
    ...overrides,
  };
}

function place(
  element: HTMLElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  element.getBoundingClientRect = () =>
    DOMRect.fromRect({x, y, width: w, height: h});
  Object.defineProperty(element, 'offsetWidth', {value: w, configurable: true});
  Object.defineProperty(element, 'offsetHeight', {
    value: h,
    configurable: true,
  });
}

/** A list of three rows; the middle one, the source, holds 12 elements. */
function renderList(): {source: HTMLElement; before: HTMLElement} {
  document.body.innerHTML = `
    <ul id="list">
      <li id="before">Before</li>
      <li id="source" style="color: red; width: 50%">
        <div><span>1</span><span>2</span><span>3</span></div>
        <div><span>4</span><span>5</span><span>6</span></div>
        <div><span>7</span><span>8</span><span>9</span></div>
      </li>
      <li id="after">After</li>
    </ul>`;
  const source = document.getElementById('source') as HTMLElement;
  place(source, 20, 300, 335, 60);
  return {
    source,
    before: document.getElementById('before') as HTMLElement,
  };
}

const count = () => document.body.querySelectorAll('*').length;

/**
 * The source's inline style is what it was: its own values, and none of the
 * lift's. (Property by property: jsdom's style object keeps a `margin`
 * shorthand of its own making once all four margins were set, which a
 * browser does not.)
 */
function expectInlineAsBefore(source: HTMLElement) {
  const lifted = [
    'position',
    'left',
    'top',
    'right',
    'bottom',
    'height',
    'min-width',
    'min-height',
    'max-width',
    'max-height',
    'box-sizing',
    'pointer-events',
    'transition',
    'padding-top',
    'border-top-width',
    'background-color',
    'overflow-x',
    'translate',
    'scale',
    'transform-origin',
  ];
  expect({
    color: source.style.getPropertyValue('color'),
    width: source.style.getPropertyValue('width'),
    ...Object.fromEntries(
      lifted.map(property => [
        property,
        source.style.getPropertyValue(property),
      ]),
    ),
  }).toEqual({
    color: 'red',
    width: '50%',
    ...Object.fromEntries(lifted.map(property => [property, ''])),
  });
}

// Document listeners added and not yet removed, by type.
let documentListeners: Map<string, number>;
const realAdd = document.addEventListener.bind(document);
const realRemove = document.removeEventListener.bind(document);
let open: Set<Element>;
const realShow = HTMLElement.prototype.showPopover;
const realHide = HTMLElement.prototype.hidePopover;
const realMatches = Element.prototype.matches;

beforeEach(() => {
  vi.useFakeTimers();
  open = new Set();
  HTMLElement.prototype.showPopover = function (this: HTMLElement) {
    open.add(this);
  };
  HTMLElement.prototype.hidePopover = function (this: HTMLElement) {
    open.delete(this);
  };
  // jsdom knows no popover state: `:popover-open` is this stand-in's.
  Element.prototype.matches = function (this: Element, selector: string) {
    return selector === ':popover-open'
      ? open.has(this)
      : realMatches.call(this, selector);
  } as typeof realMatches;
  documentListeners = new Map();
  stream.live = new Set();
  vi.spyOn(document, 'addEventListener').mockImplementation(
    (type, listener, opts) => {
      documentListeners.set(type, (documentListeners.get(type) ?? 0) + 1);
      const signal =
        typeof opts === 'object' && opts != null ? opts.signal : undefined;
      signal?.addEventListener('abort', () => {
        documentListeners.set(type, (documentListeners.get(type) ?? 1) - 1);
      });
      realAdd(type, listener, opts);
    },
  );
  vi.spyOn(document, 'removeEventListener').mockImplementation(
    (type, listener, opts) => {
      documentListeners.set(type, (documentListeners.get(type) ?? 1) - 1);
      realRemove(type, listener, opts);
    },
  );
  vi.mocked(holdInput).mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  HTMLElement.prototype.showPopover = realShow;
  HTMLElement.prototype.hidePopover = realHide;
  Element.prototype.matches = realMatches;
  document.body.innerHTML = '';
});

/**
 * Every listener this test added to the document is gone, and so is every
 * input-stream subscription.
 */
function expectNoListeners() {
  for (const [type, live] of documentListeners) {
    expect({type, live: Math.max(live, 0)}).toEqual({type, live: 0});
  }
  expect(stream.live.size).toBe(0);
}

describe('lift', () => {
  it('adds the layer, its anchor and one placeholder while lifted, and no shadow, whatever the source holds; the source keeps its place among its siblings', () => {
    const {source, before} = renderList();
    const rest = count();
    const lift = createLiftFromTrigger();
    const result = lift.lift(source, options());
    expect(result).not.toBeNull();
    // 13 elements lifted (the row and its 12), 3 added.
    expect(count()).toBe(rest + 3);
    expect(document.querySelector('[data-test-lift-shadow]')).toBeNull();
    expect(source.previousElementSibling).toBe(before);
    const placeholder = source.nextElementSibling as HTMLElement;
    expect(placeholder.hasAttribute('data-test-lift-placeholder')).toBe(true);
    expect(placeholder.getAttribute('aria-hidden')).toBe('true');
    expect(placeholder.style.width).toBe('335px');
    expect(placeholder.style.height).toBe('60px');
    const layer = document.body.lastElementChild as HTMLElement;
    expect(layer.hasAttribute('data-test-lift')).toBe(true);
    expect(layer.getAttribute('popover')).toBe('manual');
    // The box a surface is placed against: the lifted rect, in the layer.
    expect(result?.anchor.parentElement).toBe(layer);
    expect(result?.anchor.style.width).toBe(`${result?.lifted.width}px`);
    // The source itself is in the top layer, above the layer, at its box,
    // and takes no hits.
    expect(source.getAttribute('popover')).toBe('manual');
    expect([...open]).toEqual([layer, source]);
    expect(source.style.getPropertyValue('position')).toBe('fixed');
    expect(source.style.getPropertyValue('left')).toBe('20px');
    expect(source.style.getPropertyValue('top')).toBe('300px');
    expect(source.style.getPropertyValue('width')).toBe('335px');
    expect(source.style.getPropertyValue('pointer-events')).toBe('none');
    expect(lift.isLifted()).toBe(true);
    // Grown about its center by 26 px on its larger side.
    expect(result?.lifted.width).toBeCloseTo(361, 5);
    lift.dispose();
  });

  it('calls onLayerShown once the layer shows and before the source lifts into it, with where the source lands', () => {
    const {source} = renderList();
    const lift = createLiftFromTrigger();
    const seen: {
      layerOpen: boolean;
      sourceLifted: boolean;
      placeholder: boolean;
      lifted: LiftFromTriggerResult;
    }[] = [];
    const result = lift.lift(
      source,
      options({
        onLayerShown: lifted => {
          seen.push({
            layerOpen:
              document
                .querySelector('[data-test-lift]')
                ?.matches(':popover-open') ?? false,
            sourceLifted: source.matches(':popover-open'),
            placeholder:
              document.querySelector('[data-test-lift-placeholder]') != null,
            lifted,
          });
        },
      }),
    );
    expect(seen).toHaveLength(1);
    expect(seen[0].layerOpen).toBe(true);
    expect(seen[0].sourceLifted).toBe(false);
    expect(seen[0].placeholder).toBe(false);
    expect(seen[0].lifted).toEqual(result);
    expect(source.matches(':popover-open')).toBe(true);
    lift.dispose();
  });

  it("resolves the layer runtime's gutter on each edge in px where the source is, with the app's declared inset, and the source's direction", () => {
    const {source} = renderList();
    const original = window.getComputedStyle.bind(window);
    let declaredInset = '';
    const gutter: Record<string, string> = {
      'padding-top': '47px',
      'padding-bottom': '34px',
      'padding-left': '16px',
    };
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      (element, pseudo) => {
        const style = original(element, pseudo);
        // The source's direction, and the gutter as resolved inside it.
        if (element === source) {
          const rtl: CSSStyleDeclaration = {
            ...style,
            direction: 'rtl',
            getPropertyValue: (property: string) =>
              style.getPropertyValue(property),
          };
          return rtl;
        }
        if (element.parentElement !== source) {
          return style;
        }
        declaredInset = (element as HTMLElement).style.getPropertyValue(
          '--astryx-layer-inset-block-end',
        );
        const resolved: CSSStyleDeclaration = {
          ...style,
          getPropertyValue: (property: string) =>
            gutter[property] ?? style.getPropertyValue(property),
        };
        return resolved;
      },
    );
    const lift = createLiftFromTrigger();
    const result = lift.lift(source, options({inset: {blockEnd: 56}}));
    expect(declaredInset).toBe('56px');
    expect(result?.viewport.gutter).toEqual({top: 47, bottom: 34, inline: 16});
    expect(result?.viewport.direction).toBe('rtl');
    lift.dispose();
  });

  it('a drop puts back exactly what the source had inline, and takes the placeholder and the layer away', async () => {
    const {source} = renderList();
    const rest = count();
    const lift = createLiftFromTrigger();
    lift.lift(source, options());
    lift.drop();
    await vi.runAllTimersAsync();
    expectInlineAsBefore(source);
    expect(source.hasAttribute('popover')).toBe(false);
    expect(count()).toBe(rest);
    expect(open.size).toBe(0);
    expect(lift.isLifted()).toBe(false);
  });

  it('a second drop while the source returns changes nothing: the return goes on from where it is', async () => {
    const {source} = renderList();
    const lift = createLiftFromTrigger();
    lift.lift(source, options());
    await vi.advanceTimersByTimeAsync(1000);
    lift.drop();
    await vi.advanceTimersByTimeAsync(30);
    expect(lift.isLifted()).toBe(true);
    vi.mocked(holdInput).mockClear();
    lift.drop();
    await vi.advanceTimersByTimeAsync(16);
    expect(lift.isLifted()).toBe(true);
    expect(vi.mocked(holdInput)).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    expect(lift.isLifted()).toBe(false);
    expectInlineAsBefore(source);
  });

  it('pins the caller’s styles with its own while lifted, and puts them back with them once the source is back', async () => {
    const {source} = renderList();
    const lift = createLiftFromTrigger();
    lift.lift(
      source,
      options({
        pin: {'background-color': 'rgb(1, 2, 3)', 'border-radius': '12px'},
      }),
    );
    expect(source.style.getPropertyValue('background-color')).toBe(
      'rgb(1, 2, 3)',
    );
    expect(source.style.getPropertyPriority('background-color')).toBe(
      'important',
    );
    expect(source.style.getPropertyValue('border-radius')).toBe('12px');
    lift.drop();
    await vi.runAllTimersAsync();
    expectInlineAsBefore(source);
    expect(source.style.getPropertyValue('border-radius')).toBe('');
  });

  it('an unmount mid-lift ends it at once: no element, document listener or timer left', () => {
    const {source} = renderList();
    const rest = count();
    const lift = createLiftFromTrigger();
    lift.lift(source, options());
    lift.dispose();
    expectInlineAsBefore(source);
    expect(count()).toBe(rest);
    expect(open.size).toBe(0);
    expectNoListeners();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('an unmount while the close waits for a press on the layer to lift leaves nothing behind either', async () => {
    const {source} = renderList();
    const rest = count();
    const lift = createLiftFromTrigger();
    lift.lift(source, options());
    const layer = document.body.lastElementChild as HTMLElement;
    // A finger down on the layer, never lifted: the close waits for it.
    const down = new Event('pointerdown', {bubbles: true});
    Object.assign(down, {pointerId: 7, isPrimary: true});
    layer.dispatchEvent(down);
    lift.drop();
    await vi.runAllTimersAsync();
    expect(document.body.contains(layer)).toBe(true);
    lift.dispose();
    expect(count()).toBe(rest);
    expectNoListeners();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('hears a press on the layer lift even when the app stops it at the window: the close still ends', async () => {
    const {source} = renderList();
    const lift = createLiftFromTrigger();
    lift.lift(source, options());
    const layer = document.body.lastElementChild as HTMLElement;
    // An app that stops every pointerup on the window's capture phase.
    const stop = (event: Event) => event.stopPropagation();
    window.addEventListener('pointerup', stop, true);
    const press = (type: string) => {
      const event = new Event(type, {bubbles: true});
      Object.assign(event, {pointerId: 7, isPrimary: true});
      layer.dispatchEvent(event);
    };
    try {
      press('pointerdown');
      lift.drop();
      await vi.runAllTimersAsync();
      expect(document.body.contains(layer)).toBe(true);
      press('pointerup');
      await vi.runAllTimersAsync();
      expect(document.body.contains(layer)).toBe(false);
      expectNoListeners();
    } finally {
      window.removeEventListener('pointerup', stop, true);
    }
  });

  it('twenty lifts and drops leave the page, the document listeners and the timers as they were (no leaks)', async () => {
    const {source} = renderList();
    const rest = count();
    const lift = createLiftFromTrigger();
    for (let i = 0; i < 20; i++) {
      lift.lift(source, options());
      lift.drop();
      await vi.runAllTimersAsync();
    }
    expect(count()).toBe(rest);
    expectInlineAsBefore(source);
    expectNoListeners();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('changes nothing without the popover API', () => {
    const {source} = renderList();
    const html = document.body.innerHTML;
    // @ts-expect-error: a browser without the popover API.
    HTMLElement.prototype.showPopover = undefined;
    const lift = createLiftFromTrigger();
    expect(lift.lift(source, options())).toBeNull();
    expect(document.body.innerHTML).toBe(html);
  });

  it('a source out of the flow needs no placeholder', () => {
    const {source} = renderList();
    source.style.position = 'absolute';
    const rest = count();
    const lift = createLiftFromTrigger();
    lift.lift(source, options());
    // The layer and its anchor only.
    expect(count()).toBe(rest + 2);
    lift.dispose();
  });

  it('holds the layer while the source grows and a surface grows (a presentation), and while it closes (the layer)', async () => {
    const {source} = renderList();
    document.body.insertAdjacentHTML(
      'beforeend',
      '<div id="menu" popover="manual"><div role="menu"></div></div>',
    );
    const menu = document.getElementById('menu') as HTMLElement;
    place(menu, 40, 380, 250, 200);
    const lift = createLiftFromTrigger();
    lift.lift(source, options());
    const layer = document.querySelector('[data-test-lift]');
    expect(vi.mocked(holdInput)).toHaveBeenLastCalledWith(layer, {
      scope: 'viewport',
      until: expect.any(Promise),
    });
    vi.mocked(holdInput).mockClear();
    lift.presentSurface(
      menu.querySelector<HTMLElement>('[role="menu"]') as HTMLElement,
    );
    expect(vi.mocked(holdInput)).toHaveBeenLastCalledWith(layer, {
      scope: 'viewport',
      until: expect.any(Promise),
    });
    lift.drop();
    expect(vi.mocked(holdInput)).toHaveBeenLastCalledWith(layer, {
      scope: 'layer',
      until: expect.any(Promise),
    });
    await vi.runAllTimersAsync();
    lift.dispose();
  });

  it('a press that went down and lifted on the layer is a backdrop tap; one that came from elsewhere is not', () => {
    const {source} = renderList();
    const onBackdropTap = vi.fn();
    const lift = createLiftFromTrigger();
    lift.lift(source, options({onBackdropTap}));
    const layer = document.body.lastElementChild as HTMLElement;
    const pointer = (type: string, pointerId: number) => {
      const event = new Event(type, {bubbles: true});
      Object.assign(event, {pointerId, isPrimary: true});
      layer.dispatchEvent(event);
    };
    // The finger that opened the menu lifts on the layer: not a tap there.
    pointer('pointerup', 1);
    expect(onBackdropTap).not.toHaveBeenCalled();
    pointer('pointerdown', 2);
    pointer('pointerup', 2);
    expect(onBackdropTap).toHaveBeenCalledTimes(1);
    lift.dispose();
  });
});

const RULE = {maxScale: 1.15, scaleUpPoints: 26};
const VIEWPORT: LiftFromTriggerViewport = {
  width: 402,
  height: 874,
  gutter: {top: 82, bottom: 54, inline: 16},
};

describe('liftFromTriggerScale', () => {
  it('caps a small source at the rule’s largest factor', () => {
    expect(liftFromTriggerScale(60, 60, VIEWPORT, RULE)).toBe(1.15);
  });

  it('grows a larger source by the rule’s points on its larger side', () => {
    expect(liftFromTriggerScale(200, 120, VIEWPORT, RULE)).toBeCloseTo(
      226 / 200,
      10,
    );
  });

  it('shrinks a source wider than the viewport less its gutter', () => {
    expect(liftFromTriggerScale(402, 60, VIEWPORT, RULE)).toBeCloseTo(
      370 / 402,
      10,
    );
  });

  it('shrinks a source taller than the viewport less its top and bottom gutters', () => {
    expect(liftFromTriggerScale(300, 900, VIEWPORT, RULE)).toBeCloseTo(
      738 / 900,
      10,
    );
  });

  it('leaves an empty source alone', () => {
    expect(liftFromTriggerScale(0, 0, VIEWPORT, RULE)).toBe(1);
  });
});

describe('liftFromTriggerRect', () => {
  it('grows about the source’s center', () => {
    const lifted = liftFromTriggerRect(
      {x: 101, y: 400, width: 200, height: 120},
      VIEWPORT,
      RULE,
    );
    expect(lifted.x + lifted.width / 2).toBeCloseTo(201, 10);
    expect(lifted.y + lifted.height / 2).toBeCloseTo(460, 10);
    expect(lifted.width).toBeCloseTo(226, 10);
  });

  it('moves inside the gutter on every edge', () => {
    expect(
      liftFromTriggerRect({x: 4, y: 400, width: 60, height: 60}, VIEWPORT, RULE)
        .x,
    ).toBe(16);
    const right = liftFromTriggerRect(
      {x: 340, y: 400, width: 60, height: 60},
      VIEWPORT,
      RULE,
    );
    expect(right.x + right.width).toBeCloseTo(386, 10);
    expect(
      liftFromTriggerRect(
        {x: 100, y: 60, width: 60, height: 60},
        VIEWPORT,
        RULE,
      ).y,
    ).toBe(82);
    const bottom = liftFromTriggerRect(
      {x: 100, y: 800, width: 60, height: 60},
      VIEWPORT,
      RULE,
    );
    expect(bottom.y + bottom.height).toBeCloseTo(820, 10);
  });

  it('keeps a source taller than the room between the gutters inside both', () => {
    const tall = liftFromTriggerRect(
      {x: 51, y: 0, width: 300, height: 900},
      VIEWPORT,
      RULE,
    );
    expect(tall.y).toBeCloseTo(82, 10);
    expect(tall.y + tall.height).toBeCloseTo(820, 10);
  });
});

describe('surfacePlacement', () => {
  const middle = {x: 88, y: 368, width: 226, height: 135.67};

  it('goes below the source, centered, where it fits above the bottom gutter', () => {
    expect(surfacePlacement(middle, 200, VIEWPORT, 16)).toEqual({
      side: 'below',
      alignment: 'center',
    });
  });

  it('goes above where it does not fit below', () => {
    const low = {...middle, y: 600};
    expect(surfacePlacement(low, 400, VIEWPORT, 16).side).toBe('above');
  });

  it('reports that neither side fits when the surface is taller than the room above and below', () => {
    expect(surfacePlacement(middle, 400, VIEWPORT, 16).side).toBe('none');
  });

  it('is flush with the edge the source is held against, and the sides swap in a right-to-left page', () => {
    const atLeft = {...middle, x: 16};
    const atRight = {...middle, x: 386 - middle.width};
    expect(surfacePlacement(atLeft, 200, VIEWPORT, 16).alignment).toBe('start');
    expect(surfacePlacement(atRight, 200, VIEWPORT, 16).alignment).toBe('end');
    const rtl: LiftFromTriggerViewport = {...VIEWPORT, direction: 'rtl'};
    expect(surfacePlacement(atLeft, 200, rtl, 16).alignment).toBe('end');
    expect(surfacePlacement(atRight, 200, rtl, 16).alignment).toBe('start');
  });
});
