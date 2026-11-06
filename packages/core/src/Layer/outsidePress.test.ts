// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file outsidePress.test.ts
 * @input isFocusInsideOwnedLayer, isPressInsideOwnedLayer and
 *   watchOutsidePress
 * @output The shared focus-leave test, and the outside-press watch that
 *   closes as a finger outside begins to pan, at a cancel or at a lift
 */

import {fireEvent} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  isFocusInsideOwnedLayer,
  isPressInsideOwnedLayer,
  outsideDismissalCount,
  watchOutsidePress,
} from './outsidePress';

describe('isFocusInsideOwnedLayer', () => {
  function setup() {
    const field = document.createElement('div');
    const input = document.createElement('input');
    field.append(input);
    const layer = document.createElement('div');
    layer.id = 'owned-layer';
    const option = document.createElement('button');
    // A popover nested in the layer (a tooltip on an option) is still in it.
    const nested = document.createElement('div');
    nested.setAttribute('popover', 'manual');
    const nestedButton = document.createElement('button');
    nested.append(nestedButton);
    layer.append(option, nested);
    const outside = document.createElement('button');
    document.body.append(field, layer, outside);
    return {field, input, option, nestedButton, outside};
  }

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('counts the field, the layer and a popover nested in the layer as inside', () => {
    const {field, input, option, nestedButton} = setup();
    expect(isFocusInsideOwnedLayer(input, field, 'owned-layer')).toBe(true);
    expect(isFocusInsideOwnedLayer(option, field, 'owned-layer')).toBe(true);
    expect(isFocusInsideOwnedLayer(nestedButton, field, 'owned-layer')).toBe(
      true,
    );
  });

  it('never matches a layer by an empty id', () => {
    const {field, outside} = setup();
    expect(isPressInsideOwnedLayer([outside], field, '')).toBe(false);
  });

  it('counts anything else, and no target, as outside', () => {
    const {field, outside} = setup();
    expect(isFocusInsideOwnedLayer(outside, field, 'owned-layer')).toBe(false);
    expect(isFocusInsideOwnedLayer(null, field, 'owned-layer')).toBe(false);
  });

  it('finds a layer whose content sits inside a shadow root', () => {
    const host = document.createElement('div');
    host.id = 'owned-layer';
    const root = host.attachShadow({mode: 'open'});
    const option = document.createElement('button');
    root.append(option);
    document.body.append(host);
    expect(isFocusInsideOwnedLayer(option, null, 'owned-layer')).toBe(true);
  });
});

describe('inside tests across realms', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('count a field and layer in a same-origin iframe, whose nodes fail instanceof here', () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const frameDocument = frame.contentDocument!;
    const field = frameDocument.createElement('div');
    const input = frameDocument.createElement('input');
    field.append(input);
    const layer = frameDocument.createElement('div');
    layer.id = 'framed-layer';
    const option = frameDocument.createElement('button');
    layer.append(option);
    frameDocument.body.append(field, layer);
    // The precondition this guards: another realm's nodes are not this
    // window's Node.
    expect(option instanceof Node).toBe(false);

    expect(isFocusInsideOwnedLayer(input, field, 'framed-layer')).toBe(true);
    expect(isFocusInsideOwnedLayer(option, field, 'framed-layer')).toBe(true);
    expect(
      isPressInsideOwnedLayer([option, layer], field, 'framed-layer'),
    ).toBe(true);
    expect(
      isPressInsideOwnedLayer([frameDocument.body], field, 'framed-layer'),
    ).toBe(false);
  });
});

describe('outsideDismissalCount', () => {
  it('counts each layer an outside press closes, and not a press inside', () => {
    const owner = document.createElement('div');
    const outside = document.createElement('div');
    document.body.append(owner, outside);
    const stop = watchOutsidePress(
      owner,
      path => path.includes(owner),
      () => {},
    );
    const before = outsideDismissalCount(document);
    owner.dispatchEvent(new Event('pointerdown', {bubbles: true}));
    owner.dispatchEvent(new Event('pointerup', {bubbles: true}));
    expect(outsideDismissalCount(document)).toBe(before);
    outside.dispatchEvent(new Event('pointerdown', {bubbles: true}));
    outside.dispatchEvent(new Event('pointerup', {bubbles: true}));
    expect(outsideDismissalCount(document)).toBe(before + 1);
    stop();
    owner.remove();
    outside.remove();
  });
});

