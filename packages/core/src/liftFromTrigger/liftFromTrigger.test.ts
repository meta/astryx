// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file liftFromTrigger.test.ts
 * @input vitest (jsdom), the lift, stand-ins for the popover API and for
 *   layout (jsdom has neither) and a spy on the input hold
 * @output Checks the lift's bookkeeping in the page: while up it adds the
 *   layer and one placeholder whatever the source holds, and nothing at
 *   rest; the source keeps its place among its siblings; a drop or an
 *   unmount puts back exactly what the source had inline and takes the rest
 *   away; nothing of it (an element, a document listener, a timer) outlives
 *   it over repeated lifts; the gutter it reads; the holds it takes; taps on
 *   its backdrop. And the zoom's copy (liftCopy): one copy of the source's
 *   picture in the caller's host at the source's box while the source hides
 *   in place, and a drop that leaves the page as it was
 * @position Testing; the motion, the top layer and the counts in real
 *   engines are proven in __tests__/liftFromTrigger.interaction.browser.spec.ts
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as inputHold from '../Layer/inputHold';
import {
  createLiftFromTrigger,
  type LiftFromTriggerOptions,
  liftCopy,
} from './liftFromTrigger';

vi.mock('../Layer/inputHold', async importOriginal => ({
  ...(await importOriginal<typeof inputHold>()),
  holdInput: vi.fn(() => () => {}),
}));

const {holdInput} = inputHold;

const SPRING = {response: 0.3, dampingRatio: 1};

