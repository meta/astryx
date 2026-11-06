// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file gestureCounter.test.ts
 * @input claimContextMenuPress with a layer inside an open shadow root, and
 *   stubbed pointer capture and hit tests
 * @output The claim hit-tests in the layer's own tree, so the capture lets go
 *   while the pointer is over a layer in a shadow root
 * @position Unit test of packages/core/src/Layer/gestureCounter.ts
 */

import {afterEach, describe, expect, it} from 'vitest';
import {claimContextMenuPress, currentGesture} from './gestureCounter';

/** A pointer event of `type` for `pointerId`, which jsdom's events lack. */
function pointerEvent(type: string, pointerId: number, button = 0): Event {
  return Object.assign(
    new MouseEvent(type, {bubbles: true, composed: true, button}),
    {pointerId},
  );
}

describe('claimContextMenuPress', () => {
  afterEach(() => {
    document.dispatchEvent(pointerEvent('pointerup', 7));
    document.body.replaceChildren();
    delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture;
    delete (HTMLElement.prototype as Partial<HTMLElement>).hasPointerCapture;
    delete (HTMLElement.prototype as Partial<HTMLElement>)
      .releasePointerCapture;
    delete (document as Partial<Document>).elementFromPoint;
  });

  it('hit-tests in the layer’s shadow root, so the capture lets go over the layer', () => {
    const captured: number[] = [];
    const released: number[] = [];
    HTMLElement.prototype.setPointerCapture = (pointerId: number) => {
      captured.push(pointerId);
    };
    HTMLElement.prototype.hasPointerCapture = () => true;
    HTMLElement.prototype.releasePointerCapture = (pointerId: number) => {
      released.push(pointerId);
    };
    const host = document.createElement('div');
    document.body.append(host);
    const shadow = host.attachShadow({mode: 'open'});
    const zone = document.createElement('div');
    const layer = document.createElement('div');
    shadow.append(zone, layer);

    // The document answers with the shadow host; the shadow root, with the
    // layer.
    document.elementFromPoint = () => host;
    (shadow as Partial<ShadowRoot>).elementFromPoint = () => layer;

    // Reading the gesture installs its listeners before the press.
    currentGesture();
    zone.dispatchEvent(pointerEvent('pointerdown', 7, 2));
    zone.dispatchEvent(
      new MouseEvent('contextmenu', {bubbles: true, composed: true}),
    );
    claimContextMenuPress(layer);
    expect(captured).toEqual([7]);

    // Over the layer, the capture lets go.
    layer.dispatchEvent(pointerEvent('pointermove', 7));
    expect(released).toEqual([7]);
  });
});
