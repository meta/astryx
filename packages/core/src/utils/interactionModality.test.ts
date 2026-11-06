// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file interactionModality.test.ts
 * @input The interaction-modality utility loaded more than once
 * @output Verifies document-wide continuity, shared Shift-key modality policy,
 *   and a second document's separate value
 * @position Unit coverage for interactionModality.ts
 */

import type {ReactNode} from 'react';
import {afterEach, describe, expect, it, vi, type MockInstance} from 'vitest';
import {renderHook} from '@testing-library/react';

const isolatedDocument = document.implementation.createHTMLDocument();

async function loadTracker() {
  vi.resetModules();
  return import('./interactionModality');
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('interactionModality', () => {
  it.each(['Shift', 'Tab', 'ArrowRight'])(
    'counts %s with Shift held as keyboard input',
    async key => {
      const targetDocument = document.implementation.createHTMLDocument();
      vi.stubGlobal('document', targetDocument);
      const tracker = await loadTracker();
      tracker.__startInteractionModalityTrackingForTest();
      targetDocument.dispatchEvent(new Event('pointerdown'));
      expect(tracker.getInteractionModality()).toBe('pointer');

      targetDocument.dispatchEvent(
        new KeyboardEvent('keydown', {key, shiftKey: true}),
      );
      expect(tracker.getInteractionModality()).toBe('keyboard');
    },
  );

  it('does not touch the document when the module loads', async () => {
    vi.stubGlobal('document', isolatedDocument);
    const addEventListener = vi.spyOn(isolatedDocument, 'addEventListener');

    await loadTracker();

    expect(addEventListener).not.toHaveBeenCalled();
  });

  it('shares one listener pair and tracks input between consumers', async () => {
    vi.stubGlobal('document', isolatedDocument);
    const addEventListener = vi.spyOn(isolatedDocument, 'addEventListener');
    const removeEventListener = vi.spyOn(
      isolatedDocument,
      'removeEventListener',
    );
    const firstModule = await loadTracker();
    const secondModule = await loadTracker();

    const firstConsumer =
      firstModule.__startInteractionModalityTrackingForTest();
    const secondConsumer =
      secondModule.__startInteractionModalityTrackingForTest();

    expect(
      addEventListener.mock.calls.filter(([type]) => type === 'pointerdown'),
    ).toHaveLength(1);
    expect(
      addEventListener.mock.calls.filter(([type]) => type === 'keydown'),
    ).toHaveLength(1);

    isolatedDocument.dispatchEvent(new Event('pointerdown'));
    expect(secondModule.getInteractionModality()).toBe('pointer');

    firstConsumer();
    secondConsumer();
    isolatedDocument.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab'}));
    expect(firstModule.getInteractionModality()).toBe('keyboard');
    expect(removeEventListener).not.toHaveBeenCalled();

    secondModule.__startInteractionModalityTrackingForTest()();
    expect(
      addEventListener.mock.calls.filter(([type]) => type === 'pointerdown'),
    ).toHaveLength(1);
    expect(
      addEventListener.mock.calls.filter(([type]) => type === 'keydown'),
    ).toHaveLength(1);
  });

  it("keeps a second document's input apart from the page's", async () => {
    const pageDocument = document.implementation.createHTMLDocument();
    const secondDocument = document.implementation.createHTMLDocument();
    vi.stubGlobal('document', pageDocument);
    const tracker = await loadTracker();
    tracker.__startInteractionModalityTrackingForTest();
    tracker.__trackInteractionModalityInForTest(secondDocument);

    pageDocument.dispatchEvent(new Event('pointerdown'));
    secondDocument.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}));
    expect(tracker.getInteractionModality()).toBe('pointer');
    expect(tracker.getInteractionModality(pageDocument)).toBe('pointer');
    expect(tracker.getInteractionModality(secondDocument)).toBe('keyboard');

    secondDocument.dispatchEvent(new Event('pointerdown'));
    pageDocument.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab'}));
    expect(tracker.getInteractionModality()).toBe('keyboard');
    expect(tracker.getInteractionModality(secondDocument)).toBe('pointer');
  });

  it("releases a second document's listeners with its last consumer", async () => {
    const secondDocument = document.implementation.createHTMLDocument();
    const tracker = await loadTracker();
    const removeEventListener = vi.spyOn(secondDocument, 'removeEventListener');
    const releaseFirst =
      tracker.__trackInteractionModalityInForTest(secondDocument);
    const releaseSecond =
      tracker.__trackInteractionModalityInForTest(secondDocument);
    secondDocument.dispatchEvent(new Event('pointerdown'));
    expect(tracker.getInteractionModality(secondDocument)).toBe('pointer');

    releaseFirst();
    releaseFirst();
    secondDocument.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab'}));
    expect(tracker.getInteractionModality(secondDocument)).toBe('keyboard');
    expect(removeEventListener).not.toHaveBeenCalled();

    releaseSecond();
    expect(removeEventListener.mock.calls.map(([type]) => type).sort()).toEqual(
      ['keydown', 'pointerdown'],
    );
    secondDocument.dispatchEvent(new Event('pointerdown'));
    expect(tracker.getInteractionModality(secondDocument)).toBe('keyboard');
  });

  it("tracks a hook consumer's object-ref document until its last consumer unmounts", async () => {
    const tracker = await loadTracker();
    const secondDocument = document.implementation.createHTMLDocument();
    const addEventListener = vi.spyOn(secondDocument, 'addEventListener');
    const removeEventListener = vi.spyOn(secondDocument, 'removeEventListener');
    const elementRef = {current: secondDocument.createElement('div')};

    const first = renderHook(() =>
      tracker.useInteractionModalityTrackingFor(elementRef),
    );
    const second = renderHook(() =>
      tracker.useInteractionModalityTrackingFor(elementRef),
    );
    // One listener pair for the document, however many components track it.
    expect(
      addEventListener.mock.calls.filter(([type]) => type === 'pointerdown'),
    ).toHaveLength(1);
    secondDocument.dispatchEvent(new Event('pointerdown'));
    expect(tracker.getInteractionModality(secondDocument)).toBe('pointer');

    // A re-render keeps the same tracking; it neither adds nor drops it.
    first.rerender();
    expect(
      addEventListener.mock.calls.filter(([type]) => type === 'pointerdown'),
    ).toHaveLength(1);
    expect(removeEventListener).not.toHaveBeenCalled();

    first.unmount();
    secondDocument.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab'}));
    expect(tracker.getInteractionModality(secondDocument)).toBe('keyboard');
    expect(removeEventListener).not.toHaveBeenCalled();

    // The last component in that document unmounts: tracking there stops.
    second.unmount();
    expect(removeEventListener.mock.calls.map(([type]) => type).sort()).toEqual(
      ['keydown', 'pointerdown'],
    );
    secondDocument.dispatchEvent(new Event('pointerdown'));
    expect(tracker.getInteractionModality(secondDocument)).toBe('keyboard');
  });

  it("keeps the page's document-lifetime tracking for a component on the page", async () => {
    const tracker = await loadTracker();
    const removeEventListener = vi.spyOn(document, 'removeEventListener');
    const elementRef = {current: document.createElement('div')};
    const {unmount} = renderHook(() =>
      tracker.useInteractionModalityTrackingFor(elementRef),
    );
    document.dispatchEvent(new Event('pointerdown'));
    expect(tracker.getInteractionModality()).toBe('pointer');
    unmount();
    expect(
      removeEventListener.mock.calls.filter(
        ([type]) => type === 'pointerdown' || type === 'keydown',
      ),
    ).toHaveLength(0);
  });

  it('moves the tracking when the element moves to another document', async () => {
    const tracker = await loadTracker();
    const firstDocument = document.implementation.createHTMLDocument();
    const secondDocument = document.implementation.createHTMLDocument();
    const firstRemove = vi.spyOn(firstDocument, 'removeEventListener');
    const elementRef: {current: Element | null} = {
      current: firstDocument.createElement('div'),
    };
    const {rerender, unmount} = renderHook(() =>
      tracker.useInteractionModalityTrackingFor(elementRef),
    );
    elementRef.current = secondDocument.createElement('div');
    rerender();
    expect(firstRemove.mock.calls.map(([type]) => type).sort()).toEqual([
      'keydown',
      'pointerdown',
    ]);
    secondDocument.dispatchEvent(new Event('pointerdown'));
    expect(tracker.getInteractionModality(secondDocument)).toBe('pointer');
    unmount();
  });

  it('releases an object-ref document when the element detaches, and holds one under StrictMode replay', async () => {
    const tracker = await loadTracker();
    const {StrictMode, createElement} = await import('react');
    const secondDocument = document.implementation.createHTMLDocument();
    const addEventListener = vi.spyOn(secondDocument, 'addEventListener');
    const removeEventListener = vi.spyOn(secondDocument, 'removeEventListener');
    const elementRef: {current: Element | null} = {
      current: secondDocument.createElement('div'),
    };
    const listeners = (spy: typeof addEventListener) =>
      spy.mock.calls.filter(([type]) => type === 'pointerdown').length;

    const {rerender, unmount} = renderHook(
      () => tracker.useInteractionModalityTrackingFor(elementRef),
      {wrapper: ({children}) => createElement(StrictMode, null, children)},
    );
    // StrictMode replays the effects; one hold remains.
    expect(listeners(addEventListener) - listeners(removeEventListener)).toBe(
      1,
    );
    secondDocument.dispatchEvent(new Event('pointerdown'));
    expect(tracker.getInteractionModality(secondDocument)).toBe('pointer');

    // `null` detachment releases the document.
    elementRef.current = null;
    rerender();
    expect(listeners(addEventListener) - listeners(removeEventListener)).toBe(
      0,
    );

    // Re-attaching tracks it again; unmount releases it.
    elementRef.current = secondDocument.createElement('div');
    rerender();
    expect(listeners(addEventListener) - listeners(removeEventListener)).toBe(
      1,
    );
    unmount();
    expect(listeners(addEventListener) - listeners(removeEventListener)).toBe(
      0,
    );
  });

  describe('the callback ref a component attaches', () => {
    async function renderInFrame(element: ReactNode) {
      const {createRoot} = await import('react-dom/client');
      const {act} = await import('react');
      const frame = document.createElement('iframe');
      document.body.appendChild(frame);
      const frameDocument = frame.contentDocument!;
      const container = frameDocument.createElement('div');
      frameDocument.body.appendChild(container);
      const root = createRoot(container);
      const render = async (next: ReactNode) => {
        await act(async () => {
          root.render(next);
        });
      };
      await render(element);
      return {
        frameDocument,
        render,
        unmount: async () => {
          await act(async () => {
            root.unmount();
          });
          frame.remove();
        },
      };
    }

    function listenerCount(add: MockInstance, remove: MockInstance) {
      const count = (spy: MockInstance) =>
        spy.mock.calls.filter(([type]) => type === 'pointerdown').length;
      return count(add) - count(remove);
    }

    it('holds the element document once, keeps it across re-renders, and releases it with the last component', async () => {
      const tracker = await loadTracker();
      const {createElement: h, Fragment} = await import('react');
      function Probe() {
        const {ref} = tracker.useInteractionModalityTracking();
        return h('div', {ref});
      }
      const both = h(
        Fragment,
        null,
        h(Probe, {key: 'a'}),
        h(Probe, {key: 'b'}),
      );
      const frame = await renderInFrame(both);
      const add = vi.spyOn(frame.frameDocument, 'addEventListener');
      const remove = vi.spyOn(frame.frameDocument, 'removeEventListener');
      // Spies attach after the first render; re-render to prove no churn.
      await frame.render(both);
      expect(add).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
      frame.frameDocument.dispatchEvent(new Event('pointerdown'));
      expect(tracker.getInteractionModality(frame.frameDocument)).toBe(
        'pointer',
      );

      await frame.render(h(Fragment, null, h(Probe, {key: 'a'})));
      expect(remove).not.toHaveBeenCalled();
      await frame.render(h(Fragment, null));
      expect(remove.mock.calls.map(([type]) => type).sort()).toEqual([
        'keydown',
        'pointerdown',
      ]);
      await frame.unmount();
    });

    it('releases the old node before holding a replacement, and holds one under StrictMode', async () => {
      const tracker = await loadTracker();
      const {createElement: h, StrictMode} = await import('react');
      function Probe({tag}: {tag: 'div' | 'span'}) {
        const {ref} = tracker.useInteractionModalityTracking();
        return h(tag, {ref});
      }
      const frame = await renderInFrame(
        h(StrictMode, null, h(Probe, {tag: 'div'})),
      );
      const add = vi.spyOn(frame.frameDocument, 'addEventListener');
      const remove = vi.spyOn(frame.frameDocument, 'removeEventListener');
      // A different tag replaces the node: the old hold releases first, so the
      // document's listeners are removed and added back, one pair at the end.
      await frame.render(h(StrictMode, null, h(Probe, {tag: 'span'})));
      expect(listenerCount(add, remove)).toBe(0);
      expect(remove.mock.invocationCallOrder[0]).toBeLessThan(
        add.mock.invocationCallOrder[0],
      );
      frame.frameDocument.dispatchEvent(new Event('pointerdown'));
      expect(tracker.getInteractionModality(frame.frameDocument)).toBe(
        'pointer',
      );
      await frame.unmount();
      expect(listenerCount(add, remove)).toBe(-1);
    });

    it('reads the element document, and the page before it attaches', async () => {
      const tracker = await loadTracker();
      const {result} = renderHook(() =>
        tracker.useInteractionModalityTracking(),
      );
      document.dispatchEvent(new Event('pointerdown'));
      expect(result.current.readModality()).toBe('pointer');
      const secondDocument = document.implementation.createHTMLDocument();
      const node = secondDocument.createElement('div');
      const cleanup = result.current.ref(node);
      secondDocument.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab'}));
      expect(result.current.readModality()).toBe('keyboard');
      // React's ref cleanup and a later `null` call release it only once.
      const remove = vi.spyOn(secondDocument, 'removeEventListener');
      cleanup?.();
      result.current.ref(null);
      expect(
        remove.mock.calls.filter(([type]) => type === 'pointerdown'),
      ).toHaveLength(1);
      // A detached element no longer answers from its old document.
      document.dispatchEvent(new Event('pointerdown'));
      expect(result.current.readModality()).toBe('pointer');
    });

    it('forgets the node when React runs the ref cleanup instead of a null call', async () => {
      const tracker = await loadTracker();
      const {result} = renderHook(() =>
        tracker.useInteractionModalityTracking(),
      );
      const secondDocument = document.implementation.createHTMLDocument();
      const cleanup = result.current.ref(secondDocument.createElement('div'));
      secondDocument.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab'}));
      document.dispatchEvent(new Event('pointerdown'));
      expect(result.current.readModality()).toBe('keyboard');
      cleanup?.();
      expect(result.current.readModality()).toBe('pointer');
    });
  });

  it('uses the keyboard-safe default without a document', async () => {
    vi.stubGlobal('document', undefined);
    const serverModule = await loadTracker();

    expect(serverModule.getInteractionModality()).toBe('keyboard');
    expect(() =>
      serverModule.__startInteractionModalityTrackingForTest()(),
    ).not.toThrow();
  });
});
