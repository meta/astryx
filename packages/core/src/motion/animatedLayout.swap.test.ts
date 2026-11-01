// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file animatedLayout.swap.test.ts
 * @input vitest (jsdom), the animated-layout module, a recording stand-in for
 *   Element.animate
 * @output Checks the in-place swap (`spec:AST-105` FR8): one inert transient
 *   copy of old content that takes no part in the page, played on FR4's one
 *   motion with the incoming elements, opacity-only under Reduce Motion with
 *   a coarse pointer, nothing under an immediate change, and removed when the
 *   swap ends
 * @position Testing; the real geometry is proven by the adopters'
 *   real-browser frames
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  createAnimatedLayout,
  holdLayoutSwap,
  playLayoutFrames,
  playLayoutSwap,
  reportLayoutChange,
} from './animatedLayout';

interface Played {
  element: Element;
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  startTime: number | null;
  finish?: () => void;
}

let played: Played[] = [];
let media: Record<string, boolean> = {};
const originalAnimate = Element.prototype.animate;
const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  played = [];
  media = {};
  Object.defineProperty(document, 'timeline', {
    configurable: true,
    value: {currentTime: 500},
  });
  Element.prototype.animate = function (
    this: Element,
    keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
    options?: number | KeyframeAnimationOptions,
  ) {
    const entry: Played = {
      element: this,
      keyframes: keyframes as Keyframe[],
      options: options as KeyframeAnimationOptions,
      startTime: null,
    };
    played.push(entry);
    return {
      cancel: vi.fn(),
      addEventListener(type: string, listener: () => void) {
        if (type === 'finish') {
          entry.finish = listener;
        }
      },
      set startTime(value: number) {
        entry.startTime = value;
      },
    } as unknown as Animation;
  };
  window.matchMedia = (query: string) =>
    ({
      matches: media[query] === true,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList;
});

afterEach(() => {
  Element.prototype.animate = originalAnimate;
  window.matchMedia = originalMatchMedia;
  document.body.innerHTML = '';
});

function setup() {
  document.body.innerHTML = `
    <div id="area">
      <div id="host">
        <main id="content" data-testid="main">
          <h2 id="title">Projects</h2>
          <label><input type="radio" name="plan" value="pro" checked /> Pro</label>
          <iframe src="about:blank"></iframe>
          <canvas width="40" height="20"></canvas>
          <label for="plan-pro">Pro plan</label>
          <div id="scroller">Rows</div>
          <svg><text id="axis">Axis</text></svg>
        </main>
      </div>
    </div>`;
  const area = document.getElementById('area') as HTMLElement;
  const handle = createAnimatedLayout(() => area);
  const content = document.getElementById('content') as HTMLElement;
  const host = document.getElementById('host') as HTMLElement;
  return {handle, content, host};
}

const travel = (p: number): Keyframe => ({
  opacity: 1 - p,
  translate: `${-200 * p}px 0px`,
});

