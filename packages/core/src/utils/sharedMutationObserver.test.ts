// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, vi} from 'vitest';
import {observeContent, observeMutations} from './sharedMutationObserver';

const flush = async () => new Promise(resolve => setTimeout(resolve, 0));

describe('observeContent', () => {
  it('calls a registration once per batch for changes anywhere inside its element', async () => {
    const element = document.createElement('div');
    element.innerHTML = '<span>first</span>';
    const callback = vi.fn();
    const unsubscribe = observeContent(element, callback);

    element.querySelector('span')!.firstChild!.nodeValue = 'second';
    element.append('third');
    await flush();

    expect(callback).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('removes only its own registration', async () => {
    const element = document.createElement('div');
    const kept = vi.fn();
    const removed = vi.fn();
    const unsubscribeKept = observeContent(element, kept);
    const unsubscribeRemoved = observeContent(element, removed);

    unsubscribeRemoved();
    element.textContent = 'changed';
    await flush();

    expect(kept).toHaveBeenCalledTimes(1);
    expect(removed).not.toHaveBeenCalled();
    unsubscribeKept();
  });

  it('ignores a released element', async () => {
    const released = document.createElement('div');
    const live = document.createElement('div');
    const releasedCallback = vi.fn();
    const unsubscribeReleased = observeContent(released, releasedCallback);
    const unsubscribeLive = observeContent(live, vi.fn());

    unsubscribeReleased();
    released.textContent = 'changed';
    await flush();

    expect(releasedCallback).not.toHaveBeenCalled();
    unsubscribeLive();
  });
});

describe('observeMutations', () => {
  it('shares one observer across registrations with the same options', async () => {
    const Native = globalThis.MutationObserver;
    let constructed = 0;
    vi.stubGlobal(
      'MutationObserver',
      class extends Native {
        constructor(callback: MutationCallback) {
          super(callback);
          constructed += 1;
        }
      },
    );
    const options = {attributes: true, attributeFilter: ['dir']};
    const first = document.createElement('div');
    const second = document.createElement('div');
    const firstCallback = vi.fn();
    const secondCallback = vi.fn();
    const stops = [
      observeMutations(first, options, firstCallback),
      observeMutations(second, {...options}, secondCallback),
    ];

    first.dir = 'rtl';
    await flush();

    expect(constructed).toBe(1);
    expect(firstCallback).toHaveBeenCalledTimes(1);
    expect(secondCallback).not.toHaveBeenCalled();
    stops.forEach(stop => stop());
    vi.unstubAllGlobals();
  });

  it('reports a descendant only to a subtree registration', async () => {
    const outer = document.createElement('div');
    const inner = document.createElement('span');
    outer.append(inner);
    const self = vi.fn();
    const subtree = vi.fn();
    const stops = [
      observeMutations(outer, {attributes: true}, self),
      observeMutations(outer, {attributes: true, subtree: true}, subtree),
    ];

    inner.className = 'changed';
    await flush();

    expect(self).not.toHaveBeenCalled();
    expect(subtree).toHaveBeenCalledTimes(1);
    stops.forEach(stop => stop());
  });
});