describe('watchOutsidePress, closing on a pan', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  const touch = (pointerId: number, x = 0, y = 0) => ({
    pointerType: 'touch',
    pointerId,
    clientX: x,
    clientY: y,
    composed: true,
  });

  function setup(root?: Node, closesOnPan = true, doc: Document = document) {
    const owner = doc.createElement('div');
    const layer = doc.createElement('div');
    const item = doc.createElement('button');
    layer.append(item);
    const outside = doc.createElement('button');
    doc.body.append(owner, outside);
    (root ?? doc.body).appendChild(layer);
    const onOutside = vi.fn();
    const stop = watchOutsidePress(
      owner,
      path => path.includes(layer),
      onOutside,
      {closesOnPan, pointerTypes: ['touch'], root},
    );
    return {item, outside, onOutside, stop};
  }

  it('closes as a press that starts outside pans past the pan threshold', () => {
    const {outside, onOutside, stop} = setup();
    fireEvent.pointerDown(outside, touch(1));
    fireEvent.pointerMove(outside, touch(1, 0, 8));
    expect(onOutside).not.toHaveBeenCalled();
    fireEvent.pointerMove(outside, touch(1, 0, 30));
    expect(onOutside).toHaveBeenCalledOnce();
    fireEvent.pointerUp(outside, touch(1, 0, 30));
    expect(onOutside).toHaveBeenCalledOnce();
    stop();
  });

  it('measures the pan threshold on each axis, as a pan does: a diagonal drift under it on both axes does not close', () => {
    const {outside, onOutside, stop} = setup();
    fireEvent.pointerDown(outside, touch(1));
    fireEvent.pointerMove(outside, touch(1, 8, 8));
    expect(onOutside).not.toHaveBeenCalled();
    fireEvent.pointerMove(outside, touch(1, 8, 30));
    expect(onOutside).toHaveBeenCalledOnce();
    stop();
  });

  it('begins the pan at the threshold itself, as a pan does: a finger outside that moves exactly 10 px closes', () => {
    const {outside, onOutside, stop} = setup();
    fireEvent.pointerDown(outside, touch(1));
    fireEvent.pointerMove(outside, touch(1, 10, 0));
    expect(onOutside).toHaveBeenCalledOnce();
    stop();
  });

  it('closes when the browser takes the press, and at the lift of a tap', () => {
    const {outside, onOutside, stop} = setup();
    fireEvent.pointerDown(outside, touch(1));
    fireEvent.pointerCancel(outside, touch(1));
    expect(onOutside).toHaveBeenCalledOnce();
    fireEvent.pointerDown(outside, touch(2));
    fireEvent.pointerUp(outside, touch(2));
    expect(onOutside).toHaveBeenCalledTimes(2);
    stop();
  });

  it('lets a second finger wait for the first, and leaves a mouse alone', () => {
    const {outside, onOutside, stop} = setup();
    fireEvent.pointerDown(outside, {pointerType: 'mouse', pointerId: 9});
    fireEvent.pointerUp(outside, {pointerType: 'mouse', pointerId: 9});
    fireEvent.pointerDown(outside, touch(2));
    fireEvent.pointerDown(outside, touch(3));
    fireEvent.pointerUp(outside, touch(3));
    expect(onOutside).not.toHaveBeenCalled();
    fireEvent.pointerUp(outside, touch(2));
    expect(onOutside).toHaveBeenCalledOnce();
    stop();
  });

  it.each([true, false])(
    'keeps the layer open for a press that starts outside and lifts on it, in a closed shadow root too (closesOnPan: %s)',
    closesOnPan => {
      const host = document.createElement('div');
      document.body.append(host);
      const shadow = host.attachShadow({mode: 'closed'});
      const {item, outside, onOutside, stop} = setup(shadow, closesOnPan);
      fireEvent.pointerDown(outside, touch(1));
      fireEvent.pointerUp(item, touch(1));
      expect(onOutside).not.toHaveBeenCalled();
      stop();
    },
  );

  it.each([true, false])(
    'keeps the layer open for a press that starts outside and lifts on it, in a closed root inside another (closesOnPan: %s)',
    closesOnPan => {
      const outerHost = document.createElement('div');
      document.body.append(outerHost);
      const outer = outerHost.attachShadow({mode: 'closed'});
      const innerHost = document.createElement('div');
      outer.append(innerHost);
      const inner = innerHost.attachShadow({mode: 'closed'});
      const {item, outside, onOutside, stop} = setup(inner, closesOnPan);
      fireEvent.pointerDown(outside, touch(1));
      fireEvent.pointerUp(item, touch(1));
      expect(onOutside).not.toHaveBeenCalled();
      // A lift on the outer root's own content is outside the layer.
      fireEvent.pointerDown(outside, touch(2));
      fireEvent.pointerUp(innerHost, touch(2));
      expect(onOutside).toHaveBeenCalledOnce();
      stop();
    },
  );

  it.each([true, false])(
    'closes for a lift on a control in an outer closed root that stops the lift (closesOnPan: %s)',
    closesOnPan => {
      const outerHost = document.createElement('div');
      document.body.append(outerHost);
      const outer = outerHost.attachShadow({mode: 'closed'});
      const control = document.createElement('button');
      control.addEventListener('pointerup', event => event.stopPropagation());
      const innerHost = document.createElement('div');
      outer.append(control, innerHost);
      const inner = innerHost.attachShadow({mode: 'closed'});
      const {outside, onOutside, stop} = setup(inner, closesOnPan);
      fireEvent.pointerDown(outside, touch(1));
      fireEvent.pointerUp(control, touch(1));
      expect(onOutside).toHaveBeenCalledOnce();
      // The watch does not keep following that press: the next one closes too.
      fireEvent.pointerDown(outside, touch(2));
      fireEvent.pointerUp(outside, touch(2));
      expect(onOutside).toHaveBeenCalledTimes(2);
      stop();
    },
  );

  it('follows a new primary pointer when the followed press’s lift went unseen', () => {
    const {outside, onOutside, stop} = setup();
    fireEvent.pointerDown(outside, {...touch(1), isPrimary: true});
    // The lift of pointer 1 never reaches this document.
    fireEvent.pointerDown(outside, {...touch(2), isPrimary: true});
    fireEvent.pointerMove(outside, touch(2, 0, 12));
    expect(onOutside).toHaveBeenCalledOnce();
    stop();
  });

  it('keeps the layer open for a press that starts outside and lifts on it, in a closed root of a same-origin iframe', () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const frameDocument = frame.contentDocument!;
    const host = frameDocument.createElement('div');
    frameDocument.body.append(host);
    const shadow = host.attachShadow({mode: 'closed'});
    // The precondition this guards: another window's shadow root is not this
    // window's ShadowRoot.
    expect(shadow instanceof ShadowRoot).toBe(false);
    const {item, outside, onOutside, stop} = setup(shadow, true, frameDocument);
    fireEvent.pointerDown(outside, touch(1));
    fireEvent.pointerUp(item, touch(1));
    expect(onOutside).not.toHaveBeenCalled();
    // The watch follows this window's presses: a lift outside closes.
    fireEvent.pointerDown(outside, touch(2));
    fireEvent.pointerUp(outside, touch(2));
    expect(onOutside).toHaveBeenCalledOnce();
    stop();
  });

  it('leaves a followed press alone when a pointer type it does not follow is cancelled', () => {
    const {outside, onOutside, stop} = setup(undefined, false);
    fireEvent.pointerDown(outside, touch(1));
    fireEvent.pointerCancel(outside, {pointerType: 'pen', pointerId: 7});
    fireEvent.pointerUp(outside, touch(1));
    expect(onOutside).toHaveBeenCalledOnce();
    stop();
  });

  it('counts a layer it closes on a pan or a cancel as an outside dismissal, as at a lift', () => {
    const {outside, stop} = setup();
    const before = outsideDismissalCount(document);
    fireEvent.pointerDown(outside, touch(1));
    fireEvent.pointerMove(outside, touch(1, 0, 30));
    expect(outsideDismissalCount(document)).toBe(before + 1);
    fireEvent.pointerUp(outside, touch(1, 0, 30));
    fireEvent.pointerDown(outside, touch(2));
    fireEvent.pointerCancel(outside, touch(2));
    expect(outsideDismissalCount(document)).toBe(before + 2);
    stop();
  });

  it('counts a press inside the layer as inside, in a closed shadow root too', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const shadow = host.attachShadow({mode: 'closed'});
    const {item, onOutside, stop} = setup(shadow);
    fireEvent.pointerDown(item, touch(1));
    fireEvent.pointerUp(item, touch(1));
    expect(onOutside).not.toHaveBeenCalled();
    fireEvent.pointerDown(host, touch(2));
    fireEvent.pointerUp(host, touch(2));
    expect(onOutside).toHaveBeenCalledOnce();
    stop();
  });
});
