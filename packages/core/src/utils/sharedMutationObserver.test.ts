// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, vi} from 'vitest';
import {
  flushMutations,
  observeContent,
  observeMutations,
} from './sharedMutationObserver';

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

describe('observeMutations records', () => {
  it('hands a registration the records that reached its element', async () => {
    const element = document.createElement('div');
    const child = document.createElement('span');
    element.append(child);
    const callback = vi.fn();
    const unsubscribe = observeMutations(
      element,
      {
        attributes: true,
        attributeFilter: ['inert'],
        attributeOldValue: true,
        subtree: true,
      },
      callback,
    );

    child.setAttribute('inert', '');
    child.setAttribute('inert', '');
    await flush();

    expect(callback).toHaveBeenCalledTimes(1);
    const records = callback.mock.calls[0][0] as MutationRecord[];
    expect(records.map(record => record.oldValue)).toEqual([null, '']);
    expect(records.every(record => record.target === child)).toBe(true);
    unsubscribe();
  });

  it('keeps a registration that asks for old values apart from one that does not', async () => {
    const element = document.createElement('div');
    const withOld = vi.fn();
    const withoutOld = vi.fn();
    const unsubscribeWith = observeMutations(
      element,
      {attributes: true, attributeOldValue: true},
      withOld,
    );
    const other = document.createElement('div');
    const unsubscribeWithout = observeMutations(
      other,
      {attributes: true},
      withoutOld,
    );

    element.setAttribute('dir', 'rtl');
    element.setAttribute('dir', 'ltr');
    other.setAttribute('dir', 'rtl');
    other.setAttribute('dir', 'ltr');
    await flush();

    expect(
      (withOld.mock.calls[0][0] as MutationRecord[]).map(r => r.oldValue),
    ).toEqual([null, 'rtl']);
    expect(
      (withoutOld.mock.calls[0][0] as MutationRecord[]).map(r => r.oldValue),
    ).toEqual([null, null]);
    unsubscribeWith();
    unsubscribeWithout();
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

describe('flushMutations', () => {
  it('delivers a mutation of this task at once, and only once', async () => {
    const element = document.createElement('div');
    const options = {childList: true, subtree: true};
    const callback = vi.fn();
    const unsubscribe = observeMutations(element, options, callback);

    element.append(document.createElement('span'));
    expect(callback).not.toHaveBeenCalled();
    flushMutations(options);
    expect(callback).toHaveBeenCalledTimes(1);
    await flush();
    expect(callback).toHaveBeenCalledTimes(1);

    // Nothing pending, or no observer for the options: nothing is called.
    flushMutations(options);
    flushMutations({attributes: true});
    expect(callback).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
