// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file layerExitCopy.test.ts
 * @input vitest (jsdom), layerExitCopy
 * @output Checks the static copy a closing layer leaves for its close to
 *   play on. It is out of reach and out of the accessibility tree, with no
 *   ids or form names. It is only in the top layer: hidden until a refused
 *   show succeeds, and none without the popover API or past the copy cap. It
 *   sits on the layer's layout box with fractions, and with the transform and
 *   opacity it was drawn with. No keyframes or transitions replay, there is
 *   one copy per layer, and it is scrolled where the layer was. A copy taken
 *   first stays out of the document until it is placed, and reads no
 *   inherited values when it goes beside the layer.
 * @position Testing; the browser proofs are in
 *   __tests__/layerExitCopy.interaction.browser.spec.ts
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {placeLayerExitCopy, takeLayerExitCopy} from './layerExitCopy';

const BOX = {left: 41, top: 204, width: 320, height: 253};
const ATTRIBUTE = 'data-test-exit';

/** A layer drawn on BOX (jsdom has no layout). */
function layer(): HTMLElement {
  const host = document.createElement('section');
  document.body.appendChild(host);
  const element = document.createElement('div');
  element.id = 'layer';
  element.setAttribute('popover', 'auto');
  element.style.setProperty('position-anchor', '--trigger');
  element.style.setProperty('scale', '0.5 0.4');
  element.style.setProperty('opacity', '0.3');
  element.style.setProperty('transition', 'opacity 1s');
  element.innerHTML =
    '<div id="dialog" role="dialog"><div id="list" class="list"><p>One</p></div></div>';
  host.appendChild(element);
  element.getBoundingClientRect = () => ({
    ...BOX,
    x: BOX.left,
    y: BOX.top,
    right: BOX.left + BOX.width,
    bottom: BOX.top + BOX.height,
    toJSON: () => ({}),
  });
  // Its layout box, which a fixed layer's offset box reports in viewport px.
  for (const [name, value] of [
    ['offsetLeft', BOX.left],
    ['offsetTop', BOX.top],
    ['offsetWidth', BOX.width],
    ['offsetHeight', BOX.height],
  ] as const) {
    Object.defineProperty(element, name, {configurable: true, value});
  }
  return element;
}

