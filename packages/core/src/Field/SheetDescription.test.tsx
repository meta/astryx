// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SheetDescription.test.tsx
 * @input Private sheet bridge, independent DOM sources, and React lifecycles
 * @output Regressions for current ID ownership, rendered text, and resource cleanup
 * @position Testing; shared modal-description mechanism, not a public API
 */

import {StrictMode} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {act, cleanup, render} from '@testing-library/react';
import {SheetDescription} from './SheetDescription';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SheetDescription', () => {
  it('resolves initially missing IDs and follows ID reassignment and replaced source containers', async () => {
    const external = render(<span>First help</span>);
    const first = external.container.firstElementChild;
    const view = render(<SheetDescription id="mirror" describedBy="help" />);
    const mirror = view.container.firstElementChild;
    expect(mirror).toHaveTextContent('');
    await act(async () => first?.setAttribute('id', 'help'));
    expect(mirror).toHaveTextContent('First help');
    await act(async () => first?.setAttribute('id', 'former-help'));
    expect(mirror).toHaveTextContent('');
    // Replacing the entire source container defeats a parent-only observer.
    const nextContainer = document.createElement('section');
    const next = document.createElement('span');
    next.id = 'help';
    next.textContent = 'New owner';
    nextContainer.append(next);
    try {
      await act(async () => external.container.replaceWith(nextContainer));
      expect(mirror).toHaveTextContent('New owner');
      await act(async () => {
        next.firstChild?.replaceWith('New owner updated');
        if (first) {
          first.textContent = 'Disconnected old owner';
        }
      });
      expect(mirror).toHaveTextContent('New owner updated');
      await act(async () => nextContainer.remove());
      expect(mirror).toHaveTextContent('');
    } finally {
      nextContainer.remove();
    }
  });

  it('rebinds changed description IDs and keeps rendered text rather than descendant accessible names', async () => {
    const external = render(
      <>
        <span id="first">First help</span>
        <span id="second">
          <a href="#help" aria-label="Different accessible name">
            Rendered link
          </a>{' '}
          <span hidden>Hidden text</span>{' '}
          <span aria-hidden="true">Decorative text</span>
        </span>
      </>,
    );
    const view = render(<SheetDescription id="mirror" describedBy="first" />);
    const mirror = view.container.firstElementChild;
    view.rerender(<SheetDescription id="mirror" describedBy="second" />);
    expect(view.container.firstElementChild).toBe(mirror);
    expect(mirror).toHaveTextContent('Rendered link');
    expect(mirror?.childElementCount).toBe(0);
    await act(async () => {
      const link = external.container.querySelector('a');
      if (link?.firstChild) {
        link.firstChild.textContent = 'Updated rendered link';
      }
      external.container.querySelector('[hidden]')?.removeAttribute('hidden');
    });
    expect(mirror).toHaveTextContent('Updated rendered link Hidden text');
    await act(async () => {
      external.container
        .querySelector('[aria-hidden]')
        ?.setAttribute('aria-hidden', 'false');
    });
    expect(mirror).toHaveTextContent(
      'Updated rendered link Hidden text Decorative text',
    );
    await act(async () => {
      const first = external.container.querySelector('#first');
      if (first) {
        first.textContent = 'No longer referenced';
      }
    });
    expect(mirror).not.toHaveTextContent('No longer referenced');
  });

  it('ignores its own projection and avoids writes for unchanged text or unrelated mutations', async () => {
    const external = render(<span id="help">Caller help</span>);
    const view = render(
      <section id="ancestor">
        <SheetDescription id="mirror" describedBy="help mirror ancestor" />
      </section>,
    );
    const mirror = view.container.querySelector('#mirror');
    if (!mirror) {
      throw new Error('Missing mirror');
    }
    const writes = vi.fn();
    const observer = new MutationObserver(writes);
    observer.observe(mirror, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    try {
      await act(async () => {
        const help = external.container.firstElementChild;
        if (help) {
          help.textContent = 'Caller help';
        }
        external.container.append(document.createElement('div'));
      });
      expect(mirror).toHaveTextContent('Caller help');
      expect(writes).not.toHaveBeenCalled();
    } finally {
      observer.disconnect();
    }
  });

  it('releases every subscription on StrictMode replay and unmount, including queued updates', async () => {
    const observe = vi.spyOn(MutationObserver.prototype, 'observe');
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
    const expectReleased = (observers: Set<unknown>) => {
      for (const observer of observers) {
        const lastObserve = observe.mock.invocationCallOrder
          .filter((_, index) => observe.mock.instances[index] === observer)
          .at(-1);
        const lastDisconnect = disconnect.mock.invocationCallOrder
          .filter((_, index) => disconnect.mock.instances[index] === observer)
          .at(-1);
        expect(lastDisconnect).toBeGreaterThan(lastObserve ?? 0);
      }
    };
    const external = render(<span id="help">Caller help</span>);
    const fixture = (describedBy: string) => (
      <StrictMode>
        <SheetDescription id="mirror" describedBy={describedBy} />
      </StrictMode>
    );
    const view = render(fixture('help'));
    const mirror = view.container.firstElementChild;
    const firstObservers = new Set(observe.mock.instances);
    expect(firstObservers.size).toBeGreaterThan(0);
    const subscriptions = observe.mock.calls.length;
    view.rerender(fixture('help'));
    expect(observe).toHaveBeenCalledTimes(subscriptions);
    view.rerender(fixture('help missing'));
    expectReleased(firstObservers);
    const allObservers = new Set(observe.mock.instances);
    await act(async () => {
      const text = external.container.firstElementChild?.firstChild;
      if (text) {
        text.textContent = 'Queued before unmount';
      }
      view.unmount();
    });
    expectReleased(allObservers);
    await act(async () => {
      const text = external.container.firstElementChild?.firstChild;
      if (text) {
        text.textContent = 'After unmount';
      }
    });
    expect(mirror).toHaveTextContent('Caller help');
  });
});