function options(
  overrides: Partial<LiftFromTriggerOptions> = {},
): LiftFromTriggerOptions {
  return {
    motion: {
      lift: SPRING,
      drop: SPRING,
      clear: SPRING,
      shadowIn: SPRING,
      shadowOut: SPRING,
      surfaceIn: SPRING,
      surfaceOut: SPRING,
    },
    scale: {maxScale: 1.15, scaleUpPoints: 26},
    surfaceStartWidth: 44,
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

/** Every listener this test added to the document is gone. */
function expectNoDocumentListeners() {
  for (const [type, live] of documentListeners) {
    expect({type, live: Math.max(live, 0)}).toEqual({type, live: 0});
  }
}

describe('lift', () => {
  it('adds the layer, its shadow and anchor, and one placeholder while lifted, whatever the source holds; the source keeps its place among its siblings', () => {
    const {source, before} = renderList();
    const rest = count();
    const lift = createLiftFromTrigger();
    const result = lift.lift(source, options());
    expect(result).not.toBeNull();
    // 13 elements lifted (the row and its 12), 4 added.
    expect(count()).toBe(rest + 4);
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

  it('an unmount mid-lift ends it at once: no element, document listener or timer left', () => {
    const {source} = renderList();
    const rest = count();
    const lift = createLiftFromTrigger();
    lift.lift(source, options());
    lift.dispose();
    expectInlineAsBefore(source);
    expect(count()).toBe(rest);
    expect(open.size).toBe(0);
    expectNoDocumentListeners();
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
    expectNoDocumentListeners();
    expect(vi.getTimerCount()).toBe(0);
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
    expectNoDocumentListeners();
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
    expect(count()).toBe(rest + 3);
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
      {x: 180, y: 330},
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

describe('liftCopy', () => {
  /**
   * A viewer's host over the page, and a grid of thumbnails: one a button
   * around a picture, one a bare picture with its own inline visibility, one
   * that shows no picture.
   */
  function renderGrid() {
    document.body.innerHTML = `
      <div id="host"></div>
      <ul id="grid">
        <li><button id="thumb" type="button"><img src="https://example.test/a-thumb.jpg" alt="A"></button></li>
        <li><img id="bare" src="https://example.test/b-thumb.jpg" alt="B" style="visibility: visible"></li>
        <li><div id="plain">C</div></li>
      </ul>`;
    const host = document.getElementById('host') as HTMLElement;
    place(host, 0, 0, 390, 844);
    const thumb = document.getElementById('thumb') as HTMLElement;
    thumb.style.borderRadius = '12px';
    place(thumb, 40, 300, 100, 100);
    const bare = document.getElementById('bare') as HTMLElement;
    place(bare, 150, 300, 100, 100);
    const plain = document.getElementById('plain') as HTMLElement;
    place(plain, 260, 300, 100, 100);
    return {host, thumb, bare, plain};
  }

  it("places one copy of the source's picture in the host at the source's box (aspect fill, its corners, inert, hidden from assistive technology); the source hides in place and nothing else is added", () => {
    const {host, thumb} = renderGrid();
    const before = count();
    const copy = liftCopy(thumb, {host});
    expect(copy).not.toBeNull();
    expect(count()).toBe(before + 1);
    const element = copy?.element as HTMLImageElement;
    expect(element.parentElement).toBe(host);
    expect(element.localName).toBe('img');
    expect(element.src).toBe('https://example.test/a-thumb.jpg');
    expect(element.alt).toBe('');
    expect(element.getAttribute('aria-hidden')).toBe('true');
    expect(element.hasAttribute('data-astryx-lift-copy')).toBe(true);
    expect([
      element.style.position,
      element.style.left,
      element.style.top,
      element.style.width,
      element.style.height,
    ]).toEqual(['absolute', '40px', '300px', '100px', '100px']);
    expect(element.style.objectFit).toBe('cover');
    expect(element.style.borderRadius).toBe('12px');
    expect(element.style.pointerEvents).toBe('none');
    expect(copy?.box).toEqual({x: 40, y: 300, width: 100, height: 100});
    // The source hides where it is: it keeps its layout, so no placeholder.
    expect(thumb.style.visibility).toBe('hidden');
    expect(thumb.parentElement?.children).toHaveLength(1);
    copy?.drop();
  });

  it("lays the copy out against the host's own box: its offset, borders and scroll", () => {
    const {host, thumb} = renderGrid();
    place(host, 10, 20, 300, 600);
    Object.defineProperty(host, 'clientLeft', {value: 2, configurable: true});
    Object.defineProperty(host, 'clientTop', {value: 3, configurable: true});
    Object.defineProperty(host, 'scrollLeft', {value: 5, configurable: true});
    Object.defineProperty(host, 'scrollTop', {value: 7, configurable: true});
    const copy = liftCopy(thumb, {host});
    expect([copy?.element.style.left, copy?.element.style.top]).toEqual([
      '33px',
      '284px',
    ]);
    copy?.drop();
  });

  it("takes an image source's own picture, or `src` for a source that shows none", () => {
    const {host, bare, plain} = renderGrid();
    const fromImage = liftCopy(bare, {host, src: 'https://example.test/b.jpg'});
    expect(fromImage?.element.src).toBe('https://example.test/b-thumb.jpg');
    fromImage?.drop();
    const fromSrc = liftCopy(plain, {host, src: 'https://example.test/c.jpg'});
    expect(fromSrc?.element.src).toBe('https://example.test/c.jpg');
    fromSrc?.drop();
  });

  it('a drop takes the copy away and shows the source as it was; a second drop does nothing', () => {
    const {host, thumb, bare} = renderGrid();
    const before = count();
    const copy = liftCopy(thumb, {host});
    const other = liftCopy(bare, {host});
    copy?.drop();
    copy?.drop();
    expect(thumb.style.visibility).toBe('');
    expect(thumb.getAttribute('style')).not.toContain('visibility');
    expect(bare.style.visibility).toBe('hidden');
    other?.drop();
    // Its own inline visibility comes back.
    expect(bare.style.visibility).toBe('visible');
    expect(count()).toBe(before);
    expect(host.children).toHaveLength(0);
  });

  it('two copies of one source: it shows again only when the last of them drops', () => {
    const {host, thumb} = renderGrid();
    const opening = liftCopy(thumb, {host});
    const closing = liftCopy(thumb, {host});
    expect(host.children).toHaveLength(2);
    opening?.drop();
    expect(thumb.style.visibility).toBe('hidden');
    closing?.drop();
    expect(thumb.style.visibility).toBe('');
  });

  it('`attribute` names the mark on the copy', () => {
    const {host, thumb} = renderGrid();
    const copy = liftCopy(thumb, {host, attribute: 'data-lightbox-portal'});
    expect(copy?.element.hasAttribute('data-lightbox-portal')).toBe(true);
    expect(copy?.element.hasAttribute('data-astryx-lift-copy')).toBe(false);
    copy?.drop();
  });

  it('changes nothing for a source that is not in the page or has no box', () => {
    const {host, thumb} = renderGrid();
    const before = count();
    const detached = document.createElement('img');
    place(detached, 0, 0, 100, 100);
    expect(liftCopy(detached, {host})).toBeNull();
    place(thumb, 40, 300, 0, 0);
    expect(liftCopy(thumb, {host})).toBeNull();
    expect(thumb.style.visibility).toBe('');
    expect(count()).toBe(before);
  });
});