describe('placeLayerExitCopy', () => {
  const originalShow = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'showPopover',
  );
  /** The popover API, stood in for (jsdom has none), or taken away. */
  const popoverApi = (present: boolean) => {
    if (present) {
      const show = vi.fn();
      Object.defineProperty(HTMLElement.prototype, 'showPopover', {
        configurable: true,
        writable: true,
        value: show,
      });
      return show;
    }
    Reflect.deleteProperty(HTMLElement.prototype, 'showPopover');
    return null;
  };
  afterEach(() => {
    if (originalShow == null) {
      Reflect.deleteProperty(HTMLElement.prototype, 'showPopover');
    } else {
      Object.defineProperty(HTMLElement.prototype, 'showPopover', originalShow);
    }
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  const place = (element: HTMLElement) => {
    const copy = placeLayerExitCopy(element, ATTRIBUTE);
    if (copy == null) {
      throw new Error('no copy');
    }
    return copy;
  };

  it('puts a static copy right after the layer, out of reach and out of the accessibility tree', () => {
    popoverApi(true);
    const element = layer();
    const copy = place(element);
    expect(copy.previousElementSibling).toBe(element);
    expect(copy.hasAttribute(ATTRIBUTE)).toBe(true);
    expect(copy.getAttribute('aria-hidden')).toBe('true');
    expect(copy.hasAttribute('inert')).toBe(true);
    expect(copy.id).toBe('');
    expect(copy.querySelectorAll('[id]')).toHaveLength(0);
    // The content is the layer's, classes and all.
    expect(copy.querySelector('.list')?.textContent).toBe('One');
    expect(copy.style.getPropertyValue('pointer-events')).toBe('none');
  });

  it('lays the copy of a layer inside other layers after the outermost one, with what it inherited there', () => {
    popoverApi(true);
    const sheet = document.createElement('style');
    sheet.textContent =
      '#layer { --menu-tone: rgb(1, 2, 3); color-scheme: dark; }';
    document.head.append(sheet);
    const element = layer();
    const host = element.parentElement as HTMLElement;
    const outer = document.createElement('div');
    outer.setAttribute('popover', 'auto');
    const inner = document.createElement('div');
    inner.setAttribute('popover', 'manual');
    host.append(outer);
    outer.append(inner);
    inner.append(element);
    const copy = place(element);
    sheet.remove();
    // Outside both: a closing layer around it would hide it.
    expect(copy.parentElement).toBe(host);
    expect(copy.previousElementSibling).toBe(outer);
    // The copy has no id, so only the written values carry the tone and the
    // scheme.
    expect(copy.style.getPropertyValue('--menu-tone')).toBe('rgb(1, 2, 3)');
    expect(copy.style.getPropertyValue('color-scheme')).toBe('dark');
  });

  it("reads what the outer layer's parent passes before it inserts the copy there, so no style read follows that write", () => {
    popoverApi(true);
    const element = layer();
    const host = element.parentElement as HTMLElement;
    const outer = document.createElement('div');
    outer.setAttribute('popover', 'auto');
    host.append(outer);
    outer.append(element);
    const order: string[] = [];
    const read = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((node, pseudo) => {
      if (node === host) {
        order.push('read the host');
      }
      return read(node, pseudo);
    });
    const insert = outer.after.bind(outer);
    outer.after = (...nodes: (Node | string)[]) => {
      order.push('insert the copy');
      insert(...nodes);
    };
    const copy = place(element);
    expect(copy.parentElement).toBe(host);
    expect(order).toContain('read the host');
    expect(order.at(-1)).toBe('insert the copy');
  });

  it('takes the copy out of every form and radio group, so the live selection stays', () => {
    popoverApi(true);
    const element = layer();
    element.insertAdjacentHTML(
      'beforeend',
      '<input type="radio" name="size" value="s"><input type="radio" name="size" value="m" checked><input name="note" form="notes">',
    );
    const live = element.querySelector<HTMLInputElement>('input[value="m"]')!;
    const copy = place(element);
    expect(copy.querySelectorAll('[name]')).toHaveLength(0);
    // Every cloned control names a form that cannot exist, so none has an
    // owner, whatever the copy stands inside.
    expect(
      [...copy.querySelectorAll('input')].map(node =>
        node.getAttribute('form'),
      ),
    ).toEqual(['', '', '']);
    expect(live.checked).toBe(true);
    expect(live.getAttribute('name')).toBe('size');
  });

  it('leaves a form around the layer valid while the copy stands in it', () => {
    popoverApi(true);
    const element = layer();
    const form = document.createElement('form');
    element.parentElement!.append(form);
    form.append(element);
    element.insertAdjacentHTML(
      'beforeend',
      '<input type="text" required><select required><option value=""></option></select><textarea required></textarea>',
    );
    // The live layer's own fields are the form's while it is open.
    expect(form.checkValidity()).toBe(false);
    const copy = place(element);
    // The copy stands right after the layer, so inside the form; its
    // controls belong to no form, and the live fields are unchanged.
    expect(copy.closest('form')).toBe(form);
    expect([...form.elements]).toHaveLength(3);
    for (const node of copy.querySelectorAll('input, select, textarea')) {
      expect((node as HTMLInputElement).form).toBeNull();
    }
  });

  it('shows the copy of a layer inside again after the copy of the layer around it, so it stays on top', () => {
    // The popover API, with an open state the top-layer order is read from.
    const shown: Element[] = [];
    Object.defineProperty(HTMLElement.prototype, 'showPopover', {
      configurable: true,
      writable: true,
      value(this: HTMLElement) {
        this.setAttribute('data-open', '');
        shown.push(this);
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'hidePopover', {
      configurable: true,
      writable: true,
      value(this: HTMLElement) {
        this.removeAttribute('data-open');
      },
    });
    const matches = HTMLElement.prototype.matches;
    vi.spyOn(HTMLElement.prototype, 'matches').mockImplementation(function (
      this: HTMLElement,
      selector: string,
    ) {
      return selector === ':popover-open'
        ? this.hasAttribute('data-open')
        : matches.call(this, selector);
    });
    try {
      const outer = layer();
      const inner = layer();
      inner.id = 'inner';
      outer.querySelector('#list')!.append(inner);
      const innerCopy = place(inner);
      const outerCopy = place(outer);
      expect(shown.slice(-2)).toEqual([outerCopy, innerCopy]);
      expect(innerCopy.hasAttribute('data-open')).toBe(true);
    } finally {
      Reflect.deleteProperty(HTMLElement.prototype, 'hidePopover');
    }
  });

  it('keeps one copy per layer: a second takes only that layer\u2019s first away', () => {
    popoverApi(true);
    const element = layer();
    // Another layer beside it, closing too, with its own copy.
    const other = layer();
    element.parentElement!.append(other);
    const otherCopy = place(other);
    const first = place(element);
    const second = place(element);
    expect(first.isConnected).toBe(false);
    expect(second.isConnected).toBe(true);
    expect(otherCopy.isConnected).toBe(true);
    expect(document.querySelectorAll(`[${ATTRIBUTE}]`)).toHaveLength(2);
  });

  it('takes the same copy out of the document, and places it where it would place it, taking the layer\u2019s previous copy away', () => {
    const show = popoverApi(true);
    if (show == null) {
      throw new Error('no popover API');
    }
    const element = layer();
    const first = place(element);
    const taken = takeLayerExitCopy(element, ATTRIBUTE);
    if (taken == null) {
      throw new Error('no copy');
    }
    const {copy} = taken;
    // Taken, not placed: out of the document, the first copy still shown.
    expect(copy.isConnected).toBe(false);
    expect(first.isConnected).toBe(true);
    expect(copy.hasAttribute(ATTRIBUTE)).toBe(true);
    expect(copy.hasAttribute('inert')).toBe(true);
    expect(copy.getAttribute('popover')).toBe('manual');
    expect(copy.style.getPropertyValue('left')).toBe(`${BOX.left}px`);
    taken.place();
    expect(first.isConnected).toBe(false);
    expect(copy.previousElementSibling).toBe(element);
    expect(show).toHaveBeenLastCalledWith();
    expect(show.mock.contexts.at(-1)).toBe(copy);
    expect(document.querySelectorAll(`[${ATTRIBUTE}]`)).toHaveLength(1);
  });

  it('reads no inherited values for a copy taken to go beside the layer, and carries them for one laid after an outer layer', () => {
    popoverApi(true);
    const sheet = document.createElement('style');
    sheet.textContent =
      '#layer { --menu-tone: rgb(1, 2, 3); color-scheme: dark; }';
    document.head.append(sheet);
    const element = layer();
    const beside = takeLayerExitCopy(element, ATTRIBUTE);
    const host = element.parentElement as HTMLElement;
    const outer = document.createElement('div');
    outer.setAttribute('popover', 'auto');
    host.append(outer);
    outer.append(element);
    const after = takeLayerExitCopy(element, ATTRIBUTE);
    sheet.remove();
    if (beside == null || after == null) {
      throw new Error('no copy');
    }
    // Beside the layer the copy inherits what the layer inherits: nothing is
    // written for it.
    expect(beside.copy.style.getPropertyValue('--menu-tone')).toBe('');
    expect(beside.copy.style.getPropertyValue('color-scheme')).toBe('');
    after.place();
    expect(after.copy.previousElementSibling).toBe(outer);
    expect(after.copy.style.getPropertyValue('--menu-tone')).toBe(
      'rgb(1, 2, 3)',
    );
    expect(after.copy.style.getPropertyValue('color-scheme')).toBe('dark');
  });

  it('takes no copy without the popover API: the close is immediate', () => {
    popoverApi(false);
    expect(takeLayerExitCopy(layer(), ATTRIBUTE)).toBeNull();
  });

  it('stands on the layer\u2019s box, free of the live layer\u2019s anchoring, drawn with its inline scale and opacity', () => {
    popoverApi(true);
    const element = layer();
    const copy = place(element);
    expect(copy.style.getPropertyValue('position')).toBe('fixed');
    expect(copy.style.getPropertyValue('left')).toBe('41px');
    expect(copy.style.getPropertyValue('top')).toBe('204px');
    expect(copy.style.getPropertyValue('width')).toBe('320px');
    expect(copy.style.getPropertyValue('height')).toBe('253px');
    for (const property of ['position-anchor', 'transition']) {
      expect(copy.style.getPropertyValue(property), property).toBe('');
    }
    // A layer drawn with these and no animation closes from a copy drawn the
    // same, not at full size and full opacity.
    expect(copy.style.getPropertyValue('scale')).toBe('0.5 0.4');
    expect(copy.style.getPropertyValue('opacity')).toBe('0.3');
    expect(copy.style.getPropertyValue('animation-name')).toBe('none');
    // No alignment against the anchor it left (a phone menu's anchor-center).
    expect(copy.style.getPropertyValue('justify-self')).toBe('normal');
    expect(copy.style.getPropertyValue('align-self')).toBe('normal');
  });

  it('holds where a layer still entering was drawn: its layout box with fractions, with the transform it was drawn with', () => {
    popoverApi(true);
    const element = layer();
    // Mid-entrance: drawn at half size about its top-left corner, at a
    // fractional position its whole-pixel offsets round away. Like a real
    // engine, the box is laid out on the 1/64 px grid.
    const laidOut = {
      left: 40.390625,
      top: 120.59375,
      width: 320.40625,
      height: 253,
    };
    const drawn = {...laidOut, width: 160.203125, height: 126.5};
    // jsdom keeps no `!important`: the read's override shows as `none`.
    const settled = () => element.style.getPropertyValue('scale') === 'none';
    element.getBoundingClientRect = () => {
      const box = settled() ? laidOut : drawn;
      return {
        ...box,
        x: box.left,
        y: box.top,
        right: box.left + box.width,
        bottom: box.top + box.height,
        toJSON: () => ({}),
      };
    };
    for (const [name, value] of [
      ['offsetLeft', 40],
      ['offsetTop', 121],
      ['offsetWidth', 320],
      ['offsetHeight', 253],
    ] as const) {
      Object.defineProperty(element, name, {configurable: true, value});
    }
    element.getAnimations = () =>
      [
        {effect: {target: element, pseudoElement: null}},
      ] as unknown as Animation[];
    const presented: Record<string, string> = {
      scale: '0.5',
      'transform-origin': '0px 0px',
      width: '320.40625px',
      height: '253px',
      'box-sizing': 'border-box',
    };
    const original = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((node, pseudo) =>
      node === element
        ? ({
            getPropertyValue: (property: string) =>
              property === 'scale' && settled()
                ? 'none'
                : (presented[property] ?? ''),
            transitionProperty: 'all',
            transitionDuration: '0s',
          } as unknown as CSSStyleDeclaration)
        : original(node, pseudo),
    );
    const copy = place(element);
    // Laid out where the layer is, at its used size, fractions kept...
    expect(copy.style.getPropertyValue('left')).toBe('40.390625px');
    expect(copy.style.getPropertyValue('top')).toBe('120.59375px');
    expect(copy.style.getPropertyValue('width')).toBe('320.40625px');
    expect(copy.style.getPropertyValue('height')).toBe('253px');
    // ...and drawn as it was drawn.
    expect(copy.style.getPropertyValue('scale')).toBe('0.5');
    expect(copy.style.getPropertyValue('transform-origin')).toBe('0px 0px');
    // The read leaves the live layer's own transform as it was.
    expect(element.style.getPropertyValue('scale')).toBe('0.5 0.4');
  });

  it('shows the copy only in the top layer, as a manual popover, with no z-index', () => {
    const show = popoverApi(true)!;
    const element = layer();
    const copy = place(element);
    expect(copy.getAttribute('popover')).toBe('manual');
    expect(show).toHaveBeenCalledTimes(1);
    expect(show.mock.contexts[0]).toBe(copy);
    expect(copy.style.getPropertyValue('z-index')).toBe('');
    expect(copy.style.getPropertyValue('display')).toBe('');
    // The UA's popover inset does not over-constrain the box.
    expect(copy.style.getPropertyValue('right')).toBe('auto');
    expect(copy.style.getPropertyValue('bottom')).toBe('auto');
  });

  it('waits, hidden, when the browser refuses the show during the closing toggle, and shows once it is over', async () => {
    const show = popoverApi(true)!;
    // Android Chromium 158 refuses a show inside another popover's toggle.
    show.mockImplementationOnce(() => {
      throw new DOMException(
        'Invalid to show a popover during another show operation',
        'InvalidStateError',
      );
    });
    const element = layer();
    let copy: HTMLElement | null = null;
    expect(() => {
      copy = place(element);
    }).not.toThrow();
    // Not shown yet, and nothing stands in for the top layer: the UA keeps a
    // popover that is not open out of view.
    expect(copy!.isConnected).toBe(true);
    expect(copy!.style.getPropertyValue('display')).toBe('');
    expect(copy!.style.getPropertyValue('z-index')).toBe('');
    expect(show).toHaveBeenCalledTimes(1);
    // The script that closed the layer is over: shown.
    await Promise.resolve();
    expect(show).toHaveBeenCalledTimes(2);
    expect(copy!.isConnected).toBe(true);
  });

  it('tries again in the next frame, and takes the copy away if the browser still refuses', async () => {
    const show = popoverApi(true)!;
    show.mockImplementation(() => {
      throw new DOMException('refused', 'InvalidStateError');
    });
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frames.push(callback);
      return frames.length;
    });
    const element = layer();
    const copy = place(element);
    await Promise.resolve();
    expect(frames).toHaveLength(1);
    frames[0](0);
    expect(show).toHaveBeenCalledTimes(3);
    expect(copy.isConnected).toBe(false);
  });

  it('does not reach for the top layer for a copy already taken away', async () => {
    const show = popoverApi(true)!;
    show.mockImplementationOnce(() => {
      throw new DOMException('refused', 'InvalidStateError');
    });
    const copy = place(layer());
    copy.remove();
    await Promise.resolve();
    expect(show).toHaveBeenCalledTimes(1);
  });

  it('places no copy without the popover API: the close is immediate', () => {
    popoverApi(false);
    const element = layer();
    expect(placeLayerExitCopy(element, ATTRIBUTE)).toBeNull();
    expect(document.querySelector(`[${ATTRIBUTE}]`)).toBeNull();
  });

  it('starts as the layer looks: values its running animations hold are written onto the copy', () => {
    popoverApi(true);
    const element = layer();
    const dialog = element.querySelector<HTMLElement>('[role="dialog"]')!;
    const list = element.querySelector<HTMLElement>('.list')!;
    // A compositor curve on the layer and one on its dialog; the list has none.
    element.getAnimations = () =>
      [element, dialog].map(target => ({
        effect: {target, pseudoElement: null},
      })) as unknown as Animation[];
    const presented = new Map<Element, Record<string, string>>([
      [element, {opacity: '0.7', 'transform-origin': '160px 0px'}],
      [dialog, {translate: '0px 12px', opacity: '0.5'}],
    ]);
    const original = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((node, pseudo) => {
      const values = presented.get(node);
      if (values == null) {
        return original(node, pseudo);
      }
      return {
        getPropertyValue: (property: string) => values[property] ?? '',
      } as CSSStyleDeclaration;
    });
    const copy = place(element);
    expect(copy.style.getPropertyValue('opacity')).toBe('0.7');
    expect(copy.style.getPropertyValue('transform-origin')).toBe('160px 0px');
    const copyDialog = copy.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(copyDialog.style.getPropertyValue('translate')).toBe('0px 12px');
    expect(copyDialog.style.getPropertyValue('opacity')).toBe('0.5');
    // Nothing is written where nothing runs.
    expect(
      copy.querySelector<HTMLElement>('.list')!.getAttribute('style'),
    ).toBe(list.getAttribute('style'));
  });

  it.each(['iframe', 'object', 'embed', 'video', 'audio'])(
    'copies a %s with no source, so nothing loads or plays again',
    tag => {
      popoverApi(true);
      const element = layer();
      const live = document.createElement(tag);
      live.className = 'media';
      live.setAttribute('src', 'about:blank');
      live.setAttribute('data', 'about:blank');
      live.setAttribute('autoplay', '');
      element.querySelector('.list')!.appendChild(live);
      const copy = place(element);
      const copied = copy.querySelector('.list > .media')!;
      expect(copied.localName).toBe(tag);
      for (const name of ['src', 'data', 'autoplay']) {
        expect(copied.hasAttribute(name)).toBe(false);
      }
      // The live one is untouched.
      expect(element.querySelector(tag)).toBe(live);
      expect(live.getAttribute('src')).toBe('about:blank');
    },
  );

  it('places no copy for content holding a canvas that reads back empty: the close is immediate', () => {
    popoverApi(true);
    const element = layer();
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    element.querySelector('.list')!.appendChild(canvas);
    // A canvas whose pixels read back empty: a WebGL one without
    // preserveDrawingBuffer, or a tainted one.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: () => {},
      getImageData: () => ({data: new Uint8ClampedArray(64)}),
    } as unknown as CanvasRenderingContext2D);
    expect(placeLayerExitCopy(element, ATTRIBUTE)).toBeNull();
    expect(document.querySelector(`[${ATTRIBUTE}]`)).toBeNull();
  });

  it('carries no test ids, label targets or autofocus, so a query or the focus finds only the live layer', () => {
    popoverApi(true);
    const element = layer();
    element.setAttribute('data-testid', 'menu');
    const label = document.createElement('label');
    label.htmlFor = 'live-field';
    const field = document.createElement('input');
    field.id = 'live-field';
    field.autofocus = true;
    field.setAttribute('data-testid', 'field');
    element.querySelector('.list')!.append(label, field);
    const copy = place(element);
    expect(copy.hasAttribute('data-testid')).toBe(false);
    expect(copy.querySelector('[data-testid]')).toBeNull();
    expect(copy.querySelector('label')!.hasAttribute('for')).toBe(false);
    expect(copy.querySelector('input')!.hasAttribute('autofocus')).toBe(false);
    expect(document.querySelectorAll('[data-testid="field"]')).toHaveLength(1);
  });

  it('restores scroll positions at once, whatever the scroller\u2019s own scroll-behavior', () => {
    popoverApi(true);
    const element = layer();
    const list = element.querySelector<HTMLElement>('.list')!;
    list.style.setProperty('scroll-behavior', 'smooth');
    list.scrollTop = 120;
    const original = Object.getOwnPropertyDescriptor(
      Element.prototype,
      'scrollTo',
    );
    const scrollTo = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollTo', {
      configurable: true,
      writable: true,
      value: scrollTo,
    });
    try {
      const copy = place(element);
      expect(scrollTo).toHaveBeenCalledWith({
        top: 120,
        left: 0,
        behavior: 'instant',
      });
      expect(scrollTo.mock.contexts).toContain(copy.querySelector('.list'));
    } finally {
      if (original == null) {
        Reflect.deleteProperty(Element.prototype, 'scrollTo');
      } else {
        Object.defineProperty(Element.prototype, 'scrollTo', original);
      }
    }
  });

  it('keeps scrolled content where it was scrolled to', () => {
    popoverApi(true);
    const element = layer();
    const list = element.querySelector<HTMLElement>('.list')!;
    list.scrollTop = 120;
    const copy = place(element);
    expect(copy.querySelector<HTMLElement>('.list')!.scrollTop).toBe(120);
  });

  it('keeps a scrolling layer\u2019s own overflow and its own scroll position', () => {
    popoverApi(true);
    const element = layer();
    element.style.setProperty('overflow-y', 'auto');
    element.scrollTop = 80;
    const copy = place(element);
    expect(copy.style.getPropertyValue('overflow-y')).toBe('auto');
    expect(copy.scrollTop).toBe(80);
  });

  it('takes a form-associated custom element out of every form, as it does a native control', () => {
    popoverApi(true);
    if (customElements.get('x-exit-form-field') == null) {
      customElements.define(
        'x-exit-form-field',
        class extends HTMLElement {
          static formAssociated = true;
        },
      );
    }
    const element = layer();
    element
      .querySelector('.list')!
      .insertAdjacentHTML(
        'beforeend',
        '<x-exit-form-field></x-exit-form-field><x-exit-plain></x-exit-plain>',
      );
    const copy = place(element);
    expect(copy.querySelector('x-exit-form-field')?.getAttribute('form')).toBe(
      '',
    );
    expect(copy.querySelector('x-exit-plain')?.hasAttribute('form')).toBe(
      false,
    );
  });

  it('keeps its descendants\u2019 keyframes from starting again, and writes nothing where none are set', () => {
    popoverApi(true);
    const element = layer();
    element
      .querySelector<HTMLElement>('[role="dialog"]')!
      .style.setProperty('animation-name', 'rise');
    const copy = place(element);
    expect(
      copy
        .querySelector<HTMLElement>('[role="dialog"]')!
        .style.getPropertyValue('animation-name'),
    ).toBe('none');
    expect(
      copy.querySelector<HTMLElement>('.list')!.getAttribute('style'),
    ).toBe(element.querySelector('.list')!.getAttribute('style'));
  });

  it('stops the transitions the layer and its descendants run, so none replays its entry in the copy', () => {
    popoverApi(true);
    const element = layer();
    element.style.setProperty('transition-duration', '0.2s');
    element
      .querySelector<HTMLElement>('[role="dialog"]')!
      .style.setProperty('transition-duration', '0s, 0.3s');
    const copy = place(element);
    expect(copy.style.getPropertyValue('transition')).toBe('none');
    expect(
      copy
        .querySelector<HTMLElement>('[role="dialog"]')!
        .style.getPropertyValue('transition'),
    ).toBe('none');
    // Nothing is written where no transition runs.
    expect(
      copy.querySelector<HTMLElement>('.list')!.getAttribute('style'),
    ).toBe(element.querySelector('.list')!.getAttribute('style'));
  });

  it('places no copy for content past the copy cap, as the swap does: the close is immediate', () => {
    popoverApi(true);
    const element = layer();
    element.querySelector('.list')!.innerHTML = '<i></i>'.repeat(1600);
    expect(placeLayerExitCopy(element, ATTRIBUTE)).toBeNull();
    expect(document.querySelector(`[${ATTRIBUTE}]`)).toBeNull();
  });
});
