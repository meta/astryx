// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file outsidePress.test.ts
 * @input isFocusInsideOwnedLayer and isPressInsideOwnedLayer
 * @output The shared focus-leave test: the field, the layer (by id, across
 *   shadow roots and through popovers nested in it) are inside; anything
 *   else and a null target are outside
 */

import {afterEach, describe, expect, it} from 'vitest';
import {isFocusInsideOwnedLayer, isPressInsideOwnedLayer} from './outsidePress';

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