describe('the in-place swap (spec:AST-105 FR8)', () => {
  it('holds old content as one inert copy that takes no part in the page', () => {
    const {handle, content} = setup();
    const swap = holdLayoutSwap(handle, content);
    expect(swap).not.toBeNull();
    const copy = swap?.copy as HTMLElement;
    expect(copy.getAttribute('aria-hidden')).toBe('true');
    expect(copy.hasAttribute('inert')).toBe(true);
    expect(copy.querySelector('[id]')).toBeNull();
    expect(copy.querySelector('[data-testid]')).toBeNull();
    // A copied checked radio joins no group; a copied frame loads nothing.
    expect(copy.querySelector('input')?.hasAttribute('name')).toBe(false);
    expect(copy.querySelector('iframe')?.hasAttribute('src')).toBe(false);
    expect(copy.isConnected).toBe(false);
  });

  it('plays the copy out and the incoming elements in on one motion, then removes the copy', () => {
    const {handle, content, host} = setup();
    const swap = holdLayoutSwap(handle, content);
    const title = document.getElementById('title') as HTMLElement;
    const end = playLayoutSwap(swap!, {
      host,
      copy: travel,
      incoming: [{element: title, frames: p => ({opacity: p})}],
    });
    const copy = swap!.copy;
    expect(copy.parentElement).toBe(host);
    const out = played.find(entry => entry.element === copy);
    expect(out?.keyframes[0]).toMatchObject({opacity: 1, translate: '0px 0px'});
    expect(out?.keyframes.at(-1)).toMatchObject({
      opacity: 0,
      translate: '-200px 0px',
    });
    const enter = played.find(entry => entry.element === title);
    expect(enter?.keyframes[0].opacity).toBe(0);
    expect(enter?.keyframes.at(-1)?.opacity).toBe(1);
    // One clock: the same duration, started on the same timeline time.
    expect(new Set(played.map(entry => entry.options.duration)).size).toBe(1);
    expect(new Set(played.map(entry => entry.startTime))).toEqual(
      new Set([500]),
    );
    played[0].finish?.();
    expect(copy.isConnected).toBe(false);
    expect(typeof end).toBe('function');
  });

  it("fades the copy's text on its own curve when asked", () => {
    const {handle, content, host} = setup();
    const swap = holdLayoutSwap(handle, content);
    playLayoutSwap(swap!, {
      host,
      copy: travel,
      copyText: p => 1 - Math.min(1, p / 0.4),
      incoming: [],
    });
    const text = played.find(
      entry =>
        entry.element !== swap!.copy &&
        entry.element.textContent?.trim() === 'Projects',
    );
    expect(text?.keyframes.at(-1)?.opacity).toBe(0);
  });

  it("paints a copied canvas with its source's pixels", () => {
    const drawImage = vi.fn();
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(
        () =>
          ({
            drawImage,
            getImageData: () => ({data: new Uint8ClampedArray([0, 0, 0, 255])}),
          }) as unknown as CanvasRenderingContext2D,
      );
    const {handle, content} = setup();
    holdLayoutSwap(handle, content);
    expect(drawImage).toHaveBeenCalledWith(
      content.querySelector('canvas'),
      0,
      0,
    );
    getContext.mockRestore();
  });

  it('does not copy content holding a canvas it cannot read back', () => {
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(
        () =>
          ({
            drawImage: vi.fn(),
            // A WebGL canvas without preserveDrawingBuffer reads back empty.
            getImageData: () => ({data: new Uint8ClampedArray(16 * 16 * 4)}),
          }) as unknown as CanvasRenderingContext2D,
      );
    const {handle, content} = setup();
    expect(holdLayoutSwap(handle, content)).toBeNull();
    getContext.mockRestore();
  });

  it('keeps a canvas with only a hairline drawn: thin marks read back', () => {
    const data = new Uint8ClampedArray(40 * 20 * 4);
    data[data.length - 1] = 255;
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(
        () =>
          ({
            drawImage: vi.fn(),
            getImageData: () => ({data}),
          }) as unknown as CanvasRenderingContext2D,
      );
    const {handle, content} = setup();
    expect(holdLayoutSwap(handle, content)).not.toBeNull();
    getContext.mockRestore();
  });

  /** The copy renders at `scale` of its layout size, `extra` px taller. */
  function stubCopyLayout(scale: number, extra = 0) {
    const {handle, content, host} = setup();
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(
      function (this: HTMLElement) {
        return parseFloat(this.style.width) || 0;
      },
    );
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(
      function (this: HTMLElement) {
        return (parseFloat(this.style.height) || 0) + extra;
      },
    );
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        if (this === content) {
          return DOMRect.fromRect({x: 100, y: 50, width: 400, height: 200});
        }
        if (this.hasAttribute('inert')) {
          return DOMRect.fromRect({
            x: 10,
            y: 10,
            width: this.offsetWidth * scale,
            height: this.offsetHeight * scale,
          });
        }
        return DOMRect.fromRect({x: 0, y: 0, width: 0, height: 0});
      },
    );
    return {handle, content, host};
  }

  it('draws the copy at the old size under a scaled host', () => {
    const {handle, content, host} = stubCopyLayout(0.5);
    const swap = holdLayoutSwap(handle, content);
    playLayoutSwap(swap!, {host, copy: travel, incoming: []});
    expect(swap!.copy.style.width).toBe('800px');
    expect(swap!.copy.style.height).toBe('400px');
    expect(swap!.copy.style.left).toBe('180px');
    expect(swap!.copy.style.top).toBe('80px');
    vi.restoreAllMocks();
  });

  it("does not take a size the copy's own CSS imposes for a scale", () => {
    // A `min-height: 100%` makes the copy 143 px taller than asked.
    const {handle, content, host} = stubCopyLayout(1, 143);
    const swap = holdLayoutSwap(handle, content);
    playLayoutSwap(swap!, {host, copy: travel, incoming: []});
    expect(swap!.copy.style.top).toBe('40px');
    expect(swap!.copy.style.width).toBe('400px');
    vi.restoreAllMocks();
  });

  it('labels no live control: a copied label drops its for', () => {
    const {handle, content} = setup();
    const swap = holdLayoutSwap(handle, content);
    const label = Array.from(swap!.copy.querySelectorAll('label')).find(
      element => element.textContent === 'Pro plan',
    );
    expect(label).toBeDefined();
    expect(label?.hasAttribute('for')).toBe(false);
  });

  it('keeps a scrolled descendant scrolled as it was once laid out', () => {
    const {handle, content, host} = setup();
    const scroller = document.getElementById('scroller') as HTMLElement;
    Object.defineProperty(scroller, 'scrollTop', {value: 25});
    const scrollTo = vi.fn();
    const original = Element.prototype.scrollTo;
    Element.prototype.scrollTo = scrollTo;
    const swap = holdLayoutSwap(handle, content);
    playLayoutSwap(swap!, {host, copy: travel, incoming: []});
    const copied = scrollTo.mock.contexts.find(
      element => (element as Element).textContent === 'Rows',
    );
    expect(copied).toBeDefined();
    // At once, whatever the copy's own scroll-behavior (a smooth strip).
    expect(scrollTo).toHaveBeenCalledWith({
      top: 25,
      left: 0,
      behavior: 'instant',
    });
    Element.prototype.scrollTo = original;
  });

  it('fades a copied SVG label through its text element, not a span', () => {
    const {handle, content, host} = setup();
    const swap = holdLayoutSwap(handle, content);
    playLayoutSwap(swap!, {
      host,
      copy: travel,
      copyText: p => 1 - p,
      incoming: [],
    });
    expect(swap!.copy.querySelector('svg span')).toBeNull();
    const axis = played.find(
      entry =>
        entry.element.namespaceURI === 'http://www.w3.org/2000/svg' &&
        entry.element.textContent === 'Axis',
    );
    expect(axis?.element.tagName.toLowerCase()).toBe('text');
  });

  it('lays the copy out on its old rect whatever its box sizing', () => {
    const {handle, content, host} = setup();
    const swap = holdLayoutSwap(handle, content);
    playLayoutSwap(swap!, {host, copy: travel, incoming: []});
    expect(swap!.copy.style.boxSizing).toBe('border-box');
  });

  it('copies only the visible part of a scroll container, scrolled as it was', () => {
    const {handle, content} = setup();
    Object.defineProperty(content, 'scrollTop', {value: 40});
    Object.defineProperty(content, 'scrollLeft', {value: 30});
    Object.defineProperty(content, 'clientWidth', {value: 600});
    Object.defineProperty(content, 'clientHeight', {value: 300});
    const swap = holdLayoutSwap(handle, content, {isVisiblePart: true});
    expect(swap?.rect.width).toBe(600);
    expect(swap?.rect.height).toBe(300);
    const inner = swap?.copy.firstElementChild as HTMLElement;
    expect(inner.style.top).toBe('-40px');
    expect(inner.style.left).toBe('-30px');
    // The holder is the part inside the border: the copy carries none.
    expect(inner.style.borderWidth).toBe('0px');
    expect(inner.style.width).toBe('600px');
    expect(inner.hasAttribute('role')).toBe(false);
  });

  it('only cross-fades under Reduce Motion with a coarse pointer (design:reduced-motion DR2)', () => {
    media['(prefers-reduced-motion: reduce)'] = true;
    media['(pointer: coarse)'] = true;
    const {handle, content, host} = setup();
    const swap = holdLayoutSwap(handle, content);
    const title = document.getElementById('title') as HTMLElement;
    playLayoutSwap(swap!, {
      host,
      copy: travel,
      copyText: () => 0,
      incoming: [{element: title, frames: p => ({opacity: p, scale: '2'})}],
    });
    expect(played.length).toBe(2);
    for (const entry of played) {
      for (const frame of entry.keyframes) {
        expect(Object.keys(frame)).toEqual(['opacity']);
      }
    }
  });

  it('holds nothing under Reduce Motion with a fine pointer, without a handle, or outside the area', () => {
    const {handle, content} = setup();
    expect(holdLayoutSwap(null, content)).toBeNull();
    const outside = document.createElement('div');
    document.body.append(outside);
    expect(holdLayoutSwap(handle, outside)).toBeNull();
    media['(prefers-reduced-motion: reduce)'] = true;
    expect(holdLayoutSwap(handle, content)).toBeNull();
    expect(played).toEqual([]);
  });
});

