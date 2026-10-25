// Copyright (c) Meta Platforms, Inc. and affiliates.

import {render} from '@testing-library/react';
import {useRef} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {GestureHost} from '../gestures/GestureHost';
import {
  holdPresentation,
  isInHeldLayer,
  usePresentationHold,
} from './presentationHold';

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

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('holdPresentation', () => {
  it('holds a presenting layer with a shield over the viewport until its end settles', async () => {
    const {layer, child} = mountLayer();
    const outside = document.createElement('div');
    document.body.append(outside);
    const end = deferred();
    holdPresentation(layer, {until: end.promise, scope: 'viewport'});
    const shield = layer.lastElementChild as HTMLElement;
    expect(shield).not.toBe(child);
    expect(shield.getAttribute('popover')).toBe('manual');
    expect(shield.style.position).toBe('fixed');
    expect(shield.style.touchAction).toBe('none');
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

  it('swallows a press and a click on the shield before they reach the page', () => {
    const {layer} = mountLayer();
    holdPresentation(layer, {until: new Promise(() => {}), scope: 'viewport'});
    const shield = layer.lastElementChild as HTMLElement;
    const seen: string[] = [];
    for (const type of ['pointerdown', 'click', 'touchstart']) {
      document.addEventListener(type, () => seen.push(type));
    }
    shield.dispatchEvent(new Event('pointerdown', {bubbles: true}));
    shield.dispatchEvent(new MouseEvent('click', {bubbles: true}));
    shield.dispatchEvent(new Event('touchstart', {bubbles: true}));
    expect(seen).toEqual([]);
  });

  it("holds a dismissing layer: its content inert, the layer itself live under the shield, each element's inert given back", async () => {
    const {layer, child} = mountLayer();
    const already = document.createElement('div');
    already.setAttribute('inert', '');
    layer.append(already);
    child.focus();
    expect(document.activeElement).toBe(child);
    const end = deferred();
    holdPresentation(layer, {until: end.promise, scope: 'layer'});
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
    const release = holdPresentation(layer, {
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
    holdPresentation(layer, {until: {finished: end.promise}, scope: 'layer'});
    expect(isInHeldLayer(child)).toBe(true);
    end.resolve();
    await flush();
    expect(isInHeldLayer(child)).toBe(false);
  });

  it('stacks holds on one layer, either scope, under one shield: it comes back when the last one ends', () => {
    const {layer, child} = mountLayer();
    const first = holdPresentation(layer, {
      until: new Promise(() => {}),
      scope: 'viewport',
    });
    const second = holdPresentation(layer, {
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

  it("registers one touch gate per document, which answers whether a touch's target is held", () => {
    const addTouchGate = vi.spyOn(GestureHost.prototype, 'addTouchGate');
    const {layer, child} = mountLayer();
    holdPresentation(layer, {until: new Promise(() => {}), scope: 'layer'});
    const release = holdPresentation(layer, {
      until: new Promise(() => {}),
      scope: 'viewport',
    });
    expect(addTouchGate.mock.calls.length).toBeLessThanOrEqual(1);
    const registered =
      addTouchGate.mock.calls[0]?.[0] ??
      ((target: Node) => isInHeldLayer(target));
    expect(registered(child)).toBe(true);
    expect(registered(document.body)).toBe(false);
    release();
  });
});

describe('usePresentationHold', () => {
  function Bar({isHeld}: {isHeld: boolean}) {
    const ref = useRef<HTMLDivElement>(null);
    usePresentationHold(ref, {isHeld, scope: 'layer'});
    return (
      <div ref={ref} data-testid="bar">
        <button type="button">Back</button>
      </div>
    );
  }

  it('holds the layer while asked, and releases it when no longer asked or unmounted', () => {
    const view = render(<Bar isHeld />);
    const bar = view.getByTestId('bar');
    const back = view.getByRole('button', {name: 'Back', hidden: true});
    expect(back.hasAttribute('inert')).toBe(true);
    expect(isInHeldLayer(back)).toBe(true);
    view.rerender(<Bar isHeld={false} />);
    expect(back.hasAttribute('inert')).toBe(false);
    view.rerender(<Bar isHeld />);
    expect(back.hasAttribute('inert')).toBe(true);
    view.unmount();
    expect(isInHeldLayer(bar)).toBe(false);
  });
});
