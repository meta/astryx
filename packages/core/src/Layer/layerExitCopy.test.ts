// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file layerExitCopy.test.ts
 * @input vitest (jsdom), layerExitCopy
 * @output Checks the static copy a closing layer leaves for its close to
 *   play on: out of reach and out of the accessibility tree, no ids or form
 *   names, only in the top layer (hidden until a refused show succeeds, none
 *   without the popover API), on the layer's layout box with the transform
 *   it was drawn with, one per layer, scrolled where the layer was
 * @position Testing; the browser proofs are in
 *   __tests__/layerExitCopy.interaction.browser.spec.ts
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {placeLayerExitCopy} from './layerExitCopy';

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

  it('stands on the layer\u2019s box, free of the live layer\u2019s anchoring and motion', () => {
    popoverApi(true);
    const element = layer();
    const copy = place(element);
    expect(copy.style.getPropertyValue('position')).toBe('fixed');
    expect(copy.style.getPropertyValue('left')).toBe('41px');
    expect(copy.style.getPropertyValue('top')).toBe('204px');
    expect(copy.style.getPropertyValue('width')).toBe('320px');
    expect(copy.style.getPropertyValue('height')).toBe('253px');
    for (const property of [
      'position-anchor',
      'scale',
      'opacity',
      'transition',
    ]) {
      expect(copy.style.getPropertyValue(property), property).toBe('');
    }
    expect(copy.style.getPropertyValue('animation-name')).toBe('none');
    // No alignment against the anchor it left (a phone menu's anchor-center).
    expect(copy.style.getPropertyValue('justify-self')).toBe('normal');
    expect(copy.style.getPropertyValue('align-self')).toBe('normal');
  });

  it('holds where a layer still entering was drawn: its layout box, with the transform it was drawn with', () => {
    popoverApi(true);
    const element = layer();
    // Mid-entrance: drawn at half size about its top-left corner, so its
    // drawn rect is not its layout box.
    element.getBoundingClientRect = () => ({
      left: 41,
      top: 204,
      width: 160,
      height: 126.5,
      x: 41,
      y: 204,
      right: 201,
      bottom: 330.5,
      toJSON: () => ({}),
    });
    for (const [name, value] of [
      ['offsetLeft', 41],
      ['offsetTop', 204],
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
      width: '320.4px',
      height: '253px',
      'box-sizing': 'border-box',
    };
    const original = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((node, pseudo) =>
      node === element
        ? ({
            getPropertyValue: (property: string) => presented[property] ?? '',
          } as CSSStyleDeclaration)
        : original(node, pseudo),
    );
    const copy = place(element);
    // Laid out where the layer is, at its used size, fractions kept...
    expect(copy.style.getPropertyValue('left')).toBe('41px');
    expect(copy.style.getPropertyValue('top')).toBe('204px');
    expect(copy.style.getPropertyValue('width')).toBe('320.4px');
    expect(copy.style.getPropertyValue('height')).toBe('253px');
    // ...and drawn as it was drawn.
    expect(copy.style.getPropertyValue('scale')).toBe('0.5');
    expect(copy.style.getPropertyValue('transform-origin')).toBe('0px 0px');
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

  it('keeps scrolled content where it was scrolled to', () => {
    popoverApi(true);
    const element = layer();
    const list = element.querySelector<HTMLElement>('.list')!;
    list.scrollTop = 120;
    const copy = place(element);
    expect(copy.querySelector<HTMLElement>('.list')!.scrollTop).toBe(120);
  });
});