describe('a swap that rides a glide (spec:AST-105 FR8 with FR3)', () => {
  function rideSetup() {
    document.body.innerHTML = `
      <div id="area">
        <div id="rail"></div>
        <div id="column"><main id="content"><h2>Projects</h2></main></div>
      </div>`;
    const area = document.getElementById('area') as HTMLElement;
    const rail = document.getElementById('rail') as HTMLElement;
    const column = document.getElementById('column') as HTMLElement;
    const content = document.getElementById('content') as HTMLElement;
    let phase: 'before' | 'after' = 'before';
    const railWidth = () => (phase === 'before' ? 260 : 48);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        if (this === area) {
          return DOMRect.fromRect({x: 0, y: 0, width: 1000, height: 600});
        }
        if (this === rail) {
          return DOMRect.fromRect({
            x: 0,
            y: 0,
            width: railWidth(),
            height: 600,
          });
        }
        if (this === column || this === content) {
          return DOMRect.fromRect({
            x: railWidth(),
            y: 0,
            width: 1000 - railWidth(),
            height: 600,
          });
        }
        return DOMRect.fromRect({x: 0, y: 0, width: 0, height: 0});
      },
    );
    return {
      handle: createAnimatedLayout(() => area),
      area,
      rail,
      column,
      content,
      after: () => (phase = 'after'),
    };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('moves the copy with the glide of the element it rides, frame by frame', async () => {
    const {handle, area, rail, column, content, after} = rideSetup();
    const swap = holdLayoutSwap(handle, content);
    const change = reportLayoutChange(handle, {current: rail});
    change.measureBefore();
    after();
    change.animate();
    playLayoutSwap(swap!, {
      host: area,
      copy: p => ({opacity: 1 - p}),
      // The travel stands only for a missing glide: the copy rides the
      // glide from where it was laid, whatever the travel says.
      rideWith: {element: column, travel: {x: 150, y: 0}},
      incoming: [],
    });
    await Promise.resolve();
    await Promise.resolve();
    const glide = played.find(entry => entry.element === column);
    const ride = played.find(entry => entry.element === swap!.copy);
    expect(glide?.keyframes[0].translate).toBe('212px 0px');
    expect(ride?.keyframes[0]).toMatchObject({
      opacity: 1,
      translate: '0px 0px',
    });
    expect(ride?.keyframes.at(-1)).toMatchObject({
      opacity: 0,
      translate: '-212px 0px',
    });
    // The same frames: at every sample the copy sits where the column does,
    // less the travel.
    expect(ride?.keyframes.length).toBe(glide?.keyframes.length);
  });

  it('tells every part how far the ridden element has moved, on its glide', async () => {
    const {handle, area, rail, column, content, after} = rideSetup();
    const swap = holdLayoutSwap(handle, content);
    const change = reportLayoutChange(handle, {current: rail});
    change.measureBefore();
    after();
    change.animate();
    const title = document.createElement('h3');
    area.appendChild(title);
    playLayoutSwap(swap!, {
      host: area,
      // A copy that stays put and follows the ride by its clip instead.
      copy: (_p, ride) => ({clipPath: `inset(0px ${-ride.x}px 0px 0px)`}),
      rideWith: {element: column, travel: {x: 212, y: 0}, isCopyMoved: false},
      incoming: [
        {
          element: title,
          frames: (_p, ride) => ({translate: `${ride.x}px 0px`}),
        },
      ],
    });
    await Promise.resolve();
    await Promise.resolve();
    const glide = played.find(entry => entry.element === column);
    const copy = played.find(entry => entry.element === swap!.copy);
    const incoming = played.find(entry => entry.element === title);
    expect(copy?.keyframes[0].translate).toBeUndefined();
    expect(copy?.keyframes[0].clipPath).toBe('inset(0px 0px 0px 0px)');
    expect(copy?.keyframes.at(-1)?.clipPath).toBe('inset(0px 212px 0px 0px)');
    expect(incoming?.keyframes.at(-1)?.translate).toBe('-212px 0px');
    expect(incoming?.keyframes.length).toBe(glide?.keyframes.length);
  });

  it('takes its new place at once when the element it rides does not glide', async () => {
    const {handle, area, column, content, after} = rideSetup();
    const swap = holdLayoutSwap(handle, content);
    after();
    playLayoutSwap(swap!, {
      host: area,
      copy: p => ({opacity: 1 - p}),
      rideWith: {element: column, travel: {x: 212, y: 0}},
      incoming: [],
    });
    await Promise.resolve();
    const ride = played.find(entry => entry.element === swap!.copy);
    expect(ride?.keyframes[0].translate).toBe('-212px 0px');
    expect(ride?.keyframes.at(-1)?.translate).toBe('-212px 0px');
  });
});

describe('the glide in a right-to-left document', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("moves a follower by its container's inline-start edge, even with its own direction", async () => {
    document.body.innerHTML = `
      <div id="area" style="direction: rtl">
        <div id="rail"></div>
        <div id="column" style="direction: ltr"></div>
      </div>`;
    const area = document.getElementById('area') as HTMLElement;
    const rail = document.getElementById('rail') as HTMLElement;
    const column = document.getElementById('column') as HTMLElement;
    let railWidth = 260;
    // The rail sits on the right; the column keeps its left edge at 0.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        if (this === area) {
          return DOMRect.fromRect({x: 0, y: 0, width: 1000, height: 600});
        }
        if (this === rail) {
          return DOMRect.fromRect({
            x: 1000 - railWidth,
            y: 0,
            width: railWidth,
            height: 600,
          });
        }
        if (this === column) {
          return DOMRect.fromRect({
            x: 0,
            y: 0,
            width: 1000 - railWidth,
            height: 600,
          });
        }
        return DOMRect.fromRect({x: 0, y: 0, width: 0, height: 0});
      },
    );
    const handle = createAnimatedLayout(() => area);
    const change = reportLayoutChange(handle, {current: rail});
    change.measureBefore();
    railWidth = 48;
    change.animate();
    await Promise.resolve();
    const glide = played.find(entry => entry.element === column);
    // Its right edge moved from 740 to 952: it starts 212 px back.
    expect(glide?.keyframes[0].translate).toBe('-212px 0px');
    expect(glide?.keyframes.at(-1)?.translate).toBe('0px 0px');
  });
});

describe('more swap layout cases', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lays a fractional-size copy on its old place: the layout size rounds', () => {
    const {handle, content, host} = setup();
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(
      function (this: HTMLElement) {
        return Math.round(parseFloat(this.style.width) || 0);
      },
    );
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(
      function (this: HTMLElement) {
        return Math.round(parseFloat(this.style.height) || 0);
      },
    );
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        if (this === content) {
          return DOMRect.fromRect({x: 0, y: 687, width: 420, height: 20.4});
        }
        if (this.hasAttribute('inert')) {
          // Unscaled: drawn at the requested size.
          return DOMRect.fromRect({
            x: 0,
            y: 0,
            width: parseFloat(this.style.width),
            height: parseFloat(this.style.height),
          });
        }
        return DOMRect.fromRect({x: 0, y: 0, width: 0, height: 0});
      },
    );
    const swap = holdLayoutSwap(handle, content);
    playLayoutSwap(swap!, {host, copy: travel, incoming: []});
    expect(swap!.copy.style.top).toBe('687px');
    expect(swap!.copy.style.height).toBe('20.4px');
  });

  it('plays frames on the same motion with no copy, opacity-only under DR2', () => {
    const {handle} = setup();
    const title = document.getElementById('title') as HTMLElement;
    playLayoutFrames(handle, [
      {
        element: title,
        frames: p => ({boxShadow: `${100 * (1 - p)}px 0px 0px 0px red`}),
      },
    ]);
    const spring = played.find(entry => entry.element === title);
    expect(spring?.keyframes[0].boxShadow).toBe('100px 0px 0px 0px red');
    expect(spring?.keyframes.at(-1)?.boxShadow).toBe('0px 0px 0px 0px red');
    expect(spring?.startTime).toBe(500);
    // Released when the motion ends: the element shows its own styles again.
    const cancel = vi.fn();
    played = [];
    const original = Element.prototype.animate;
    Element.prototype.animate = function (
      this: Element,
      ...args: Parameters<typeof original>
    ) {
      const animation = original.apply(this, args);
      (animation as unknown as {cancel: () => void}).cancel = cancel;
      return animation;
    };
    playLayoutFrames(handle, [{element: title, frames: () => ({opacity: 1})}]);
    played[0].finish?.();
    expect(cancel).toHaveBeenCalled();
    Element.prototype.animate = original;
    played = [];
    played = [];
    media['(prefers-reduced-motion: reduce)'] = true;
    media['(pointer: coarse)'] = true;
    playLayoutFrames(handle, [{element: title, frames: () => ({scale: '2'})}]);
    expect(played[0].keyframes).toEqual([{opacity: 0}, {opacity: 1}]);
    played = [];
    media['(pointer: coarse)'] = false;
    playLayoutFrames(handle, [{element: title, frames: () => ({scale: '2'})}]);
    expect(played).toEqual([]);
  });
});

describe('a copy laid outside its ancestors', () => {
  it('keeps what it inherited from them where the host passes something else', () => {
    const {handle, content} = setup();
    const area = document.getElementById('area') as HTMLElement;
    // The element inherits 13 px type and a custom property from an ancestor
    // between it and the host; the host passes 16 px and the same color.
    const computed: Record<string, Record<string, string>> = {
      content: {'font-size': '13px', color: 'rgb(0, 0, 0)', '--row-gap': '6px'},
      area: {'font-size': '16px', color: 'rgb(0, 0, 0)'},
    };
    const real = window.getComputedStyle;
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      (element: Element): CSSStyleDeclaration => {
        const style = real(element);
        const values = computed[element.id];
        if (values == null) {
          return style;
        }
        const custom = Object.keys(values).filter(name =>
          name.startsWith('--'),
        );
        // Only what the copy reads: values by name, and the custom ones.
        return Object.assign(Object.create(style) as CSSStyleDeclaration, {
          getPropertyValue: (name: string) => values[name] ?? '',
          ...Object.fromEntries(custom.map((name, index) => [index, name])),
          length: custom.length,
        });
      },
    );
    const swap = holdLayoutSwap(handle, content);
    playLayoutSwap(swap!, {host: area, copy: travel, incoming: []});
    vi.restoreAllMocks();
    expect(swap!.copy.style.fontSize).toBe('13px');
    expect(swap!.copy.style.getPropertyValue('--row-gap')).toBe('6px');
    // What the host already passes is not written again.
    expect(swap!.copy.style.color).toBe('');
  });

  it('carries a unitless line-height as its factor, not as pixels', () => {
    const {handle, content} = setup();
    const area = document.getElementById('area') as HTMLElement;
    // The computed style says 18.85px; the typed style map says 1.45.
    const real = window.getComputedStyle;
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      (element: Element): CSSStyleDeclaration => {
        const style = real(element);
        const values: Record<string, string> =
          element === content
            ? {'line-height': '18.85px'}
            : element === area
              ? {'line-height': 'normal'}
              : {};
        return Object.assign(Object.create(style) as CSSStyleDeclaration, {
          getPropertyValue: (name: string) => values[name] ?? '',
          length: 0,
        });
      },
    );
    (content as unknown as {computedStyleMap: () => unknown}).computedStyleMap =
      () => ({
        get: (name: string) =>
          name === 'line-height' ? {unit: 'number', value: 1.45} : undefined,
      });
    const swap = holdLayoutSwap(handle, content);
    playLayoutSwap(swap!, {host: area, copy: travel, incoming: []});
    vi.restoreAllMocks();
    expect(swap!.copy.style.lineHeight).toBe('1.45');
  });

  it('carries a line-height factor without a typed style map, also where the host passes the same number', () => {
    const {handle, content} = setup();
    const area = document.getElementById('area') as HTMLElement;
    const computed = new Map<Element, Record<string, string>>([
      // 13 px type at 1.5 inside a 16 px area at 1.25: the factor differs.
      [content, {'font-size': '13px', 'line-height': '19.5px'}],
      [area, {'font-size': '16px', 'line-height': '20px'}],
    ]);
    const real = window.getComputedStyle;
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      (element: Element): CSSStyleDeclaration => {
        const values = computed.get(element);
        if (values == null) {
          return real(element);
        }
        return Object.assign(
          Object.create(real(element)) as CSSStyleDeclaration,
          {getPropertyValue: (name: string) => values[name] ?? '', length: 0},
        );
      },
    );
    const swap = holdLayoutSwap(handle, content);
    playLayoutSwap(swap!, {host: area, copy: travel, incoming: []});
    expect(swap!.copy.style.lineHeight).toBe('1.5');
    // The host passes the same factor, perhaps as a length: still written.
    computed.set(area, {'font-size': '16px', 'line-height': '24px'});
    const again = holdLayoutSwap(handle, content);
    playLayoutSwap(again!, {host: area, copy: travel, incoming: []});
    vi.restoreAllMocks();
    expect(again!.copy.style.lineHeight).toBe('1.5');
  });

  it('keeps a length line-height as its pixels when the typed style map reports a length', () => {
    const {handle, content} = setup();
    const area = document.getElementById('area') as HTMLElement;
    const computed = new Map<Element, Record<string, string>>([
      // The host passes the same 20px as a factor (1.25 at 16px).
      [content, {'font-size': '13px', 'line-height': '20px'}],
      [area, {'font-size': '16px', 'line-height': '20px'}],
    ]);
    const real = window.getComputedStyle;
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      (element: Element): CSSStyleDeclaration => {
        const values = computed.get(element);
        if (values == null) {
          return real(element);
        }
        return Object.assign(
          Object.create(real(element)) as CSSStyleDeclaration,
          {getPropertyValue: (name: string) => values[name] ?? '', length: 0},
        );
      },
    );
    (content as unknown as {computedStyleMap: () => unknown}).computedStyleMap =
      () => ({
        get: (name: string) =>
          name === 'line-height' ? {unit: 'px', value: 20} : undefined,
      });
    const swap = holdLayoutSwap(handle, content);
    playLayoutSwap(swap!, {host: area, copy: travel, incoming: []});
    vi.restoreAllMocks();
    expect(swap!.copy.style.lineHeight).toBe('20px');
  });
});

describe('ending a swap', () => {
  it('leaves the text of a style sheet or a textarea in place when its text fades', () => {
    const {handle, content, host} = setup();
    content.insertAdjacentHTML(
      'beforeend',
      '<style>.note { color: red; }</style><textarea>Draft</textarea>',
    );
    const swap = holdLayoutSwap(handle, content);
    playLayoutSwap(swap!, {
      host,
      copy: travel,
      copyText: p => 1 - p,
      incoming: [],
    });
    expect(swap!.copy.querySelector('style')?.children).toHaveLength(0);
    expect(swap!.copy.querySelector('style')?.textContent).toContain(
      'color: red',
    );
    expect(swap!.copy.querySelector('textarea')?.children).toHaveLength(0);
    expect(swap!.copy.querySelector('textarea')?.value).toBe('Draft');
  });

  it('calls onEnd once when the swap ends', () => {
    const {handle, content, host} = setup();
    const swap = holdLayoutSwap(handle, content);
    const onEnd = vi.fn();
    const end = playLayoutSwap(swap!, {
      host,
      copy: travel,
      incoming: [],
      onEnd,
    });
    played[0].finish?.();
    end();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});
